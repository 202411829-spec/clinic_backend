-- ============================================================
-- 2026-08-28 — Clean-schema SEED
--
-- Seeds the CLEAN schema (migrations/2026-08-28_clean_rebuild_ddl.sql)
-- with the data PRESERVED from the legacy database. Source of the
-- preserved values: legacy_data_dump.json (dumped before the rebuild).
--
-- Insert order is FK-safe (parents before children):
--   departments -> courses;  appointment_reasons;  medicines;
--   clinic_appointment_settings;  admin_accounts;  students;
--   clinic_schedules -> time_slots;  app_accounts (students + admins).
--
-- Mapping notes / assumptions:
--   - departments: the 6 official Gordon College colleges/institutes
--     (CAHS, CBA, CCS, CEAS, CHTM, IGS), full names.
--   - courses: the official Gordon College program list (30 rows),
--     majors expanded into discrete course rows per department.
--   - appointment_reasons: 6 legacy reason descriptions, is_active=TRUE.
--   - medicines: 3 legacy medicines; legacy quantity -> stock_quantity.
--   - clinic_appointment_settings: ONE row mirroring legacy values
--     including max_students_per_slot = 8.
--   - admin_accounts: the 3 legacy admin rows. Email carried over from
--     the legacy `admin` table EXACTLY (admin001 -> admin@gccas.com,
--     which differs from its school login email - see app_accounts).
--   - students: TEST001 is fully mapped from legacy
--     personal_information + student_name + course_dept/department.
--     202411829 and 202400001 exist only in school_account_directory:
--     names split "First Middle M. Last" -> first_name 'First Middle',
--     middle_initial 'M', last_name 'Last'; year_level 1; gender NULL;
--     email from school_account_directory.school_email. Their legacy
--     department labels were not mapped (no personal-information record),
--     so department_id/course_id are left NULL.
--   - clinic_schedules + time_slots: a few enabled days mirroring legacy
--     clinic_schedule entries, with a couple of materialized 30-minute
--     time_slots each (capacity = settings max_students_per_slot = 8) so
--     the booking flow has something to book. One disabled day shows the
--     closure_reason pattern. No appointments/visits are seeded.
--   - app_accounts: one login identity per legacy school_account_directory
--     row (5): email = school_email, account_type, linked to the
--     corresponding students/admin_accounts row. auth_user_id is NULL -
--     the Supabase Auth linkage is added later.
--
-- Like the DDL file, this is plain SQL; scripts/run_clean_rebuild.py
-- executes it as a single statement batch (one implicit transaction, so
-- a failure rolls the whole seed back).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Lookups
-- ---------------------------------------------------------------------------

-- 1.1 departments (official Gordon College colleges/institutes, 6 rows)
INSERT INTO "departments" ("department_name") VALUES
  ('College of Allied Health Studies (CAHS)'),
  ('College of Business and Accountancy (CBA)'),
  ('College of Computer Studies (CCS)'),
  ('College of Education, Arts and Sciences (CEAS)'),
  ('College of Hospitality and Tourism Management (CHTM)'),
  ('Institute of Graduate Studies (IGS)');

