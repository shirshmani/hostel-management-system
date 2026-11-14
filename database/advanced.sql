-- advanced.sql: run in MySQL Workbench AFTER schema.sql and seed.sql.
-- Contents: constraints and indexes, audit table, functions, views, triggers, procedures, event.
USE hostel_db;

-- ===== CONSTRAINTS AND INDEXES =====

-- Concept: named CHECK constraint (check-out cannot be before check-in)
ALTER TABLE student ADD CONSTRAINT chk_student_dates
  CHECK (check_out_date IS NULL OR check_in_date IS NULL OR check_out_date >= check_in_date);

-- Concept: named CHECK constraint (PAID needs paid_on, PENDING must not have it)
ALTER TABLE fee ADD CONSTRAINT chk_fee_paid
  CHECK ((status = 'PAID' AND paid_on IS NOT NULL) OR (status = 'PENDING' AND paid_on IS NULL));

-- Concept: composite index (used by the overdue query: WHERE status = ... AND due_date < ...)
CREATE INDEX idx_fee_status_due ON fee(status, due_date);

-- Concept: FULLTEXT index (keyword search on the complaints page)
ALTER TABLE complaint ADD FULLTEXT INDEX ft_complaint_description (description);

-- Concept: audit table with NO foreign keys, so the history stays even after rows are deleted
CREATE TABLE audit_log (
  log_id     INT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(30) NOT NULL,
  record_key VARCHAR(30) NOT NULL,
  action     VARCHAR(30) NOT NULL,
  details    VARCHAR(200),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at);

DELIMITER $$

-- ===== FUNCTIONS (created before the views that call them) =====

-- Concept: stored function (returns one value, used inside SELECT)
CREATE FUNCTION fn_fee_state(p_status VARCHAR(10), p_due DATE)
RETURNS VARCHAR(10)
NOT DETERMINISTIC NO SQL
BEGIN
  IF p_status = 'PAID' THEN
    RETURN 'PAID';
  ELSEIF p_due < CURDATE() THEN
    RETURN 'OVERDUE';
  END IF;
  RETURN 'PENDING';
END$$

