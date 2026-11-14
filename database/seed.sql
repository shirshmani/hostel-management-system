USE hostel_db;
SET SQL_SAFE_UPDATES = 0;   -- Workbench blocks some UPDATEs without a key in WHERE

-- Hostels (ids 1, 2, 3)
INSERT INTO hostel (hostel_name, gender_type) VALUES
('Aryabhatta Hostel', 'M'),
('Kalpana Chawla Hostel', 'F'),
('Vivekananda Hostel', 'M');

-- Departments (ids 1 to 5)
INSERT INTO department (dept_name, dept_code) VALUES
('Computer Science', 'CSE'),
('Electronics', 'ECE'),
('Mechanical', 'ME'),
('Civil', 'CE'),
('Information Technology', 'IT');

-- Rooms (S = single 20000, D = double 15000, T = triple 12000)
-- room_id 1-7 Aryabhatta, 8-13 Kalpana Chawla, 14-18 Vivekananda
INSERT INTO room (hostel_id, room_number, floor, capacity, fee_per_term) VALUES
(1, '101', 1, 2, 15000), (1, '102', 1, 2, 15000), (1, '103', 1, 3, 12000), (1, '104', 1, 1, 20000),
(1, '201', 2, 2, 15000), (1, '202', 2, 2, 15000), (1, '203', 2, 3, 12000),
(2, '101', 1, 2, 15000), (2, '102', 1, 2, 15000), (2, '103', 1, 1, 20000),
(2, '201', 2, 3, 12000), (2, '202', 2, 2, 15000), (2, '203', 2, 2, 15000),
(3, '101', 1, 2, 15000), (3, '102', 1, 2, 15000), (3, '201', 2, 3, 12000),
(3, '202', 2, 1, 20000), (3, '203', 2, 2, 15000);

-- One warden per hostel
INSERT INTO warden (name, phone, hostel_id) VALUES
('Ramesh Kulkarni', '9822011101', 1),
('Sunita Deshpande', '9822011102', 2),
('Anil Choudhary', '9822011103', 3);

-- Students (the before_student_insert trigger checks gender and capacity for each row)
-- Aryabhatta (boys): rooms 1-7, Vivekananda (boys): rooms 14 and 16, Kalpana Chawla (girls): rooms 8-12
INSERT INTO student (roll_no, name, gender, admission_year, status, dept_id, room_id, phone, check_in_date) VALUES
('24CSE001', 'Aarav Sharma',     'M', 2024, 'ON_CAMPUS', 1, 1,  '9811100001', '2024-07-22'),
('24CSE014', 'Rohan Verma',      'M', 2024, 'ON_LEAVE',  1, 1,  '9811100002', '2024-07-22'),
('23ECE007', 'Vikram Singh',     'M', 2023, 'ON_CAMPUS', 2, 2,  '9811100003', '2023-07-20'),
('23ECE012', 'Aditya Joshi',     'M', 2023, 'ON_CAMPUS', 2, 2,  '9811100004', '2023-07-20'),
('23ME004',  'Karan Patel',      'M', 2023, 'ON_CAMPUS', 3, 3,  '9811100005', '2023-07-20'),
('23ME009',  'Harsh Mehta',      'M', 2023, 'ON_CAMPUS', 3, 3,  '9811100006', '2023-07-20'),
('24ME021',  'Nikhil Yadav',     'M', 2024, 'ON_CAMPUS', 3, 3,  '9811100007', '2024-07-22'),
('23CE002',  'Rahul Gupta',      'M', 2023, 'ON_CAMPUS', 4, 4,  '9811100008', '2023-07-20'),
('24IT005',  'Siddharth Rao',    'M', 2024, 'ON_CAMPUS', 5, 5,  '9811100009', '2024-07-22'),
('24IT011',  'Manish Kumar',     'M', 2024, 'ON_CAMPUS', 5, 5,  '9811100010', '2024-07-22'),
('25CSE031', 'Ankit Mishra',     'M', 2025, 'ON_CAMPUS', 1, 6,  '9811100011', '2025-07-21'),
('25ECE018', 'Devansh Tiwari',   'M', 2025, 'ON_CAMPUS', 2, 7,  '9811100012', '2025-07-21'),
('25CSE044', 'Pranav Nair',      'M', 2025, 'ON_CAMPUS', 1, 7,  '9811100013', '2025-07-21'),
('25ME016',  'Yash Chauhan',     'M', 2025, 'ON_CAMPUS', 3, 14, '9811100014', '2025-07-21'),
('24CE008',  'Mohit Agarwal',    'M', 2024, 'ON_CAMPUS', 4, 16, '9811100015', '2024-07-22'),
('25IT022',  'Tanmay Deshmukh',  'M', 2025, 'ON_CAMPUS', 5, NULL, '9811100016', NULL),
('25CE013',  'Arjun Reddy',      'M', 2025, 'ON_CAMPUS', 4, NULL, '9811100017', NULL),
('24CSE019', 'Ananya Iyer',      'F', 2024, 'ON_CAMPUS', 1, 8,  '9822200001', '2024-07-22'),
('24CSE026', 'Priya Menon',      'F', 2024, 'ON_CAMPUS', 1, 8,  '9822200002', '2024-07-22'),
('23ECE015', 'Sneha Kulkarni',   'F', 2023, 'ON_CAMPUS', 2, 9,  '9822200003', '2023-07-20'),
('23CE006',  'Divya Pillai',     'F', 2023, 'ON_CAMPUS', 4, 10, '9822200004', '2023-07-20'),
('24IT013',  'Kavya Bansal',     'F', 2024, 'ON_CAMPUS', 5, 11, '9822200005', '2024-07-22'),
('24IT017',  'Neha Saxena',      'F', 2024, 'ON_LEAVE',  5, 11, '9822200006', '2024-07-22'),
('25IT029',  'Pooja Chatterjee', 'F', 2025, 'ON_CAMPUS', 5, 11, '9822200007', '2025-07-21'),
('25ME010',  'Ritika Malhotra',  'F', 2025, 'ON_CAMPUS', 3, 12, '9822200008', '2025-07-21'),
('25CSE038', 'Isha Kapoor',      'F', 2025, 'ON_CAMPUS', 1, NULL, '9822200009', NULL),
('24ECE020', 'Meera Bhatt',      'F', 2024, 'ON_CAMPUS', 2, NULL, '9822200010', NULL);

