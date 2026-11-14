// routes/complaints.js - students raise complaints, admin and warden handle them
const express = require('express');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, wrap } = require('../helpers');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['ELECTRICAL', 'PLUMBING', 'FURNITURE', 'CLEANING', 'INTERNET', 'OTHER'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

// list: a student sees their own, admin and warden see all (warden: own hostel only)
router.get('/', requireLogin, wrap(async function (req, res) {
  const user = req.session.user;

  if (user.role === 'STUDENT') {
    const complaints = await query(
      `SELECT complaint_id, category, description, status, admin_remarks, created_at, resolved_at
       FROM complaint WHERE roll_no = ? ORDER BY created_at DESC, complaint_id DESC`, [user.rollNo]);
    return res.render('complaints', { title: 'My complaints', complaints, openStudents: 0, statusFilter: '', q: '' });
  }

  const statusFilter = STATUSES.includes(req.query.status) ? req.query.status : '';
  const q = text(req.query.q);

  // complaint -> student, its room (the snapshot room) -> hostel
  let sql = `SELECT c.complaint_id, c.roll_no, s.name AS student_name, c.category, c.description, c.status,
                    c.admin_remarks, c.created_at, c.resolved_at, r.room_number, h.hostel_name
             FROM complaint c
             JOIN student s ON s.roll_no = c.roll_no
             JOIN room r    ON r.room_id = c.room_id
             JOIN hostel h  ON h.hostel_id = r.hostel_id
             WHERE 1 = 1`;
  const params = [];
  if (user.role === 'WARDEN') {                       // the hostel comes from the session
    sql += ' AND r.hostel_id = ?';
    params.push(user.hostelId);
  }
  if (statusFilter) {
    sql += ' AND c.status = ?';
    params.push(statusFilter);
  }
  if (q) {                                            // FULLTEXT keyword search
    sql += ' AND MATCH(c.description) AGAINST (? IN NATURAL LANGUAGE MODE)';
    params.push(q);
  }
  sql += ' ORDER BY c.created_at DESC, c.complaint_id DESC';
  const complaints = await query(sql, params);

  // how many students have an open complaint (correlated subquery with EXISTS)
  let countSql = `SELECT COUNT(*) AS n FROM student s
                  WHERE EXISTS (SELECT 1 FROM complaint c JOIN room r ON r.room_id = c.room_id
                                WHERE c.roll_no = s.roll_no AND c.status = 'OPEN'`;
  const countParams = [];
  if (user.role === 'WARDEN') {
    countSql += ' AND r.hostel_id = ?';
    countParams.push(user.hostelId);
  }
  countSql += ')';
  const count = await query(countSql, countParams);

  res.render('complaints', { title: 'Complaints', complaints, openStudents: count[0].n, statusFilter, q });
}));

// show the "raise a complaint" form (students only)
async function showNew(req, res, form, error) {
  // the student's current room comes from the view
  const rows = await query('SELECT room_id, room_number, hostel_name FROM v_student_details WHERE roll_no = ?', [req.session.user.rollNo]);
  if (error) res.locals.flash = { type: 'error', text: error };
  res.status(error ? 400 : 200).render('complaint-new', { title: 'Raise a complaint', room: rows[0], categories: CATEGORIES, form });
}

router.get('/new', requireRole('STUDENT'), wrap(async function (req, res) {
  await showNew(req, res, { category: '', description: '' });
}));

router.post('/', requireRole('STUDENT'), wrap(async function (req, res) {
  const form = { category: req.body.category, description: text(req.body.description) };
  if (!CATEGORIES.includes(form.category)) return showNew(req, res, form, 'Choose a category.');
  if (form.description.length < 5 || form.description.length > 1000) {
    return showNew(req, res, form, 'The description must be 5 to 1000 characters.');
  }
  try {
    // the database copies the student's current room into the complaint; a student without a room inserts nothing
    const result = await query(
      `INSERT INTO complaint (roll_no, room_id, category, description)
       SELECT roll_no, room_id, ?, ? FROM student WHERE roll_no = ? AND room_id IS NOT NULL`,
      [form.category, form.description, req.session.user.rollNo]);
    if (result.affectedRows === 0) return showNew(req, res, form, 'You do not have a room yet, so you cannot raise a complaint.');
  } catch (err) {
    return showNew(req, res, form, friendlyError(err, 'complaint'));
  }
  setFlash(req, 'success', 'Complaint raised.');
  res.redirect('/complaints');
}));

// admin / warden: change status and remarks. resolved_at is set by the trigger, not here.
router.post('/:id/update', requireRole('ADMIN', 'WARDEN'), wrap(async function (req, res) {
  const user = req.session.user;
  const id = toInt(req.params.id);
  const status = req.body.status;
  const remarks = text(req.body.admin_remarks);

  if (id === null || !STATUSES.includes(status)) {
    setFlash(req, 'error', 'Choose a valid status.');
  } else if (remarks.length > 1000) {
    setFlash(req, 'error', 'Remarks can have up to 1000 characters.');
  } else {
    let sql = 'UPDATE complaint SET status = ?, admin_remarks = ? WHERE complaint_id = ?';
    const params = [status, remarks || null, id];
    if (user.role === 'WARDEN') {                     // a warden may only change complaints of the own hostel
      sql += ' AND room_id IN (SELECT room_id FROM room WHERE hostel_id = ?)';
      params.push(user.hostelId);
    }
    try {
      const result = await query(sql, params);
      if (result.affectedRows === 0) setFlash(req, 'error', 'Complaint not found, or it belongs to another hostel.');
      else setFlash(req, 'success', 'Complaint updated.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'complaint'));
    }
  }
  res.redirect('/complaints');
}));

module.exports = router;