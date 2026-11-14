// routes/wardens.js - wardens and their logins (ADMIN only)
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, query } = require('../db');
const { setFlash, friendlyError, text, toInt, isPhone, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('ADMIN'));

// check the warden form, returns the cleaned values and an error message (or null)
function readWarden(body, isNew) {
  const w = { name: text(body.name), phone: text(body.phone), hostel_id: toInt(body.hostel_id), username: text(body.username), error: null };
  if (!w.name || w.name.length > 100) w.error = 'Name is required (up to 100 characters).';
  else if (!isPhone(w.phone)) w.error = 'Phone must be exactly 10 digits (or empty).';
  else if (!w.hostel_id) w.error = 'Choose a hostel.';
  else if (isNew && !/^[A-Za-z0-9._-]{3,50}$/.test(w.username)) w.error = 'Username must be 3 to 50 letters, digits, dots, dashes or underscores.';
  return w;
}

// show the add / edit form, with an error message when there is one
async function showForm(res, mode, warden, error) {
  const hostels = await query('SELECT hostel_id, hostel_name FROM hostel ORDER BY hostel_id');
  if (error) res.locals.flash = { type: 'error', text: error };
  res.status(error ? 400 : 200).render('warden-form', { title: mode === 'add' ? 'Add warden' : 'Edit warden', mode, warden, hostels });
}

router.get('/', wrap(async function (req, res) {
  // each warden with the hostel name and the login name (LEFT JOIN: a warden might have no login)
  const wardens = await query(
    `SELECT w.warden_id, w.name, w.phone, h.hostel_name, u.username
     FROM warden w
     JOIN hostel h ON h.hostel_id = w.hostel_id
     LEFT JOIN user_account u ON u.warden_id = w.warden_id
     ORDER BY w.warden_id`);
  res.render('wardens', { title: 'Wardens', wardens });
}));

router.get('/new', wrap(async function (req, res) {
  await showForm(res, 'add', { name: '', phone: '', hostel_id: null, username: '' });
}));

// add a warden and the login together: one transaction, so both rows are saved or neither
router.post('/', wrap(async function (req, res) {
  const w = readWarden(req.body, true);
  if (w.error) return showForm(res, 'add', w, w.error);

  const hash = await bcrypt.hash(w.username, 10);          // first password = username
  const conn = await pool.getConnection();
  let failure = null;
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute('INSERT INTO warden (name, phone, hostel_id) VALUES (?, ?, ?)', [w.name, w.phone || null, w.hostel_id]);
    await conn.execute('INSERT INTO user_account (username, password_hash, role, warden_id) VALUES (?, ?, ?, ?)',
      [w.username, hash, 'WARDEN', result.insertId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    failure = friendlyError(err, 'username');
  } finally {
    conn.release();
  }
  if (failure) return showForm(res, 'add', w, failure);

  setFlash(req, 'success', 'Warden added. Login: ' + w.username + ' (the password is the same as the username).');
  res.redirect('/wardens');
}));

router.get('/:id/edit', wrap(async function (req, res) {
  const rows = await query(
    `SELECT w.warden_id, w.name, w.phone, w.hostel_id, u.username
     FROM warden w LEFT JOIN user_account u ON u.warden_id = w.warden_id WHERE w.warden_id = ?`, [toInt(req.params.id)]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Warden not found.');
    return res.redirect('/wardens');
  }
  await showForm(res, 'edit', rows[0]);
}));

router.post('/:id/update', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const w = readWarden(req.body, false);
  w.warden_id = id;
  w.username = text(req.body.username_shown);
  if (w.error) return showForm(res, 'edit', w, w.error);
  try {
    const result = await query('UPDATE warden SET name = ?, phone = ?, hostel_id = ? WHERE warden_id = ?', [w.name, w.phone || null, w.hostel_id, id]);
    if (result.affectedRows === 0) {
      setFlash(req, 'error', 'Warden not found.');
      return res.redirect('/wardens');
    }
  } catch (err) {
    return showForm(res, 'edit', w, friendlyError(err, 'warden'));
  }
  setFlash(req, 'success', 'Warden saved. If the hostel changed, the warden must log in again.');
  res.redirect('/wardens');
}));

router.post('/:id/delete', wrap(async function (req, res) {
  try {
    // the login is removed too (ON DELETE CASCADE on user_account.warden_id)
    const result = await query('DELETE FROM warden WHERE warden_id = ?', [toInt(req.params.id)]);
    setFlash(req, result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Warden and login deleted.' : 'Warden not found.');
  } catch (err) {
    setFlash(req, 'error', friendlyError(err, 'warden'));
  }
  res.redirect('/wardens');
}));

// reset the password back to the username
router.post('/:id/reset-password', wrap(async function (req, res) {
  const rows = await query('SELECT username FROM user_account WHERE warden_id = ?', [toInt(req.params.id)]);
  if (!rows[0]) {
    setFlash(req, 'error', 'This warden has no login.');
  } else {
    const hash = await bcrypt.hash(rows[0].username, 10);
    await query('UPDATE user_account SET password_hash = ? WHERE warden_id = ?', [hash, toInt(req.params.id)]);
    setFlash(req, 'success', 'Password reset. The password is now the same as the username (' + rows[0].username + ').');
  }
  res.redirect('/wardens');
}));

module.exports = router;