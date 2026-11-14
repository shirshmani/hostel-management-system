# Hostel Management System (CS030603)

Node.js + Express + EJS + MySQL 8 (mysql2, raw SQL). Roles: ADMIN, WARDEN, STUDENT.

## Setup (Windows)

1. Install Node.js LTS and MySQL 8.0.16 or later with MySQL Workbench.
2. In Workbench, connect as root. For each file below: File > Open SQL Script, then run the whole script (lightning button). Run them in this order:
   1. `database/schema.sql`
   2. `database/seed.sql`
   3. `database/advanced.sql`
   4. `database/security.sql` (change the placeholder passwords first)
3. In the project folder (Command Prompt):
   ```
   copy .env.example .env
   ```
   Open `.env` and set `DB_PASSWORD` to the `hostel_app` password you chose.
4. `npm install`
5. `npm run seed-users`
6. `npm start`, then open http://localhost:3000 in the browser

`schema.sql` drops and recreates `hostel_db`. If you run it again, repeat steps 2.2 to 2.4 and step 5.

If you get `ER_ACCESS_DENIED_ERROR`, the password in `.env` does not match the one in `security.sql`.

## Demo logins (demo only)

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Warden (Aryabhatta) | warden1 | warden123 |
| Warden (Kalpana Chawla) | warden2 | warden123 |
| Warden (Vivekananda) | warden3 | warden123 |
| Student (has a room, fees paid) | 24CSE001 | 24CSE001 |
| Student (has a room, fee overdue) | 25CSE044 | 25CSE044 |
| Student (no room yet) | 25IT022 | 25IT022 |

Every student's username and password are their roll number.

## Database checks (run in Workbench)

Run each statement on its own (Ctrl+Enter). Statements marked FAILS are supposed to give an error, and they change nothing. Blocks starting with START TRANSACTION are run together (select all, Ctrl+Enter) and end with ROLLBACK, so the data stays unchanged.

### A. Data loaded
```sql
USE hostel_db;
SELECT (SELECT COUNT(*) FROM hostel) AS hostels, (SELECT COUNT(*) FROM department) AS depts,
       (SELECT COUNT(*) FROM room) AS rooms, (SELECT COUNT(*) FROM warden) AS wardens,
       (SELECT COUNT(*) FROM student) AS students,
       (SELECT COUNT(*) FROM student WHERE room_id IS NULL) AS waiting,
       (SELECT COUNT(*) FROM complaint) AS complaints, (SELECT COUNT(*) FROM fee) AS fees;
-- Expected: 3, 5, 18, 3, 27, 4, 8, 23

SELECT * FROM room_occupancy;   -- 18 rows
SELECT hostel_name, SUM(occupied) AS occupied, SUM(capacity) AS beds
FROM room_occupancy GROUP BY hostel_name;
-- Expected: Aryabhatta 13/15, Kalpana Chawla 8/12, Vivekananda 2/10

SELECT status, COUNT(*) FROM complaint GROUP BY status;   -- OPEN 3, IN_PROGRESS 2, RESOLVED 3
SELECT state, COUNT(*) FROM v_fee_report GROUP BY state;  -- PAID 13, OVERDUE 6, PENDING 4
SELECT role, COUNT(*) FROM user_account GROUP BY role;    -- after seed-users: ADMIN 1, WARDEN 3, STUDENT 27
```

### B. Gender and capacity triggers, foreign keys
```sql
-- FAILS: girl into a boys' room. Expected: Gender does not match the hostel
UPDATE student SET room_id = 1 WHERE roll_no = '25CSE038';

-- FAILS: boy into a full room. Expected: Room is full
UPDATE student SET room_id = 1 WHERE roll_no = '25IT022';

-- Works: editing a phone number in a full room (the trigger only checks when the room changes)
START TRANSACTION;
UPDATE student SET phone = '9000000000' WHERE roll_no = '24CSE001';
SELECT COUNT(*) AS audit_rows FROM audit_log;   -- 0, because the room did not change
ROLLBACK;

-- FAILS: deleting a room that has complaints. Expected: error 1451, foreign key constraint fails
DELETE FROM room WHERE room_id = 1;
```

### C. CHECK constraints
```sql
-- FAILS: check-out before check-in. Expected: error 3819, chk_student_dates is violated
UPDATE student SET check_out_date = '2020-01-01' WHERE roll_no = '24CSE001';

-- FAILS: PAID fee without paid_on. Expected: error 3819, chk_fee_paid is violated
INSERT INTO fee (roll_no, term, amount, due_date, status)
VALUES ('25IT022', 'X', 1000, CURDATE(), 'PAID');
```