-- Complaints: room_id is copied from the student's room (snapshot)
INSERT INTO complaint (roll_no, room_id, category, description, status, admin_remarks, created_at, updated_at, resolved_at)
SELECT s.roll_no, s.room_id, c.category, c.description, c.status, c.remarks,
       DATE_SUB(NOW(), INTERVAL c.created_days DAY),
       DATE_SUB(NOW(), INTERVAL c.created_days DAY),
       IF(c.resolved_days IS NULL, NULL, DATE_SUB(NOW(), INTERVAL c.resolved_days DAY))
FROM (
  SELECT '24CSE001' AS roll, 'ELECTRICAL' AS category, 'Tube light in the room keeps flickering and the switch board sparks sometimes.' AS description, 'OPEN' AS status, NULL AS remarks, 1 AS created_days, NULL AS resolved_days
  UNION ALL SELECT '23ME004', 'PLUMBING', 'The tap in the bathroom is leaking all day.', 'OPEN', NULL, 2, NULL
  UNION ALL SELECT '24CSE019', 'INTERNET', 'WiFi signal is very weak on the first floor.', 'OPEN', NULL, 3, NULL
  UNION ALL SELECT '23ECE007', 'FURNITURE', 'Drawer of the study table is broken.', 'IN_PROGRESS', 'Carpenter has been informed and will visit this week.', 6, NULL
  UNION ALL SELECT '24IT017', 'CLEANING', 'Bathroom has not been cleaned for three days.', 'IN_PROGRESS', 'Housekeeping has been told to clean it daily.', 5, NULL
  UNION ALL SELECT '25ME016', 'ELECTRICAL', 'Ceiling fan makes a loud noise at night.', 'RESOLVED', 'Fan has been replaced.', 15, 12
  UNION ALL SELECT '23CE006', 'PLUMBING', 'Water heater is not working.', 'RESOLVED', 'Heating element replaced.', 20, 17
  UNION ALL SELECT '24IT005', 'OTHER', 'Window latch is broken and the window does not close.', 'RESOLVED', 'Latch repaired by the maintenance team.', 25, 22
) AS c
JOIN student s ON s.roll_no = c.roll;

-- Fees for term 2026-ODD: one row for every student who has a room, amount = the room's fee
INSERT INTO fee (roll_no, term, amount, due_date)
SELECT s.roll_no, '2026-ODD', r.fee_per_term, DATE_ADD(CURDATE(), INTERVAL 10 DAY)
FROM student s JOIN room r ON r.room_id = s.room_id;

-- 13 PAID (first 13 by roll number), paid between 1 and 9 days ago
UPDATE fee
SET status = 'PAID',
    paid_on = DATE_SUB(CURDATE(), INTERVAL (fee_id MOD 9) + 1 DAY),
    due_date = DATE_SUB(CURDATE(), INTERVAL 15 DAY)
ORDER BY roll_no
LIMIT 13;

-- 6 PENDING and overdue (last 6 pending by roll number); the other 4 stay pending but not yet due
UPDATE fee
SET due_date = DATE_SUB(CURDATE(), INTERVAL 20 DAY)
WHERE status = 'PENDING'
ORDER BY roll_no DESC
LIMIT 6;
