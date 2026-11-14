// routes/dashboard.js - admin / warden dashboard and the student home page
const express = require('express');
const { query } = require('../db');
const { wrap, money } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// "/" sends each role to its own start page
router.get('/', function (req, res) {
  if (!req.session.user) return res.redirect('/login');
  res.redirect(req.session.user.role === 'STUDENT' ? '/home' : '/dashboard');
});

// Admin sees the whole system, a warden sees only the hostel stored in the session
router.get('/dashboard', requireRole('ADMIN', 'WARDEN'), wrap(async function (req, res) {
  const user = req.session.user;
  const isWarden = user.role === 'WARDEN';
  const scoped = isWarden ? [user.hostelId] : [];      // parameters for the scoped queries below

  // ----- stat cards -----
  let people;
  if (isWarden) {
    const residents = await query('SELECT COUNT(*) AS n FROM v_student_details WHERE hostel_id = ?', scoped);
    // students without a room whose gender matches this hostel (subquery)
    const waiting = await query(
      'SELECT COUNT(*) AS n FROM student WHERE room_id IS NULL AND gender = (SELECT gender_type FROM hostel WHERE hostel_id = ?)', scoped);
    people = { label: 'Residents', value: residents[0].n, sub: waiting[0].n + ' waiting for this hostel' };
  } else {
    const all = await query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(room_id IS NOT NULL), 0) AS allocated, COALESCE(SUM(room_id IS NULL), 0) AS waiting FROM student`);
    people = { label: 'Students', value: all[0].total, sub: Number(all[0].allocated) + ' allocated, ' + Number(all[0].waiting) + ' waiting' };
  }

  const roomRows = await query(
    `SELECT COALESCE(SUM(vacancies = 0), 0) AS rooms_full, COALESCE(SUM(vacancies > 0), 0) AS rooms_free,
            COALESCE(SUM(capacity), 0) AS beds, COALESCE(SUM(occupied), 0) AS occupied
     FROM room_occupancy` + (isWarden ? ' WHERE hostel_id = ?' : ''), scoped);
  const rooms = roomRows[0];

  const openRows = await query(
    `SELECT COUNT(*) AS n FROM complaint c JOIN room r ON r.room_id = c.room_id
     WHERE c.status = 'OPEN'` + (isWarden ? ' AND r.hostel_id = ?' : ''), scoped);

  // fees per state (the view works out PAID / OVERDUE / PENDING)
  const feeRows = await query(
    'SELECT state, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM v_fee_report' +
    (isWarden ? ' WHERE hostel_id = ?' : '') + ' GROUP BY state', scoped);
  const fee = { PAID: { n: 0, total: 0 }, PENDING: { n: 0, total: 0 }, OVERDUE: { n: 0, total: 0 } };
  feeRows.forEach(function (r) { fee[r.state] = { n: r.n, total: Number(r.total) }; });

  const cards = [
    { label: people.label, value: people.value, sub: people.sub, icon: 'students', accent: 'primary' },
    { label: 'Rooms', value: Number(rooms.rooms_full) + Number(rooms.rooms_free), sub: Number(rooms.rooms_full) + ' full, ' + Number(rooms.rooms_free) + ' with free beds', icon: 'rooms', accent: 'info' },
    { label: 'Beds used', value: Number(rooms.occupied) + ' / ' + Number(rooms.beds), sub: 'occupied of total beds', icon: 'hostel', accent: 'success' },
    { label: 'Open complaints', value: openRows[0].n, sub: 'waiting for action', icon: 'complaints', accent: 'warning' },
    { label: 'Fees collected', value: money(fee.PAID.total), sub: fee.PAID.n + ' fee(s) paid', icon: 'fees', accent: 'success' },
    { label: 'Fees pending', value: money(fee.PENDING.total), sub: fee.PENDING.n + ' fee(s) not yet due', icon: 'fees', accent: 'warning' },
    { label: 'Fees overdue', value: money(fee.OVERDUE.total), sub: fee.OVERDUE.n + ' fee(s) overdue', icon: 'fees', accent: 'danger' }
  ];

  // ----- occupancy per hostel (a warden gets only the own hostel) -----
  const occupancy = (await query(
    `SELECT hostel_id, hostel_name, SUM(occupied) AS occupied, SUM(capacity) AS beds,
            ROUND(100 * SUM(occupied) / SUM(capacity), 1) AS pct
     FROM room_occupancy` + (isWarden ? ' WHERE hostel_id = ?' : '') + ` GROUP BY hostel_id, hostel_name ORDER BY hostel_id`, scoped))
    .map(function (h) { return { hostel_id: h.hostel_id, hostel_name: h.hostel_name, occupied: Number(h.occupied), beds: Number(h.beds), pct: Number(h.pct) }; });

  // Query 1 (HAVING): hostels more than 80% full
  const over80 = (await query(
    `SELECT hostel_name, ROUND(100 * SUM(occupied) / SUM(capacity), 1) AS pct
     FROM room_occupancy` + (isWarden ? ' WHERE hostel_id = ?' : '') + ` GROUP BY hostel_id, hostel_name
     HAVING SUM(occupied) / SUM(capacity) > 0.8`, scoped))
    .map(function (h) { return { hostel_name: h.hostel_name, pct: Number(h.pct) }; });

  // Query 3 (window function RANK): always over all hostels, a warden only reads the own row
  const ranks = await query(
    `SELECT hostel_id, RANK() OVER (ORDER BY SUM(occupied) / SUM(capacity) DESC) AS occupancy_rank
     FROM room_occupancy GROUP BY hostel_id`);
  occupancy.forEach(function (h) {
    const row = ranks.find(function (r) { return r.hostel_id === h.hostel_id; });
    h.rank = row ? Number(row.occupancy_rank) : null;
    h.rankOf = ranks.length;
  });

  // ----- chart data -----
  const nice = function (word) { return word.charAt(0) + word.slice(1).toLowerCase().replace('_', ' '); };

  const byStatus = await query(
    'SELECT c.status, COUNT(*) AS n FROM complaint c' +
    (isWarden ? ' JOIN room r ON r.room_id = c.room_id WHERE r.hostel_id = ?' : '') + ' GROUP BY c.status', scoped);
  const byCategory = await query(
    'SELECT c.category, COUNT(*) AS n FROM complaint c' +
    (isWarden ? ' JOIN room r ON r.room_id = c.room_id WHERE r.hostel_id = ?' : '') + ' GROUP BY c.category', scoped);

  // fees collected vs pending per hostel (pending includes overdue)
  const byHostel = await query(
    `SELECT hostel_name,
            SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END) AS collected,
            SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) AS pending
     FROM v_fee_report WHERE hostel_id IS NOT NULL` + (isWarden ? ' AND hostel_id = ?' : '') +
    ` GROUP BY hostel_id, hostel_name ORDER BY hostel_id`, scoped);

  // Query 4 (running total with a window function): fees collected so far, day by day
  const running = await query(
    `SELECT paid_on, SUM(SUM(amount)) OVER (ORDER BY paid_on) AS running_total
     FROM v_fee_report WHERE status = 'PAID'` + (isWarden ? ' AND hostel_id = ?' : '') +
    ` GROUP BY paid_on ORDER BY paid_on`, scoped);

  // Query 6 (recursive CTE): complaints per day for the last 7 days, days with none included
  const days = await query(
    `WITH RECURSIVE days AS (
       SELECT CURDATE() - INTERVAL 6 DAY AS day
       UNION ALL
       SELECT day + INTERVAL 1 DAY FROM days WHERE day < CURDATE()
     )
     SELECT DATE_FORMAT(d.day, '%d %b') AS label, COUNT(c.complaint_id) AS complaints
     FROM days d
     LEFT JOIN complaint c ON DATE(c.created_at) = d.day` +
    (isWarden ? ' AND c.room_id IN (SELECT room_id FROM room WHERE hostel_id = ?)' : '') +
    ` GROUP BY d.day ORDER BY d.day`, scoped);

  const data = {
    status: { labels: byStatus.map(function (r) { return nice(r.status); }), values: byStatus.map(function (r) { return r.n; }) },
    category: { labels: byCategory.map(function (r) { return nice(r.category); }), values: byCategory.map(function (r) { return r.n; }) },
    fees: {
      labels: byHostel.map(function (r) { return r.hostel_name; }),
      collected: byHostel.map(function (r) { return Number(r.collected); }),
      pending: byHostel.map(function (r) { return Number(r.pending); })
    },
    running: { labels: running.map(function (r) { return r.paid_on; }), values: running.map(function (r) { return Number(r.running_total); }) },
    days: { labels: days.map(function (r) { return r.label; }), values: days.map(function (r) { return r.complaints; }) }
  };

  res.render('dashboard', { title: 'Dashboard', cards, occupancy, over80, data });
}));

// Student home page: everything is looked up with the roll number from the session
router.get('/home', requireRole('STUDENT'), wrap(async function (req, res) {
  const roll = req.session.user.rollNo;

  const details = await query(
    `SELECT roll_no, name, dept_name, status, hostel_name, room_number, floor, check_in_date, check_out_date
     FROM v_student_details WHERE roll_no = ?`, [roll]);
  if (!details[0]) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'Your student record was not found.', bare: false });
  }

  // roommates: the student table joined with itself (same room, different roll number)
  const roommates = await query(
    `SELECT s2.roll_no, s2.name, d.dept_code
     FROM student s1
     JOIN student s2 ON s1.room_id = s2.room_id AND s1.roll_no <> s2.roll_no
     JOIN department d ON d.dept_id = s2.dept_id
     WHERE s1.roll_no = ? ORDER BY s2.name`, [roll]);

  const dues = await query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS pending FROM v_fee_report WHERE roll_no = ? AND status = 'PENDING'`, [roll]);
  const fees = await query(
    'SELECT fee_id, term, amount, due_date, status, paid_on, state FROM v_fee_report WHERE roll_no = ? ORDER BY due_date DESC LIMIT 3', [roll]);
  const complaints = await query(
    `SELECT complaint_id, category, description, status, admin_remarks, created_at
     FROM complaint WHERE roll_no = ? ORDER BY created_at DESC, complaint_id DESC LIMIT 3`, [roll]);

  res.render('student-home', { title: 'Home', me: details[0], roommates, dues: dues[0], fees, complaints });
}));

module.exports = router;