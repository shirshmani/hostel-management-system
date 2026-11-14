// routes/admins.js - admin accounts (ADMIN only)
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { setFlash, friendlyError, text, toInt, wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('ADMIN'));

router.get('/', wrap(async function (req, res) {
  const admins = await query("SELECT user_id, username FROM user_account WHERE role = 'ADMIN' ORDER BY user_id");
  res.render('admins', { title: 'Admin accounts', admins });
}));

// add an admin, first password = username
router.post('/', wrap(async function (req, res) {
  const username = text(req.body.username);
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    setFlash(req, 'error', 'Username must be 3 to 50 letters, digits, dots, dashes or underscores.');
  } else {
    try {
      const hash = await bcrypt.hash(username, 10);
      await query('INSERT INTO user_account (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'ADMIN']);
      setFlash(req, 'success', 'Admin added. The password is the same as the username.');
    } catch (err) {
      setFlash(req, 'error', friendlyError(err, 'username'));
    }
  }
  res.redirect('/admins');
}));

router.post('/:id/reset-password', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const rows = await query("SELECT username FROM user_account WHERE user_id = ? AND role = 'ADMIN'", [id]);
  if (!rows[0]) {
    setFlash(req, 'error', 'Admin not found.');
  } else {
    const hash = await bcrypt.hash(rows[0].username, 10);
    await query('UPDATE user_account SET password_hash = ? WHERE user_id = ?', [hash, id]);
    setFlash(req, 'success', 'Password reset. The password is now the same as the username.');
  }
  res.redirect('/admins');
}));

router.post('/:id/delete', wrap(async function (req, res) {
  const id = toInt(req.params.id);
  const count = await query("SELECT COUNT(*) AS n FROM user_account WHERE role = 'ADMIN'");
  if (id === req.session.user.userId) {
    setFlash(req, 'error', 'You cannot delete your own account.');
  } else if (count[0].n <= 1) {
    setFlash(req, 'error', 'You cannot delete the last admin.');
  } else {
    const result = await query("DELETE FROM user_account WHERE user_id = ? AND role = 'ADMIN'", [id]);
    setFlash(req, result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Admin deleted.' : 'Admin not found.');
  }
  res.redirect('/admins');
}));

module.exports = router;