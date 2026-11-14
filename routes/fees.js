// routes/fees.js - fee list, generate a term, mark paid, receipt
const express = require('express');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, isDate, wrap } = require('../helpers');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
const STATES = ['PAID', 'OVERDUE', 'PENDING'];

router.get('/', requireLogin, wrap(async function (req, res) {
  const user = req.session.user;

  // a student sees only their own fees
  if (user.role === 'STUDENT') {
    const fees = await query(
      `SELECT fee_id, term, amount, due_date, status, paid_on, state
       FROM v_fee_report WHERE roll_no = ? ORDER BY due_date DESC`, [user.rollNo]);
    let pending = 0;
    fees.forEach(function (f) { if (f.status === 'PENDING') pending += Number(f.amount); });
    return res.render('fees', { title: 'My fees', fees, pending });
  }

  const stateFilter = STATES.includes(req.query.state) ? req.query.state : '';
  const termFilter = text(req.query.term);
  const isWarden = user.role === 'WARDEN';       // a warden sees only the own hostel (from the session)

  // the view gives the hostel and the state (PAID / OVERDUE / PENDING) of every fee
  let sql = `SELECT fee_id, roll_no, student_name, term, amount, due_date, status, paid_on, state, room_number, hostel_name
             FROM v_fee_report WHERE 1 = 1`;
  const params = [];
  if (isWarden) { sql += ' AND hostel_id = ?'; params.push(user.hostelId); }
  if (stateFilter) { sql += ' AND state = ?'; params.push(stateFilter); }
  if (termFilter) { sql += ' AND term = ?'; params.push(termFilter); }
  sql += " ORDER BY (state = 'OVERDUE') DESC, due_date, roll_no";
  const fees = await query(sql, params);

  // totals per state (GROUP BY with COUNT and SUM)
  const scope = isWarden ? ' WHERE hostel_id = ?' : '';
  const scopeParams = isWarden ? [user.hostelId] : [];
  const rows = await query(
    'SELECT state, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM v_fee_report' + scope + ' GROUP BY state', scopeParams);
  const summary = { PAID: { n: 0, total: 0 }, PENDING: { n: 0, total: 0 }, OVERDUE: { n: 0, total: 0 } };
  rows.forEach(function (r) { summary[r.state] = { n: r.n, total: Number(r.total) }; });

  // how long the overdue fees are overdue (CASE with DATEDIFF)
  const ageing = await query(
    `SELECT CASE WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 1 AND 7  THEN '1-7 days'
                 WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 8 AND 30 THEN '8-30 days'
                 ELSE 'Over 30 days' END AS bucket,
            COUNT(*) AS fees, SUM(amount) AS total
     FROM v_fee_report
     WHERE state = 'OVERDUE'` + (isWarden ? ' AND hostel_id = ?' : '') + `
     GROUP BY bucket
     ORDER BY MIN(DATEDIFF(CURDATE(), due_date))`, scopeParams);

  const terms = await query('SELECT DISTINCT term FROM fee ORDER BY term DESC');
  res.render('fees', { title: 'Fees', fees, summary, ageing, terms, stateFilter, termFilter });
}));

// admin: create the fees of one term for every student who has a room
router.post('/generate', requireRole('ADMIN'), wrap(async function (req, res) {
  const term = text(req.body.term);
  const due = text(req.body.due_date);
  if (!/^[A-Za-z0-9 _-]{3,20}$/.test(term)) {
    setFlash(req, 'error', 'Term must be 3 to 20 letters, digits, spaces, dashes or underscores (for example 2027-EVEN).');
  } else if (!isDate(due)) {
    setFlash(req, 'error', 'Choose a valid due date.');
  } else {
    try {
      // the procedure runs INSERT IGNORE ... SELECT in a transaction; the unique key (roll_no, term) skips duplicates
      const result = await query('CALL sp_generate_fees(?, ?)', [term, due]);
      const created = result[0][0].fees_created;
      setFlash(req, 'success', created > 0
        ? created + ' fee(s) created for term ' + term + '.'
        : 'No new fees. Everyone who has a room already has a fee for this term.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'fee'));
    }
  }
  res.redirect('/fees');
}));

// admin / warden: mark a fee as paid. paid_on is set by the trigger, not here.
router.post('/:id/pay', requireRole('ADMIN', 'WARDEN'), wrap(async function (req, res) {
  const user = req.session.user;
  let sql = "UPDATE fee SET status = 'PAID' WHERE fee_id = ? AND status = 'PENDING'";
  const params = [toInt(req.params.id)];
  if (user.role === 'WARDEN') {                  // only students who live in the warden's hostel
    sql += ' AND roll_no IN (SELECT s.roll_no FROM student s JOIN room r ON r.room_id = s.room_id WHERE r.hostel_id = ?)';
    params.push(user.hostelId);
  }
  try {
    const result = await query(sql, params);
    if (result.affectedRows === 0) setFlash(req, 'error', 'Fee not found, already paid, or not in your hostel.');
    else setFlash(req, 'success', 'Fee marked as paid.');
  } catch (err) {
    setFlash(req, 'error', friendlyError(err, 'fee'));
  }
  res.redirect('/fees');
}));

// receipt of a paid fee: a student sees only own, a warden only the own hostel
router.get('/:id/receipt', requireLogin, wrap(async function (req, res) {
  const user = req.session.user;
  let sql = `SELECT fee_id, roll_no, student_name, term, amount, paid_on, hostel_name, room_number
             FROM v_fee_report WHERE fee_id = ? AND status = 'PAID'`;
  const params = [toInt(req.params.id)];
  if (user.role === 'STUDENT') { sql += ' AND roll_no = ?'; params.push(user.rollNo); }
  if (user.role === 'WARDEN') { sql += ' AND hostel_id = ?'; params.push(user.hostelId); }
  const rows = await query(sql, params);
  if (!rows[0]) {
    return res.status(404).render('error', { title: 'Receipt not found', status: 404, message: 'There is no paid fee with this number that you may see.', bare: false });
  }
  const receiptNo = 'RCPT-' + String(rows[0].fee_id).padStart(5, '0');
  res.render('receipt', { title: 'Receipt', fee: rows[0], receiptNo });
}));

module.exports = router;