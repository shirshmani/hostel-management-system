// routes/students.js - students and their logins
// The list is for ADMIN and WARDEN (a warden sees only their own hostel). Everything else is ADMIN only.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, query } = require('../db');
const { setFlash, friendlyError, text, toInt, isPhone, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// check the student form, returns the cleaned values and an error message (or null)
function readStudent(body, isNew) {
  const nextYear = new Date().getFullYear() + 1;
  const s = {
    roll_no: text(body.roll_no).toUpperCase(),
    name: text(body.name),
    gender: body.gender,
    admission_year: toInt(body.admission_year),
    dept_id: toInt(body.dept_id),
    status: body.status || 'ON_CAMPUS',
    phone: text(body.phone),
    error: null
  };
  if (isNew && !/^[A-Z0-9]{4,10}$/.test(s.roll_no)) s.error = 'Roll number must be 4 to 10 letters or digits.';
  else if (!s.name || s.name.length > 100) s.error = 'Name is required (up to 100 characters).';
  else if (s.gender !== 'M' && s.gender !== 'F') s.error = 'Choose a gender.';
  else if (!s.admission_year || s.admission_year < 2000 || s.admission_year > nextYear) s.error = 'Admission year must be between 2000 and ' + nextYear + '.';
  else if (!s.dept_id) s.error = 'Choose a department.';
  else if (s.status !== 'ON_CAMPUS' && s.status !== 'ON_LEAVE') s.error = 'Choose a status.';
  else if (!isPhone(s.phone)) s.error = 'Phone must be exactly 10 digits (or empty).';
  return s;
}

// show the add / edit form, with an error message when there is one
async function showForm(res, mode, student, error) {
  const departments = await query('SELECT dept_id, dept_name FROM department ORDER BY dept_name');
  if (error) res.locals.flash = { type: 'error', text: error };
  res.status(error ? 400 : 200).render('student-form', { title: mode === 'add' ? 'Add student' : 'Edit student', mode, student, departments });
}

// list with search and department filter
router.get('/', requireRole('ADMIN', 'WARDEN'), wrap(async function (req, res) {
  const q = text(req.query.q);
  const deptId = toInt(req.query.dept);

  // v_student_details already joins department, room and hostel and adds the pending dues
  let sql = 'SELECT * FROM v_student_details WHERE 1 = 1';
  const params = [];
  if (req.session.user.role === 'WARDEN') {          // the hostel comes from the session, never from the request
    sql += ' AND hostel_id = ?';
    params.push(req.session.user.hostelId);
  }
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';   // a typed % or _ is searched as a normal character
    sql += ' AND (name LIKE ? OR roll_no LIKE ?)';
    params.push(like, like);
  }
  if (deptId) {
    sql += ' AND dept_id = ?';
    params.push(deptId);
  }
  sql += ' ORDER BY roll_no';
  const students = await query(sql, params);

  const departments = await query('SELECT dept_id, dept_name FROM department ORDER BY dept_name');
  res.render('students', { title: 'Students', students, departments, q, deptId });
}));

router.get('/new', requireRole('ADMIN'), wrap(async function (req, res) {
  await showForm(res, 'add', { roll_no: '', name: '', gender: 'M', admission_year: new Date().getFullYear(), dept_id: null, status: 'ON_CAMPUS', phone: '' });
}));

// add a student and the login together: one transaction, so both rows are saved or neither
router.post('/', requireRole('ADMIN'), wrap(async function (req, res) {
  const s = readStudent(req.body, true);
  if (s.error) return showForm(res, 'add', s, s.error);

  const hash = await bcrypt.hash(s.roll_no, 10);       // first password = roll number
  const conn = await pool.getConnection();
  let failure = null;
  try {
    await conn.beginTransaction();
    await conn.execute(
      'INSERT INTO student (roll_no, name, gender, admission_year, status, dept_id, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.roll_no, s.name, s.gender, s.admission_year, s.status, s.dept_id, s.phone || null]);
    await conn.execute('INSERT INTO user_account (username, password_hash, role, roll_no) VALUES (?, ?, ?, ?)',
      [s.roll_no, hash, 'STUDENT', s.roll_no]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    failure = friendlyError(err, 'student');
  } finally {
    conn.release();
  }
  if (failure) return showForm(res, 'add', s, failure);

  setFlash(req, 'success', 'Student added. Login: ' + s.roll_no + ' (the password is the roll number).');
  res.redirect('/students');
}));

router.get('/:roll/edit', requireRole('ADMIN'), wrap(async function (req, res) {
  const rows = await query('SELECT roll_no, name, gender, admission_year, dept_id, status, phone FROM student WHERE roll_no = ?', [req.params.roll]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Student not found.');
    return res.redirect('/students');
  }
  await showForm(res, 'edit', rows[0]);
}));

router.post('/:roll/update', requireRole('ADMIN'), wrap(async function (req, res) {
  const s = readStudent(req.body, false);
  s.roll_no = req.params.roll;
  if (s.error) return showForm(res, 'edit', s, s.error);
  try {
    // if the gender changes for a student who has a room, before_student_update raises "Gender does not match the hostel"
    const result = await query(
      'UPDATE student SET name = ?, gender = ?, admission_year = ?, dept_id = ?, status = ?, phone = ? WHERE roll_no = ?',
      [s.name, s.gender, s.admission_year, s.dept_id, s.status, s.phone || null, s.roll_no]);
    if (result.affectedRows === 0) {
      setFlash(req, 'error', 'Student not found.');
      return res.redirect('/students');
    }
  } catch (err) {
    return showForm(res, 'edit', s, friendlyError(err, 'student'));
  }
  setFlash(req, 'success', 'Student saved.');
  res.redirect('/students');
}));

router.post('/:roll/delete', requireRole('ADMIN'), wrap(async function (req, res) {
  try {
    // trg_student_before_delete refuses with "Student has pending fees"; otherwise login, complaints and fees cascade
    const result = await query('DELETE FROM student WHERE roll_no = ?', [req.params.roll]);
    setFlash(req, result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Student deleted.' : 'Student not found.');
  } catch (err) {
    setFlash(req, 'error', friendlyError(err, 'student'));
  }
  res.redirect('/students');
}));

// reset the password back to the roll number
router.post('/:roll/reset-password', requireRole('ADMIN'), wrap(async function (req, res) {
  const rows = await query('SELECT roll_no FROM student WHERE roll_no = ?', [req.params.roll]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Student not found.');
  } else {
    const hash = await bcrypt.hash(rows[0].roll_no, 10);
    const result = await query('UPDATE user_account SET password_hash = ? WHERE roll_no = ?', [hash, rows[0].roll_no]);
    setFlash(req, result.affectedRows ? 'success' : 'error',
      result.affectedRows ? 'Password reset. The password is now the roll number.' : 'This student has no login.');
  }
  res.redirect('/students');
}));

module.exports = router;