-- 1.2 courses (official Gordon College programs, 30 rows - majors expanded
--     into discrete course rows so the Department -> Course dropdown is
--     one row per major)
INSERT INTO "courses" ("department_id", "course_name")
SELECT d."department_id", c."course_name"
FROM "departments" d
JOIN (VALUES
  -- CAHS
  ('College of Allied Health Studies (CAHS)', 'Bachelor of Science in Nursing (BSN)'),
  ('College of Allied Health Studies (CAHS)', 'Bachelor of Science in Midwifery (BSM)'),
  -- CBA
  ('College of Business and Accountancy (CBA)', 'Bachelor of Science in Accountancy (BSA)'),
  ('College of Business and Accountancy (CBA)', 'BS Business Administration Major in Financial Management'),
  ('College of Business and Accountancy (CBA)', 'BS Business Administration Major in Human Resource Management'),
  ('College of Business and Accountancy (CBA)', 'BS Business Administration Major in Marketing Management'),
  ('College of Business and Accountancy (CBA)', 'Bachelor of Science in Customs Administration (BSCA)'),
  -- CCS
  ('College of Computer Studies (CCS)', 'Bachelor of Science in Computer Science (BSCS)'),
  ('College of Computer Studies (CCS)', 'Bachelor of Science in Information Technology (BSIT)'),
  ('College of Computer Studies (CCS)', 'BS Entertainment and Multimedia Computing Major in Digital Animation Technology'),
  ('College of Computer Studies (CCS)', 'BS Entertainment and Multimedia Computing Major in Game Development'),
  ('College of Computer Studies (CCS)', 'Associate in Computer Technology (ACT)'),
  -- CEAS
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Arts in Communication (BAComm)'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Culture and Arts Education (BCAEd)'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Early Childhood Education (BECEd)'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Elementary Education (BEEd)'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Physical Education (BPEd)'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Secondary Education Major in English'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Secondary Education Major in Filipino'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Secondary Education Major in Mathematics'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Secondary Education Major in Science'),
  ('College of Education, Arts and Sciences (CEAS)', 'Bachelor of Secondary Education Major in Social Studies'),
  ('College of Education, Arts and Sciences (CEAS)', 'Teacher Certificate Program (TCP)'),
  -- CHTM
  ('College of Hospitality and Tourism Management (CHTM)', 'Bachelor of Science in Hospitality Management (BSHM)'),
  ('College of Hospitality and Tourism Management (CHTM)', 'Bachelor of Science in Tourism Management (BSTM)'),
  -- IGS
  ('Institute of Graduate Studies (IGS)', 'Master of Arts in Nursing (MAN)'),
  ('Institute of Graduate Studies (IGS)', 'Master of Arts in Education Major in Educational Management (MAEd)'),
  ('Institute of Graduate Studies (IGS)', 'Master in Business Management (MBM)'),
  ('Institute of Graduate Studies (IGS)', 'Master in Public Administration / Management (MPA/MPM)')
) AS c("department_name", "course_name")
ON c."department_name" = d."department_name";

-- 1.3 appointment_reasons (legacy `reason`, 6 preserved rows)
INSERT INTO "appointment_reasons" ("description", "is_active") VALUES
  ('Medical Consultation',        TRUE),
  ('Annual Medical Examination',  TRUE),
  ('Dental Examination',          TRUE),
  ('Free Medicine',               TRUE),
  ('Wound Cleaning',              TRUE),
  ('Emergency',                   TRUE);

-- 1.4 medicines (legacy `medicines`, 3 preserved rows;
--     legacy quantity -> stock_quantity)
INSERT INTO "medicines" ("medicine_name", "stock_quantity") VALUES
  ('Paracetamol', 98),
  ('Ibuprofen',    0),
  ('Cetirizine',   0);

-- 1.5 clinic_appointment_settings (legacy singleton row, values carried over)
INSERT INTO "clinic_appointment_settings"
  ("slot_interval_minutes", "max_students_per_slot",
   "work_start", "work_end", "break_start", "break_end")
VALUES
  (30, 8, '08:00:00', '23:59:00', '12:00:00', '13:00:00');

-- ---------------------------------------------------------------------------
-- 2. People: admin_accounts, students
-- ---------------------------------------------------------------------------

-- 2.1 admin_accounts (legacy `admin`, 3 preserved rows; email carried
--     over EXACTLY from the legacy table)
INSERT INTO "admin_accounts"
  ("username", "first_name", "last_name", "email", "role", "license_no")
VALUES
  ('admin001',  'Mark',          'Alfonso',   'admin@gccas.com',                'admin', NULL),
  ('nurse001',  'Joseph Daniel', 'B. Ramos',  'nurse001@gordoncollege.edu.ph',  'nurse', 'PRC-1234567'),
  ('admintest', 'Test',          'Admin',     'admintest@gordoncollege.edu.ph', 'admin', NULL);

-- 2.2 students
--     TEST001: mapped from legacy personal_information + student_name
--              (name_id 1) + department/course (CCS / BSCS). Email from
--              school_account_directory.school_email.
--     202411829 / 202400001: from school_account_directory only.
INSERT INTO "students" (
  "student_id", "first_name", "middle_initial", "last_name",
  "department_id", "course_id", "year_level", "gender", "birth_date",
  "contact_number", "email", "civil_status", "present_address"
) VALUES
  (
    'TEST001', 'Juan', 'D', 'Dela Cruz',
    (SELECT "department_id" FROM "departments" WHERE "department_name" = 'College of Computer Studies (CCS)'),
    (SELECT "course_id"     FROM "courses"     WHERE "course_name"     = 'Bachelor of Science in Computer Science (BSCS)'),
    1, 'Male', '2005-01-01',
    '09123456789', 'test001@gordoncollege.edu.ph', 'Single', 'Test Address'
  ),
  (
    '202411829', 'Angela Marie', 'D', 'Reyes',
    NULL, NULL, 1, NULL, NULL,
    NULL, '202411829@gordoncollege.edu.ph', NULL, NULL
  ),
  (
    '202400001', 'Paolo Andres', 'T', 'Cruz',
    NULL, NULL, 1, NULL, NULL,
    NULL, '202400001@gordoncollege.edu.ph', NULL, NULL
  );

