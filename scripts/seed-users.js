// scripts/seed-users.js - creates the demo logins. Run: npm run seed-users
// Safe to run twice: INSERT IGNORE skips usernames that already exist,
// so a password someone has changed is not overwritten.
const bcrypt = require('bcryptjs');
const { pool, query } = require('../db');

// hash the password, then insert one login. Returns 1 if created, 0 if it already existed.
async function addUser(username, password, role, rollNo, wardenId) {
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT IGNORE INTO user_account (username, password_hash, role, roll_no, warden_id) VALUES (?, ?, ?, ?, ?)',
    [username, hash, role, rollNo, wardenId]
  );
  return result.affectedRows;
}

async function main() {
  let created = 0;

  // one admin
  created += await addUser('admin', 'admin123', 'ADMIN', null, null);

  // warden1, warden2, ... linked to warden ids in order
  const wardens = await query('SELECT warden_id FROM warden ORDER BY warden_id');
  for (let i = 0; i < wardens.length; i++) {
    created += await addUser('warden' + (i + 1), 'warden123', 'WARDEN', null, wardens[i].warden_id);
  }

  // every student: username = roll number, password = roll number
  const students = await query('SELECT roll_no FROM student ORDER BY roll_no');
  for (const s of students) {
    created += await addUser(s.roll_no, s.roll_no, 'STUDENT', s.roll_no, null);
  }

  console.log('New logins created: ' + created);
  await pool.end();
}

main().catch(function (err) {
  console.error('Seeding failed: ' + err.message);
  process.exit(1);
});
