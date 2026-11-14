-- security.sql: run in MySQL Workbench as root, AFTER advanced.sql.
-- Change the placeholder passwords, then use the same password in your .env file.

-- Concept: DCL, least privilege. The app can read and write data and run procedures,
-- but cannot DROP, ALTER or CREATE anything.
CREATE USER IF NOT EXISTS 'hostel_app'@'localhost' IDENTIFIED BY 'App@12345';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON hostel_db.* TO 'hostel_app'@'localhost';

-- Read-only user for reports
CREATE USER IF NOT EXISTS 'hostel_report'@'localhost' IDENTIFIED BY 'Report@12345';
GRANT SELECT ON hostel_db.* TO 'hostel_report'@'localhost';

FLUSH PRIVILEGES;

-- Demo for the viva (run one at a time):
-- SHOW GRANTS FOR 'hostel_app'@'localhost';
-- REVOKE DELETE ON hostel_db.* FROM 'hostel_app'@'localhost';
-- GRANT DELETE ON hostel_db.* TO 'hostel_app'@'localhost';
-- SHOW GRANTS FOR 'hostel_report'@'localhost';
