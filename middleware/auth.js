// middleware/auth.js - login and role checks. Every protected route uses one of these.

// The user must be logged in, otherwise go to the login page.
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// The user must be logged in AND have one of the given roles, e.g. requireRole('ADMIN', 'WARDEN').
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).render('403', { title: 'Access denied' });
    next();
  };
}

module.exports = { requireLogin, requireRole };
