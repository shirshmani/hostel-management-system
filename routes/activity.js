// routes/activity.js - read-only activity log written by the audit triggers (ADMIN only)
const express = require('express');
const { query } = require('../db');
const { wrap } = require('../helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const TABLES = ['student', 'complaint', 'fee'];

router.get('/', requireRole('ADMIN'), wrap(async function (req, res) {
  const table = TABLES.includes(req.query.table) ? req.query.table : '';   // only known table names are accepted

  // last 50 rows, newest first
  let sql = 'SELECT log_id, table_name, record_key, action, details, changed_at FROM audit_log';
  const params = [];
  if (table) {
    sql += ' WHERE table_name = ?';
    params.push(table);
  }
  sql += ' ORDER BY log_id DESC LIMIT 50';
  const logs = await query(sql, params);

  res.render('activity', { title: 'Activity log', logs, table });
}));

module.exports = router;