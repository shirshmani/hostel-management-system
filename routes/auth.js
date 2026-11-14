// routes/auth.js - login, logout, change own password
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { setFlash } = require('../helpers');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// Show the login page
router.get('/login', function (req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('login');
});

// Check the username and password
router.post('/login', async function (req, res, next) {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    // Find the login. LEFT JOINs because a student has no warden row and a warden has no student row.
    // The joins give us the display name and, for a warden, the hostel (scope for every later query).
    const rows = await query(
      `SELECT u.user_id, u.username, u.password_hash, u.role, u.roll_no, u.warden_id,
              COALESCE(s.name, w.name, u.username) AS display_name,
              w.hostel_id, h.hostel_name
       FROM user_account u
       LEFT JOIN student s ON s.roll_no   = u.roll_no
       LEFT JOIN warden  w ON w.warden_id = u.warden_id
       LEFT JOIN hostel  h ON h.hostel_id = w.hostel_id
       WHERE u.username = ?`,
      [username]
    );
    const row = rows[0];

    // same message for "no such user" and "wrong password", so nobody can guess usernames
    const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!ok) {
      setFlash(req, 'error', 'Invalid username or password.');
      return res.redirect('/login');
    }

    // new session id after login (prevents session fixation), then remember who this is
    req.session.regenerate(function (err) {
      if (err) return next(err);
      req.session.user = {
        userId: row.user_id,
        username: row.username,
        role: row.role,
        name: row.display_name,
        rollNo: row.roll_no,
        wardenId: row.warden_id,
        hostelId: row.hostel_id,
        hostelName: row.hostel_name
      };
      res.redirect(row.role === 'STUDENT' ? '/home' : '/dashboard');
    });
  } catch (err) {
    next(err);
  }
});

// Log out (POST, so a link on another site cannot log you out)
router.post('/logout', function (req, res, next) {
  req.session.regenerate(function (err) {
    if (err) return next(err);
    setFlash(req, 'success', 'You have been logged out.');
    res.redirect('/login');
  });
});

// Change own password: form
router.get('/account/password', requireLogin, function (req, res) {
  res.render('password', { title: 'Change password' });
});

// Change own password: save. The user id comes from the session, never from the form.
router.post('/account/password', requireLogin, async function (req, res, next) {
  try {
    const current = req.body.current_password || '';
    const newPassword = req.body.new_password || '';
    const confirm = req.body.confirm_password || '';

    if (newPassword.length < 6) {
      setFlash(req, 'error', 'New password must be at least 6 characters.');
      return res.redirect('/account/password');
    }
    if (newPassword !== confirm) {
      setFlash(req, 'error', 'The new password and its confirmation do not match.');
      return res.redirect('/account/password');
    }

    const rows = await query('SELECT password_hash FROM user_account WHERE user_id = ?', [req.session.user.userId]);
    const currentOk = rows[0] ? await bcrypt.compare(current, rows[0].password_hash) : false;
    if (!currentOk) {
      setFlash(req, 'error', 'Your current password is wrong.');
      return res.redirect('/account/password');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE user_account SET password_hash = ? WHERE user_id = ?', [hash, req.session.user.userId]);
    setFlash(req, 'success', 'Password changed.');
    res.redirect(req.session.user.role === 'STUDENT' ? '/home' : '/dashboard');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
