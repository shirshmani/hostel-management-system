// routes/hostels.js - hostels and departments on one page (ADMIN only)
const express = require('express');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('ADMIN'));

// check the hostel form, returns the cleaned values and an error message (or null)
function readHostel(body) {
  const h = { name: text(body.hostel_name), type: body.gender_type, error: null };
  if (!h.name || h.name.length > 50) h.error = 'Hostel name is required (up to 50 characters).';
  else if (h.type !== 'M' && h.type !== 'F') h.error = 'Choose Boys or Girls.';
  return h;
}

// check the department form
function readDepartment(body) {
  const d = { name: text(body.dept_name), code: text(body.dept_code).toUpperCase(), error: null };
  if (!d.name || d.name.length > 80) d.error = 'Department name is required (up to 80 characters).';
  else if (!d.code || d.code.length > 10) d.error = 'Department code is required (up to 10 characters).';
  return d;
}

// show both lists
router.get('/', wrap(async function (req, res) {
  // hostels with the number of rooms and students living in them (LEFT JOINs keep empty hostels)
  const hostels = await query(
    `SELECT h.hostel_id, h.hostel_name, h.gender_type,
            COUNT(DISTINCT r.room_id) AS rooms, COUNT(s.roll_no) AS students
     FROM hostel h
     LEFT JOIN room r    ON r.hostel_id = h.hostel_id
     LEFT JOIN student s ON s.room_id   = r.room_id
     GROUP BY h.hostel_id, h.hostel_name, h.gender_type
     ORDER BY h.hostel_id`);
  // departments with the number of students
  const departments = await query(
    `SELECT d.dept_id, d.dept_name, d.dept_code, COUNT(s.roll_no) AS students
     FROM department d LEFT JOIN student s ON s.dept_id = d.dept_id
     GROUP BY d.dept_id, d.dept_name, d.dept_code
     ORDER BY d.dept_name`);
  res.render('hostels', { title: 'Hostels & Departments', hostels, departments });
}));

// ---------- hostels ----------
router.post('/', wrap(async function (req, res) {
  const h = readHostel(req.body);
  if (h.error) {
    setFlash(req, 'error', h.error);
  } else {
    try {
      await query('INSERT INTO hostel (hostel_name, gender_type) VALUES (?, ?)', [h.name, h.type]);
      setFlash(req, 'success', 'Hostel added.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'hostel'));
    }
  }
  res.redirect('/hostels');
}));

router.post('/departments', wrap(async function (req, res) {
  const d = readDepartment(req.body);
  if (d.error) {
    setFlash(req, 'error', d.error);
  } else {
    try {
      await query('INSERT INTO department (dept_name, dept_code) VALUES (?, ?)', [d.name, d.code]);
      setFlash(req, 'success', 'Department added.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'department'));
    }
  }
  res.redirect('/hostels');
}));

router.post('/departments/:id/update', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const d = readDepartment(req.body);
  if (id === null || d.error) {
    setFlash(req, 'error', d.error || 'Department not found.');
  } else {
    try {
      await query('UPDATE department SET dept_name = ?, dept_code = ? WHERE dept_id = ?', [d.name, d.code, id]);
      setFlash(req, 'success', 'Department saved.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'department'));
    }
  }
  res.redirect('/hostels');
}));

router.post('/departments/:id/delete', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  try {
    // the foreign key from student stops this if any student is in the department
    const result = await query('DELETE FROM department WHERE dept_id = ?', [id]);
    setFlash(req, result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Department deleted.' : 'Department not found.');
  } catch (err) {
    setFlash(req, 'error', friendlyError(err, 'department'));
  }
  res.redirect('/hostels');
}));

router.post('/:id/update', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const h = readHostel(req.body);
  if (id === null || h.error) {
    setFlash(req, 'error', h.error || 'Hostel not found.');
  } else {
    try {
      // the type changes only if no student of the other gender lives in this hostel (subquery)
      const result = await query(
        `UPDATE hostel SET hostel_name = ?, gender_type = ?
         WHERE hostel_id = ?
           AND NOT EXISTS (SELECT 1 FROM student s JOIN room r ON r.room_id = s.room_id
                           WHERE r.hostel_id = ? AND s.gender <> ?)`,
        [h.name, h.type, id, id, h.type]);
      if (result.affectedRows === 0) {
        setFlash(req, 'error', 'Cannot change the hostel type while students of the other gender live there.');
      } else {
        setFlash(req, 'success', 'Hostel saved.');
      }
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'hostel'));
    }
  }
  res.redirect('/hostels');
}));

router.post('/:id/delete', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  try {
    // rooms and wardens point to the hostel, so the foreign key blocks this while they exist
    const result = await query('DELETE FROM hostel WHERE hostel_id = ?', [id]);
    setFlash(req, result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Hostel deleted.' : 'Hostel not found.');
  } catch (err) {
    setFlash(req, 'error', friendlyError(err, 'hostel'));
  }
  res.redirect('/hostels');
}));

module.exports = router;