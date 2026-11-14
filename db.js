// db.js - one connection pool shared by the whole app
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'hostel_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,          // DATE columns come back as 'YYYY-MM-DD' strings
  connectTimeout: 30000       // 30 seconds wait for Render hosting spin-down
});

// Runs one prepared statement (? placeholders) and returns the rows.
// For INSERT / UPDATE / DELETE it returns the result object (affectedRows, insertId).
async function query(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { pool, query };