### D. Functions and views
```sql
SELECT fn_pending_dues('25CSE044') AS dues, fn_pending_dues('23CE002') AS none,
       fn_fee_state('PENDING', CURDATE() - INTERVAL 1 DAY) AS overdue,
       fn_fee_state('PAID',    CURDATE() - INTERVAL 1 DAY) AS paid,
       fn_fee_state('PENDING', CURDATE()) AS pending;
-- Expected: 12000.00, 0.00, OVERDUE, PAID, PENDING

SELECT roll_no, name, hostel_name, room_number, pending_dues
FROM v_student_details WHERE roll_no IN ('25CSE044', '25IT022', '23CE002');
-- 25IT022 has no room, so hostel_name and room_number are NULL (LEFT JOIN)

SELECT hostel_name, state, COUNT(*) AS fees, SUM(amount) AS total
FROM v_fee_report GROUP BY hostel_name, state ORDER BY hostel_name, state;
-- Aryabhatta: OVERDUE 3 (39000), PAID 8 (119000), PENDING 2 (27000)
```

### E. Triggers
```sql
-- Complaint: resolved_at is set and cleared by the trigger, and both changes are logged
START TRANSACTION;
UPDATE complaint SET status = 'RESOLVED' WHERE complaint_id = 1;
SELECT status, resolved_at FROM complaint WHERE complaint_id = 1;   -- resolved_at has a value
UPDATE complaint SET status = 'OPEN' WHERE complaint_id = 1;
SELECT status, resolved_at FROM complaint WHERE complaint_id = 1;   -- resolved_at is NULL
SELECT table_name, action, details FROM audit_log;                  -- 2 STATUS_CHANGE rows
ROLLBACK;

-- Fee: paid_on is set by the trigger, so chk_fee_paid passes
START TRANSACTION;
UPDATE fee SET status = 'PAID' WHERE roll_no = '25CSE044';
SELECT status, paid_on FROM fee WHERE roll_no = '25CSE044';     -- PAID, today's date
UPDATE fee SET status = 'PENDING' WHERE roll_no = '23CE002';
SELECT status, paid_on FROM fee WHERE roll_no = '23CE002';      -- PENDING, NULL
SELECT table_name, action, details FROM audit_log;              -- one PAID row
ROLLBACK;

-- FAILS: student with pending fees. Expected: Student has pending fees
DELETE FROM student WHERE roll_no = '25CSE044';

-- Works: student with no fees can be deleted (rolled back)
START TRANSACTION;
DELETE FROM student WHERE roll_no = '25IT022';
SELECT COUNT(*) FROM student;   -- 26
ROLLBACK;
```

### F. Stored procedures
```sql
-- sp_generate_fees: first call creates 23 fees, second call creates 0 (unique key skips them)
CALL sp_generate_fees('2027-EVEN', '2027-01-15');
CALL sp_generate_fees('2027-EVEN', '2027-01-15');
DELETE FROM fee WHERE term = '2027-EVEN';     -- clean up

-- sp_allocate_room, all four FAIL:
CALL sp_allocate_room('25IT022', 1, CURDATE(), 1);    -- Room is full
CALL sp_allocate_room('25IT022', 8, CURDATE(), 1);    -- Room does not belong to this hostel
CALL sp_allocate_room('24CSE001', 6, CURDATE(), 1);   -- That student already has a room
CALL sp_allocate_room('25CSE038', 6, CURDATE(), 1);   -- Gender does not match the hostel

-- sp_allocate_room success, then undo (the procedure commits by itself, so undo by hand)
CALL sp_allocate_room('25IT022', 6, CURDATE(), 1);
SELECT roll_no, room_id, check_in_date FROM student WHERE roll_no = '25IT022';
SELECT * FROM audit_log;    -- 'room none -> 6'
UPDATE student SET room_id = NULL, check_in_date = NULL WHERE roll_no = '25IT022';

-- sp_vacate_batch (commits by itself, so back up first and restore after)
CREATE TEMPORARY TABLE bak AS SELECT roll_no, room_id, check_out_date FROM student;
CALL sp_vacate_batch(2022);   -- vacated 0
CALL sp_vacate_batch(2023);   -- vacated 7 (everyone admitted in 2023)
SELECT COUNT(*) FROM student WHERE room_id IS NOT NULL;    -- 16
UPDATE student s JOIN bak b ON b.roll_no = s.roll_no
SET s.room_id = b.room_id, s.check_out_date = b.check_out_date;
SELECT COUNT(*) FROM student WHERE room_id IS NOT NULL;    -- 23 again
```

### G. Indexes, FULLTEXT, privileges, event
```sql
SHOW INDEX FROM fee;     -- includes idx_fee_status and idx_fee_status_due
SELECT complaint_id, description FROM complaint
WHERE MATCH(description) AGAINST ('tap leaking' IN NATURAL LANGUAGE MODE);   -- complaint 2

SHOW GRANTS FOR 'hostel_app'@'localhost';    -- no DROP, ALTER or CREATE
-- Open a new connection as hostel_app and run: DROP TABLE fee;   FAILS: error 1142, DROP denied

SHOW VARIABLES LIKE 'event_scheduler';       -- ON; if OFF run: SET GLOBAL event_scheduler = ON;
SHOW EVENTS;                                 -- ev_purge_audit, every 1 WEEK
```