-- ---------------------------------------------------------------------------
-- 3. Scheduling: clinic_schedules -> time_slots (bookable base schedule)
-- ---------------------------------------------------------------------------

-- 3.1 clinic_schedules: a few enabled days mirroring legacy
--     clinic_schedule entries + one disabled day (closure example).
INSERT INTO "clinic_schedules" (
  "working_date", "work_start", "work_end",
  "break_start", "break_end", "is_enabled", "closure_reason"
) VALUES
  ('2026-08-23', '08:00:00', '23:59:00', '12:00:00', '13:00:00', TRUE,  NULL),
  ('2026-08-26', '09:00:00', '13:00:00', '10:30:00', '11:00:00', TRUE,  NULL),
  ('2026-08-28', '09:00:00', '12:00:00', '10:30:00', '11:00:00', TRUE,  NULL),
  ('2026-08-30', '09:00:00', '12:00:00', '10:30:00', '11:00:00', TRUE,  NULL),
  ('2026-12-25', '08:00:00', '17:00:00', NULL,        NULL,       FALSE, 'Christmas Day - Clinic Closed');

-- 3.2 time_slots: a couple of 30-minute slots per enabled day
--     (max_capacity = clinic_appointment_settings.max_students_per_slot = 8;
--     the disabled 2026-12-25 day intentionally gets no slots).
INSERT INTO "time_slots" ("schedule_id", "slot_start", "slot_end", "max_capacity")
SELECT s."schedule_id", t."slot_start", t."slot_end", 8
FROM "clinic_schedules" s
JOIN (VALUES
  ('2026-08-23'::date, '08:00:00'::time, '08:30:00'::time),
  ('2026-08-23',        '08:30:00',      '09:00:00'),
  ('2026-08-26',        '09:00:00',      '09:30:00'),
  ('2026-08-26',        '09:30:00',      '10:00:00'),
  ('2026-08-28',        '09:00:00',      '09:30:00'),
  ('2026-08-28',        '09:30:00',      '10:00:00'),
  ('2026-08-28',        '10:00:00',      '10:30:00'),
  ('2026-08-30',        '09:00:00',      '09:30:00'),
  ('2026-08-30',        '09:30:00',      '10:00:00'),
  ('2026-08-30',        '10:00:00',      '10:30:00')
) AS t(working_date, slot_start, slot_end)
ON t.working_date = s."working_date";

-- ---------------------------------------------------------------------------
-- 4. Login identities: app_accounts (one per school_account_directory row)
-- ---------------------------------------------------------------------------

-- Email = school_account_directory.school_email (NOTE: admin001 logs in
-- with admin@gordoncollege.edu.ph, NOT the legacy admin@gccas.com stored
-- in admin_accounts.email; nurse001 logs in with
-- jdramos@gordoncollege.edu.ph). auth_user_id stays NULL - the Supabase
-- Auth user linkage is added in a later step.
INSERT INTO "app_accounts" ("auth_user_id", "email", "account_type", "student_id", "admin_id") VALUES
  (NULL, 'test001@gordoncollege.edu.ph',      'student', 'TEST001',    NULL),
  (NULL, '202411829@gordoncollege.edu.ph',    'student', '202411829',  NULL),
  (NULL, '202400001@gordoncollege.edu.ph',    'student', '202400001',  NULL),
  (NULL, 'admin@gordoncollege.edu.ph',        'admin',   NULL,
    (SELECT "admin_id" FROM "admin_accounts" WHERE "username" = 'admin001')),
  (NULL, 'jdramos@gordoncollege.edu.ph',      'admin',   NULL,
    (SELECT "admin_id" FROM "admin_accounts" WHERE "username" = 'nurse001'));

-- End of clean-schema seed. No appointments / visit logs / status rows
-- are seeded here - demo flows can be seeded later (see
-- scripts/reset_test_data.py for the FRESH-SEED convention).