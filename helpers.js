// helpers.js - small shared helpers used by the routes and the views

// ----- flash messages: stored in the session, shown once as a toast on the next page -----
function setFlash(req, type, text) {
  req.session.flash = { type: type, text: text };     // type: 'success' or 'error'
}

// ----- turn a MySQL error into a message a user can read -----
// "what" is the thing being changed, e.g. 'room', so the message reads naturally.
function friendlyError(err, what) {
  what = what || 'record';

  // messages raised by our triggers and procedures (SIGNAL SQLSTATE '45000') are already readable
  if (err.sqlState === '45000') return err.sqlMessage;

  // UNIQUE or PRIMARY KEY violated
  if (err.code === 'ER_DUP_ENTRY') {
    return 'This ' + what + ' already exists (a value that must be unique is already used).';
  }
  // foreign key blocks a DELETE or UPDATE (RESTRICT). Depending on the MySQL version and the
  // way the query is sent, the code is ER_ROW_IS_REFERENCED or ER_ROW_IS_REFERENCED_2, so we accept both.
  if (err.code === 'ER_ROW_IS_REFERENCED' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return 'Cannot delete this ' + what + '. It is still being used by other records.';
  }
  // foreign key points to a row that does not exist (same two spellings)
  if (err.code === 'ER_NO_REFERENCED_ROW' || err.code === 'ER_NO_REFERENCED_ROW_2') {
    return 'The selected related record does not exist.';
  }
  // CHECK constraint violated
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    if (err.sqlMessage.indexOf('chk_student_dates') !== -1) return 'Check-out date cannot be earlier than the check-in date.';
    if (err.sqlMessage.indexOf('chk_fee_paid') !== -1) return 'A paid fee must have a payment date.';
    return 'A value is not allowed by a rule in the database.';
  }

  console.error(err);                                   // unexpected: log it, show a safe message
  return 'Something went wrong. Please try again.';
}

// ----- small input helpers (the server always re-checks what the browser sends) -----
function text(value) {                       // trimmed text, never undefined
  return (value || '').toString().trim();
}

function toInt(value) {                      // whole number or null, e.g. for ids from the URL
  if (value === undefined || value === null || value === '') return null;
  var n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function isPhone(value) {                    // empty is allowed, otherwise exactly 10 digits
  return value === '' || /^[0-9]{10}$/.test(value);
}

// money from DECIMAL columns arrive as strings, so convert first: 15000.00 -> ₹15,000
function money(value) {
  return '\u20B9' + Number(value).toLocaleString('en-IN');
}

// async route handlers: send any error to the error page instead of crashing the server
function wrap(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next);
  };
}

// today's date as YYYY-MM-DD in local time
function today() {
  var d = new Date();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

// true for a real date written as YYYY-MM-DD
function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

// ----- room type is just the capacity in words (no extra table) -----
function roomType(capacity) {
  if (capacity === 1) return 'Single';
  if (capacity === 2) return 'Double';
  if (capacity === 3) return 'Triple';
  return capacity + '-bed';
}

// ----- inline SVG icons (24x24 line icons), used in the views as <%- icon('name') %> -----
var iconPaths = {
  dashboard:  '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  students:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  warden:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  hostel:     '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  rooms:      '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="15" cy="12" r="1"/>',
  allocation: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  complaints: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  fees:       '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  admins:     '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  activity:   '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  key:        '<circle cx="7.5" cy="15.5" r="4.5"/><line x1="10.7" y1="12.3" x2="21" y2="2"/><line x1="17" y1="6" x2="20" y2="9"/>',
  logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu:       '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  moon:       '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:        '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
};

function icon(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[name] || '') + '</svg>';
}

module.exports = { setFlash, friendlyError, text, toInt, isPhone, isDate, today, money, wrap, roomType, icon };
