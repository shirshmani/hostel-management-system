// server.js - app setup: session, shared view data, routes, error pages
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { pool } = require('./db');
const helpers = require('./helpers');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// helper functions available in every view
app.locals.icon = helpers.icon;
app.locals.roomType = helpers.roomType;
app.locals.money = helpers.money;

app.use(express.static(path.join(__dirname, 'public')));   // css and js, no session needed
app.use(express.urlencoded({ extended: false }));          // reads HTML form posts

// Login sessions: the browser keeps only a random id in a cookie, the data stays on the server
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 2 * 60 * 60 * 1000 }   // 2 hours
}));

// Data every view can use: who is logged in, the one-time flash message, the current path
app.use(function (req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.currentPath = req.path;
  res.locals.homeUrl = req.session.user && req.session.user.role === 'STUDENT' ? '/home' : '/dashboard';
  delete req.session.flash;                                // show a flash message only once
  res.set('Cache-Control', 'no-store');                    // the Back button must not show old private pages
  next();
});

// Routes (later phases add their route files here)
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/hostels', require('./routes/hostels'));
app.use('/rooms', require('./routes/rooms'));
app.use('/wardens', require('./routes/wardens'));
app.use('/admins', require('./routes/admins'));
app.use('/students', require('./routes/students'));
app.use('/allocation', require('./routes/allocation'));
app.use('/complaints', require('./routes/complaints'));
app.use('/fees', require('./routes/fees'));
app.use('/activity', require('./routes/activity'));

// Page not found
app.use(function (req, res) {
  res.status(404).render('error', { title: 'Page not found', status: 404, message: 'This page does not exist (or is not built yet).', bare: !res.locals.user });
});

// Unexpected errors: log the details, show a safe message
app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).render('error', { title: 'Error', status: 500, message: 'Something went wrong on the server.', bare: !res.locals.user });
});

// Start only if the database is reachable
const port = process.env.PORT || 3000;
pool.query('SELECT 1').then(function () {
  app.listen(port, function () {
    console.log('Hostel Management running at http://localhost:' + port);
  });
}).catch(function (err) {
  console.error('Cannot connect to MySQL: ' + err.message);
  console.error('Check the DB_* values in your .env file.');
  process.exit(1);
});
