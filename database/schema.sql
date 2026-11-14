DROP DATABASE IF EXISTS hostel_db;
CREATE DATABASE hostel_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hostel_db;

CREATE TABLE hostel (
  hostel_id   TINYINT AUTO_INCREMENT PRIMARY KEY,
  hostel_name VARCHAR(50) NOT NULL UNIQUE,
  gender_type ENUM('M','F') NOT NULL
);

CREATE TABLE department (
  dept_id   SMALLINT AUTO_INCREMENT PRIMARY KEY,
  dept_name VARCHAR(80) NOT NULL UNIQUE,
  dept_code VARCHAR(10) NOT NULL UNIQUE
);

CREATE TABLE room (
  room_id      INT AUTO_INCREMENT PRIMARY KEY,
  hostel_id    TINYINT NOT NULL,
  room_number  VARCHAR(10) NOT NULL,
  floor        TINYINT,
  capacity     TINYINT NOT NULL DEFAULT 2 CHECK (capacity > 0),
  fee_per_term DECIMAL(8,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (hostel_id) REFERENCES hostel(hostel_id),
  UNIQUE (hostel_id, room_number)
);

CREATE TABLE warden (
  warden_id SMALLINT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  phone     VARCHAR(15),
  hostel_id TINYINT NOT NULL,
  FOREIGN KEY (hostel_id) REFERENCES hostel(hostel_id)
);

CREATE TABLE student (
  roll_no        VARCHAR(10) PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  gender         ENUM('M','F') NOT NULL,
  admission_year YEAR NOT NULL,
  status         ENUM('ON_CAMPUS','ON_LEAVE') NOT NULL DEFAULT 'ON_CAMPUS',
  dept_id        SMALLINT NOT NULL,
  room_id        INT NULL,
  phone          VARCHAR(15),
  check_in_date  DATE NULL,
  check_out_date DATE NULL,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id),
  FOREIGN KEY (room_id) REFERENCES room(room_id) ON DELETE SET NULL
);

CREATE TABLE complaint (
  complaint_id  INT AUTO_INCREMENT PRIMARY KEY,
  roll_no       VARCHAR(10) NOT NULL,
  room_id       INT NOT NULL,
  category      ENUM('ELECTRICAL','PLUMBING','FURNITURE','CLEANING','INTERNET','OTHER') NOT NULL,
  description   TEXT NOT NULL,
  status        ENUM('OPEN','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'OPEN',
  admin_remarks TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at   TIMESTAMP NULL,
  FOREIGN KEY (roll_no) REFERENCES student(roll_no) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES room(room_id)
);

CREATE TABLE fee (
  fee_id   INT AUTO_INCREMENT PRIMARY KEY,
  roll_no  VARCHAR(10) NOT NULL,
  term     VARCHAR(20) NOT NULL,
  amount   DECIMAL(8,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  status   ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING',
  paid_on  DATE NULL,
  FOREIGN KEY (roll_no) REFERENCES student(roll_no) ON DELETE CASCADE,
  UNIQUE (roll_no, term)
);

CREATE TABLE user_account (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('ADMIN','WARDEN','STUDENT') NOT NULL,
  roll_no       VARCHAR(10) UNIQUE NULL,
  warden_id     SMALLINT UNIQUE NULL,
  FOREIGN KEY (roll_no)   REFERENCES student(roll_no)  ON DELETE CASCADE,
  FOREIGN KEY (warden_id) REFERENCES warden(warden_id) ON DELETE CASCADE
);

CREATE INDEX idx_student_name     ON student(name);
CREATE INDEX idx_student_dept     ON student(dept_id);
CREATE INDEX idx_student_room     ON student(room_id);
CREATE INDEX idx_complaint_roll   ON complaint(roll_no);
CREATE INDEX idx_complaint_status ON complaint(status);
CREATE INDEX idx_fee_status       ON fee(status);

CREATE VIEW room_occupancy AS
SELECT r.room_id, r.room_number, r.floor, r.capacity, r.fee_per_term,
       h.hostel_id, h.hostel_name, h.gender_type,
       COUNT(s.roll_no)              AS occupied,
       r.capacity - COUNT(s.roll_no) AS vacancies
FROM room r
JOIN hostel h        ON h.hostel_id = r.hostel_id
LEFT JOIN student s  ON s.room_id   = r.room_id
GROUP BY r.room_id, r.room_number, r.floor, r.capacity, r.fee_per_term,
         h.hostel_id, h.hostel_name, h.gender_type;

DELIMITER $$

CREATE TRIGGER before_student_insert
BEFORE INSERT ON student
FOR EACH ROW
BEGIN
  DECLARE h_gender CHAR(1);
  DECLARE room_cap INT;
  DECLARE taken INT;
  IF NEW.room_id IS NOT NULL THEN
    SELECT h.gender_type, r.capacity INTO h_gender, room_cap
    FROM room r JOIN hostel h ON h.hostel_id = r.hostel_id
    WHERE r.room_id = NEW.room_id;
    SELECT COUNT(*) INTO taken FROM student WHERE room_id = NEW.room_id;
    IF h_gender <> NEW.gender THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gender does not match the hostel';
    ELSEIF taken >= room_cap THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room is full';
    END IF;
  END IF;
END$$

CREATE TRIGGER before_student_update
BEFORE UPDATE ON student
FOR EACH ROW
BEGIN
  DECLARE h_gender CHAR(1);
  DECLARE room_cap INT;
  DECLARE taken INT;
  -- only check when the room or the gender is being changed
  IF NEW.room_id IS NOT NULL
     AND (NOT (OLD.room_id <=> NEW.room_id) OR OLD.gender <> NEW.gender) THEN
    SELECT h.gender_type, r.capacity INTO h_gender, room_cap
    FROM room r JOIN hostel h ON h.hostel_id = r.hostel_id
    WHERE r.room_id = NEW.room_id;
    -- do not count the student themselves
    SELECT COUNT(*) INTO taken FROM student
    WHERE room_id = NEW.room_id AND roll_no <> NEW.roll_no;
    IF h_gender <> NEW.gender THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gender does not match the hostel';
    ELSEIF taken >= room_cap THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room is full';
    END IF;
  END IF;
END$$

DELIMITER ;