-- Concept: stored function that reads a table (sum of a student's PENDING fees)
CREATE FUNCTION fn_pending_dues(p_roll VARCHAR(10))
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE total DECIMAL(10,2);
  SELECT COALESCE(SUM(amount), 0) INTO total
  FROM fee WHERE roll_no = p_roll AND status = 'PENDING';
  RETURN total;
END$$

DELIMITER ;

-- ===== VIEWS =====

-- Concept: view with LEFT JOINs so students without a room still appear
CREATE VIEW v_student_details AS
SELECT s.roll_no, s.name, s.gender, s.admission_year, s.status, s.phone,
       s.check_in_date, s.check_out_date,
       d.dept_id, d.dept_name, d.dept_code,
       r.room_id, r.room_number, r.floor,
       h.hostel_id, h.hostel_name,
       fn_pending_dues(s.roll_no) AS pending_dues
FROM student s
JOIN department d ON d.dept_id = s.dept_id
LEFT JOIN room r ON r.room_id = s.room_id
LEFT JOIN hostel h ON h.hostel_id = r.hostel_id;

-- Concept: view that calls a function (state = PAID / OVERDUE / PENDING)
CREATE VIEW v_fee_report AS
SELECT f.fee_id, f.roll_no, s.name AS student_name, f.term, f.amount,
       f.due_date, f.status, f.paid_on,
       fn_fee_state(f.status, f.due_date) AS state,
       r.room_id, r.room_number, h.hostel_id, h.hostel_name
FROM fee f
JOIN student s ON s.roll_no = f.roll_no
LEFT JOIN room r ON r.room_id = s.room_id
LEFT JOIN hostel h ON h.hostel_id = r.hostel_id;

DELIMITER $$

-- ===== TRIGGERS (the first two are in schema.sql: before_student_insert, before_student_update) =====

-- Concept: BEFORE UPDATE trigger changing NEW values (only BEFORE can do this)
CREATE TRIGGER trg_complaint_before_update
BEFORE UPDATE ON complaint
FOR EACH ROW
BEGIN
  IF NEW.status = 'RESOLVED' AND OLD.status <> 'RESOLVED' THEN
    SET NEW.resolved_at = NOW();
  ELSEIF NEW.status <> 'RESOLVED' AND OLD.status = 'RESOLVED' THEN
    SET NEW.resolved_at = NULL;
  END IF;
END$$

-- Concept: BEFORE UPDATE trigger that keeps paid_on consistent with status
CREATE TRIGGER trg_fee_before_update
BEFORE UPDATE ON fee
FOR EACH ROW
BEGIN
  IF NEW.status = 'PAID' AND NEW.paid_on IS NULL THEN
    SET NEW.paid_on = CURDATE();
  ELSEIF NEW.status = 'PENDING' THEN
    SET NEW.paid_on = NULL;
  END IF;
END$$

-- Concept: BEFORE DELETE trigger that refuses the delete
CREATE TRIGGER trg_student_before_delete
BEFORE DELETE ON student
FOR EACH ROW
BEGIN
  IF fn_pending_dues(OLD.roll_no) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student has pending fees';
  END IF;
END$$

-- Concept: AFTER UPDATE trigger for auditing (logs only after the change succeeded)
CREATE TRIGGER trg_student_after_update
AFTER UPDATE ON student
FOR EACH ROW
BEGIN
  IF NOT (OLD.room_id <=> NEW.room_id) THEN
    INSERT INTO audit_log (table_name, record_key, action, details)
    VALUES ('student', NEW.roll_no, 'ROOM_CHANGE',
            CONCAT('room ', COALESCE(OLD.room_id, 'none'), ' -> ', COALESCE(NEW.room_id, 'none')));
  END IF;
END$$

-- Concept: AFTER UPDATE trigger for auditing complaint status
CREATE TRIGGER trg_complaint_after_update
AFTER UPDATE ON complaint
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO audit_log (table_name, record_key, action, details)
    VALUES ('complaint', NEW.complaint_id, 'STATUS_CHANGE', CONCAT(OLD.status, ' -> ', NEW.status));
  END IF;
END$$

-- Concept: AFTER UPDATE trigger for auditing fee payments
CREATE TRIGGER trg_fee_after_update
AFTER UPDATE ON fee
FOR EACH ROW
BEGIN
  IF OLD.status = 'PENDING' AND NEW.status = 'PAID' THEN
    INSERT INTO audit_log (table_name, record_key, action, details)
    VALUES ('fee', NEW.fee_id, 'PAID', CONCAT(NEW.roll_no, ' ', NEW.term, ' amount ', NEW.amount));
  END IF;
END$$

-- ===== STORED PROCEDURES =====

-- Concept: transaction + row lock (FOR UPDATE) + EXIT HANDLER with ROLLBACK and RESIGNAL
CREATE PROCEDURE sp_allocate_room(
  IN p_roll VARCHAR(10), IN p_room INT, IN p_checkin DATE, IN p_hostel TINYINT)
BEGIN
  DECLARE v_hostel TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  -- lock the room row: a second allocation to the same room waits here
  SELECT hostel_id INTO v_hostel FROM room WHERE room_id = p_room FOR UPDATE;
  IF v_hostel IS NULL OR v_hostel <> p_hostel THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room does not belong to this hostel';
  END IF;
  -- gender and capacity are checked by the before_student_update trigger
  UPDATE student SET room_id = p_room, check_in_date = p_checkin, check_out_date = NULL
  WHERE roll_no = p_roll AND room_id IS NULL;
  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That student already has a room';
  END IF;
  COMMIT;
END$$

-- Concept: transaction + INSERT ... SELECT; the unique key (roll_no, term) skips duplicates
CREATE PROCEDURE sp_generate_fees(IN p_term VARCHAR(20), IN p_due DATE)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  INSERT IGNORE INTO fee (roll_no, term, amount, due_date)
  SELECT s.roll_no, p_term, r.fee_per_term, p_due
  FROM student s JOIN room r ON r.room_id = s.room_id
  WHERE r.fee_per_term > 0;
  SELECT ROW_COUNT() AS fees_created;
  COMMIT;
END$$

-- Concept: cursor with CONTINUE HANDLER FOR NOT FOUND (year-end checkout)
CREATE PROCEDURE sp_vacate_batch(IN p_max_year SMALLINT)
BEGIN
  DECLARE v_roll VARCHAR(10);
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_count INT DEFAULT 0;
  DECLARE cur CURSOR FOR
    SELECT roll_no FROM student WHERE room_id IS NOT NULL AND admission_year <= p_max_year;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_roll;
    IF v_done = 1 THEN LEAVE read_loop; END IF;
    UPDATE student SET room_id = NULL, check_out_date = CURDATE() WHERE roll_no = v_roll;
    SET v_count = v_count + 1;
  END LOOP;
  CLOSE cur;
  COMMIT;
  SELECT v_count AS vacated;
END$$

DELIMITER ;

-- ===== EVENT (optional) =====
-- Needs: SET GLOBAL event_scheduler = ON;   check with: SHOW VARIABLES LIKE 'event_scheduler';
-- Concept: scheduled event (weekly cleanup of old audit rows)
CREATE EVENT ev_purge_audit
ON SCHEDULE EVERY 1 WEEK
DO DELETE FROM audit_log WHERE changed_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
