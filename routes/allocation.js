// routes/allocation.js - allocate, move and vacate students, room map, year-end checkout
const express = require('express');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, isDate, today, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('ADMIN', 'WARDEN'));

// Which hostel is this request about? A warden is fixed to the own hostel (session), an admin chooses.
function hostelFor(req) {
  if (req.session.user.role === 'WARDEN') return req.session.user.hostelId;
  return toInt(req.body.hostel_id || req.query.hostel);
}

// flash a message and go back to the allocation page of that hostel
function back(req, res, hostelId, type, message) {
  setFlash(req, type, message);
  res.redirect('/allocation' + (hostelId ? '?hostel=' + hostelId : ''));
}

router.get('/', wrap(async function (req, res) {
  const hostels = await query('SELECT hostel_id, hostel_name, gender_type FROM hostel ORDER BY hostel_id');
  const wanted = hostelFor(req);
  let hostel = hostels.find(function (h) { return h.hostel_id === wanted; });
  if (!hostel && req.session.user.role === 'ADMIN') hostel = hostels[0];   // never fall back to another hostel for a warden
  if (!hostel) {
    setFlash(req, 'error', 'No hostel to show.');
    return res.redirect('/dashboard');
  }
  const hostelId = hostel.hostel_id;

  // rooms of this hostel with beds (room map and room selects)
  const rooms = await query(
    `SELECT room_id, room_number, floor, capacity, occupied, vacancies
     FROM room_occupancy WHERE hostel_id = ? ORDER BY floor, room_number`, [hostelId]);

  // students waiting for a room whose gender matches this hostel (subquery)
  const waiting = await query(
    `SELECT s.roll_no, s.name, s.admission_year FROM student s
     WHERE s.room_id IS NULL AND s.gender = (SELECT gender_type FROM hostel WHERE hostel_id = ?)
     ORDER BY s.roll_no`, [hostelId]);

  // students living in this hostel (the view already joins room and hostel)
  const residents = await query(
    `SELECT roll_no, name, room_number, floor, status, check_in_date
     FROM v_student_details WHERE hostel_id = ? ORDER BY room_number, roll_no`, [hostelId]);

  const freeRooms = rooms.filter(function (r) { return r.vacancies > 0; });
  res.render('allocation', {
    title: 'Allocation', hostels, hostel, rooms, freeRooms, waiting, residents,
    today: today(), thisYear: new Date().getFullYear()
  });
}));

// allocate a waiting student to a room
router.post('/allocate', wrap(async function (req, res) {
  const hostelId = hostelFor(req);
  const rollNo = text(req.body.roll_no);
  const roomId = toInt(req.body.room_id);
  const checkIn = text(req.body.check_in);

  if (!hostelId) return back(req, res, null, 'error', 'Choose a hostel.');
  if (!rollNo || !roomId) return back(req, res, hostelId, 'error', 'Choose a student and a room.');
  if (!isDate(checkIn)) return back(req, res, hostelId, 'error', 'Choose a valid check-in date.');
  if (checkIn > today()) return back(req, res, hostelId, 'error', 'Check-in date cannot be in the future.');

  try {
    // the procedure locks the room row, checks the room is in this hostel, then updates the student;
    // the triggers check gender and capacity
    await query('CALL sp_allocate_room(?, ?, ?, ?)', [rollNo, roomId, checkIn, hostelId]);
    back(req, res, hostelId, 'success', 'Room allocated.');
  } catch (err) {
    back(req, res, hostelId, 'error', friendlyError(err, 'student'));
  }
}));

// move a student to another room of the same hostel
router.post('/move', wrap(async function (req, res) {
  const hostelId = hostelFor(req);
  const rollNo = text(req.body.roll_no);
  const roomId = toInt(req.body.room_id);
  if (!hostelId) return back(req, res, null, 'error', 'Choose a hostel.');
  if (!rollNo || !roomId) return back(req, res, hostelId, 'error', 'Choose a student and a new room.');

  try {
    // the student's current room and the new room must both belong to this hostel, and the room must change
    const result = await query(
      `UPDATE student SET room_id = ?
       WHERE roll_no = ?
         AND room_id IN (SELECT room_id FROM room WHERE hostel_id = ?)
         AND ? IN (SELECT room_id FROM room WHERE hostel_id = ?)
         AND room_id <> ?`,
      [roomId, rollNo, hostelId, roomId, hostelId, roomId]);
    if (result.affectedRows === 0) {
      return back(req, res, hostelId, 'error', 'Cannot move: the student does not live in this hostel, the room is in another hostel, or it is the same room.');
    }
    back(req, res, hostelId, 'success', 'Student moved.');
  } catch (err) {
    back(req, res, hostelId, 'error', friendlyError(err, 'student'));   // "Room is full", "Gender does not match the hostel"
  }
}));

// vacate: the student leaves the room today
router.post('/vacate', wrap(async function (req, res) {
  const hostelId = hostelFor(req);
  const rollNo = text(req.body.roll_no);
  if (!hostelId) return back(req, res, null, 'error', 'Choose a hostel.');

  try {
    const result = await query(
      `UPDATE student SET room_id = NULL, check_out_date = CURDATE()
       WHERE roll_no = ? AND room_id IN (SELECT room_id FROM room WHERE hostel_id = ?)`,
      [rollNo, hostelId]);
    if (result.affectedRows === 0) return back(req, res, hostelId, 'error', 'That student does not live in this hostel.');
    back(req, res, hostelId, 'success', 'Student vacated.');
  } catch (err) {
    back(req, res, hostelId, 'error', friendlyError(err, 'student'));
  }
}));

// year-end checkout (admin only): vacate everyone admitted in or before a year, in all hostels
router.post('/year-end', requireRole('ADMIN'), wrap(async function (req, res) {
  const hostelId = hostelFor(req);
  const maxYear = toInt(req.body.max_year);
  if (maxYear === null || maxYear < 2000 || maxYear > new Date().getFullYear()) {
    return back(req, res, hostelId, 'error', 'Enter a year from 2000 up to this year.');
  }
  try {
    const result = await query('CALL sp_vacate_batch(?)', [maxYear]);   // result[0][0].vacated = how many
    back(req, res, hostelId, 'success', result[0][0].vacated + ' student(s) vacated.');
  } catch (err) {
    back(req, res, hostelId, 'error', friendlyError(err, 'student'));
  }
}));

module.exports = router;