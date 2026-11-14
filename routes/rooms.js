// routes/rooms.js - rooms, listed from the room_occupancy view (ADMIN only)
const express = require('express');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('ADMIN'));

// check the room form, returns the cleaned values and an error message (or null)
function readRoom(body) {
  const room = {
    hostel_id: toInt(body.hostel_id),
    room_number: text(body.room_number),
    floor: toInt(body.floor),
    capacity: toInt(body.capacity),
    fee_per_term: Number(body.fee_per_term === '' ? 0 : body.fee_per_term),
    error: null
  };
  if (!room.hostel_id) room.error = 'Choose a hostel.';
  else if (!room.room_number || room.room_number.length > 10) room.error = 'Room number is required (up to 10 characters).';
  else if (room.floor === null || room.floor < 0 || room.floor > 20) room.error = 'Floor must be a number from 0 to 20.';
  else if (![1, 2, 3].includes(room.capacity)) room.error = 'Capacity must be 1, 2 or 3.';
  else if (!(room.fee_per_term >= 0) || room.fee_per_term > 999999) room.error = 'Fee must be a number from 0 to 999999.';
  return room;
}

// show the add / edit form, with an error message when there is one
async function showForm(res, mode, room, error) {
  const hostels = await query('SELECT hostel_id, hostel_name FROM hostel ORDER BY hostel_id');
  if (error) res.locals.flash = { type: 'error', text: error };
  res.status(error ? 400 : 200).render('room-form', { title: mode === 'add' ? 'Add room' : 'Edit room', mode, room, hostels });
}

// list, optionally for one hostel
router.get('/', wrap(async function (req, res) {
  const hostelId = toInt(req.query.hostel);
  const hostels = await query('SELECT hostel_id, hostel_name FROM hostel ORDER BY hostel_id');

  // the view already counts occupied beds and vacancies for every room
  let sql = 'SELECT * FROM room_occupancy';
  const params = [];
  if (hostelId) {
    sql += ' WHERE hostel_id = ?';
    params.push(hostelId);
  }
  sql += ' ORDER BY hostel_id, floor, room_number';
  const rooms = await query(sql, params);

  res.render('rooms', { title: 'Rooms', rooms, hostels, hostelId });
}));

router.get('/new', wrap(async function (req, res) {
  await showForm(res, 'add', { hostel_id: toInt(req.query.hostel), room_number: '', floor: 1, capacity: 2, fee_per_term: 15000, occupied: 0 });
}));

router.post('/', wrap(async function (req, res) {
  const room = readRoom(req.body);
  if (room.error) return showForm(res, 'add', room, room.error);
  try {
    await query('INSERT INTO room (hostel_id, room_number, floor, capacity, fee_per_term) VALUES (?, ?, ?, ?, ?)',
      [room.hostel_id, room.room_number, room.floor, room.capacity, room.fee_per_term]);
  } catch (err) {
    return showForm(res, 'add', room, friendlyError(err, 'room'));
  }
  setFlash(req, 'success', 'Room added.');
  res.redirect('/rooms?hostel=' + room.hostel_id);
}));

router.get('/:id/edit', wrap(async function (req, res) {
  const rows = await query('SELECT * FROM room_occupancy WHERE room_id = ?', [toInt(req.params.id)]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Room not found.');
    return res.redirect('/rooms');
  }
  await showForm(res, 'edit', rows[0]);
}));

router.post('/:id/update', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const room = readRoom(req.body);
  room.room_id = id;

  // how many students live here now, and in which hostel is the room
  const rows = await query('SELECT hostel_id, occupied FROM room_occupancy WHERE room_id = ?', [id]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Room not found.');
    return res.redirect('/rooms');
  }
  room.occupied = rows[0].occupied;

  if (room.error) return showForm(res, 'edit', room, room.error);
  if (room.capacity < rows[0].occupied) {
    return showForm(res, 'edit', room, 'Capacity cannot be less than the ' + rows[0].occupied + ' student(s) living in this room.');
  }
  if (room.hostel_id !== rows[0].hostel_id && rows[0].occupied > 0) {
    return showForm(res, 'edit', room, 'A room with students cannot move to another hostel.');
  }

  try {
    await query('UPDATE room SET hostel_id = ?, room_number = ?, floor = ?, capacity = ?, fee_per_term = ? WHERE room_id = ?',
      [room.hostel_id, room.room_number, room.floor, room.capacity, room.fee_per_term, id]);
  } catch (err) {
    return showForm(res, 'edit', room, friendlyError(err, 'room'));
  }
  setFlash(req, 'success', 'Room saved.');
  res.redirect('/rooms?hostel=' + room.hostel_id);
}));

router.post('/:id/delete', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const rows = await query('SELECT occupied FROM room_occupancy WHERE room_id = ?', [id]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Room not found.');
  } else if (rows[0].occupied > 0) {
    // checked here because student.room_id is ON DELETE SET NULL: the database would silently empty the room
    setFlash(req, 'error', 'Cannot delete this room. Students are living in it.');
  } else {
    try {
      await query('DELETE FROM room WHERE room_id = ?', [id]);   // complaints still point to a room: the foreign key blocks it
      setFlash(req, 'success', 'Room deleted.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'room'));
    }
  }
  res.redirect('/rooms');
}));

module.exports = router;