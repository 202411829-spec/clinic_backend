-- ============================================================
-- 2026-08-28 — Clean-schema REBUILD (DDL)
--
-- Source of truth: docs/superpowers/specs/2026-08-28-final-clean-schema.md
--   - section 2  : the full clean target schema (enums, 22 tables,
--                 2 views) reproduced VERBATIM below.
--   - section 3  : the legacy -> clean mapping this rebuild was derived
--                 from.
--
-- What this script does, in order:
--   1. DROP legacy objects
--        - the 2 legacy views (student_masterlist, report_appointment_rows)
--        - ALL legacy public tables (26) in FK-safe order
--        - the 3 clean enum types if a previous state left them behind
--      Every DROP uses IF EXISTS ... CASCADE so the script is safe to
--      run against a pristine legacy DB, a partially-migrated DB, or a
--      DB that already ran this rebuild.
--   2. Recreate the clean schema (section 2 of the spec), verbatim:
--        - 3 enums      : appointment_status (EXACTLY pending/completed/
--                         no_show/cancelled), account_type, exam_status
--        - 22 tables    : departments, courses, appointment_reasons,
--                         medicines, students, emergency_contacts,
--                         medical_histories, admin_accounts, app_accounts,
--                         clinic_appointment_settings, clinic_schedules,
--                         time_slots, appointments,
--                         appointment_status_history, visit_logs,
--                         visit_log_medicines, annual_examinations,
--                         physical_examinations, laboratory_results,
--                         chest_xrays, medical_certificates, feedback
--        - 2 views      : student_masterlist, report_appointment_rows
--
-- Idempotency: the DROP section at the top removes everything that
-- would block re-creation, so the whole file can be applied more than
-- once (e.g. to re-seed after schema tweaks).
--
-- Apply order: ALWAYS run this DDL file BEFORE
-- migrations/2026-08-28_clean_seed.sql. The driver
-- scripts/run_clean_rebuild.py does this for you.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. DROP LEGACY OBJECTS (idempotent — IF EXISTS ... CASCADE everywhere)
-- ---------------------------------------------------------------------------

-- 1a. Legacy support views (must go before the tables they select from).
DROP VIEW IF EXISTS "student_masterlist" CASCADE;
DROP VIEW IF EXISTS "report_appointment_rows" CASCADE;
-- Legacy `feedback` is a TABLE; the view-form DROP below only covers the
-- (unlikely) case where some environment created it as a view.
DROP VIEW IF EXISTS "feedback" CASCADE;

-- 1b. Legacy tables, FK-safe order (children before parents).
--     `Login` is quoted because it was created with a capital L; the
--     lower-case variant is dropped too in case it was created unquoted.
DROP TABLE IF EXISTS "Login" CASCADE;
DROP TABLE IF EXISTS "login" CASCADE;
DROP TABLE IF EXISTS "appointment_log_medicine" CASCADE;  -- FK -> appointment_log, medicines
DROP TABLE IF EXISTS "medical_certificate" CASCADE;       -- FK -> appointment_log, annual_examination, admin
DROP TABLE IF EXISTS "appointment_log" CASCADE;           -- FK -> appointment, status, admin
DROP TABLE IF EXISTS "status" CASCADE;                    -- FK -> appointment, admin
DROP TABLE IF EXISTS "appointment" CASCADE;               -- FK -> student, time_slot, reason
DROP TABLE IF EXISTS "time_slot" CASCADE;                 -- FK -> clinic_schedule
DROP TABLE IF EXISTS "feedback" CASCADE;
DROP TABLE IF EXISTS "chest_xray" CASCADE;                -- FK -> laboratory_result
DROP TABLE IF EXISTS "laboratory_result" CASCADE;         -- FK -> physical_examination
DROP TABLE IF EXISTS "physical_examination" CASCADE;      -- FK -> annual_examination
DROP TABLE IF EXISTS "annual_examination" CASCADE;        -- FK -> student, admin
DROP TABLE IF EXISTS "emergency_contact" CASCADE;         -- FK -> student
DROP TABLE IF EXISTS "medical_histories" CASCADE;         -- FK -> student
DROP TABLE IF EXISTS "gc_account" CASCADE;                -- FK -> student, admin
DROP TABLE IF EXISTS "personal_information" CASCADE;      -- FK -> student, student_name, department, course_dept
DROP TABLE IF EXISTS "student" CASCADE;
DROP TABLE IF EXISTS "student_name" CASCADE;
DROP TABLE IF EXISTS "school_account_directory" CASCADE;
DROP TABLE IF EXISTS "course_dept" CASCADE;               -- FK -> department
DROP TABLE IF EXISTS "medicines" CASCADE;
DROP TABLE IF EXISTS "reason" CASCADE;
DROP TABLE IF EXISTS "report" CASCADE;               -- legacy redundant aggregate (spec §3 drops it)
DROP TABLE IF EXISTS "clinic_schedule" CASCADE;
DROP TABLE IF EXISTS "clinic_appointment_settings" CASCADE;  -- FK -> admin
DROP TABLE IF EXISTS "department" CASCADE;
DROP TABLE IF EXISTS "admin" CASCADE;

-- 1c. Clean-schema tables from a PREVIOUS run of this script (so the
--     whole file is safe to run twice — the CREATE statements below must
--     never collide with leftovers). FK-safe order, children first.
DROP VIEW IF EXISTS "student_masterlist" CASCADE;
DROP VIEW IF EXISTS "report_appointment_rows" CASCADE;
DROP TABLE IF EXISTS "feedback" CASCADE;
DROP TABLE IF EXISTS "medical_certificates" CASCADE;      -- FK -> visit_logs, annual_examinations, admin_accounts
DROP TABLE IF EXISTS "visit_log_medicines" CASCADE;       -- FK -> visit_logs, medicines
DROP TABLE IF EXISTS "visit_logs" CASCADE;                -- FK -> appointments, students, admin_accounts
DROP TABLE IF EXISTS "appointment_status_history" CASCADE;-- FK -> appointments, admin_accounts
DROP TABLE IF EXISTS "appointments" CASCADE;              -- FK -> students, time_slots, appointment_reasons
DROP TABLE IF EXISTS "time_slots" CASCADE;                -- FK -> clinic_schedules
DROP TABLE IF EXISTS "clinic_schedules" CASCADE;
DROP TABLE IF EXISTS "clinic_appointment_settings" CASCADE;  -- FK -> admin_accounts
DROP TABLE IF EXISTS "app_accounts" CASCADE;              -- FK -> students, admin_accounts
DROP TABLE IF EXISTS "admin_accounts" CASCADE;
DROP TABLE IF EXISTS "medical_histories" CASCADE;         -- FK -> students
DROP TABLE IF EXISTS "emergency_contacts" CASCADE;        -- FK -> students
DROP TABLE IF EXISTS "students" CASCADE;                  -- FK -> departments, courses
DROP TABLE IF EXISTS "courses" CASCADE;                   -- FK -> departments
DROP TABLE IF EXISTS "departments" CASCADE;
DROP TABLE IF EXISTS "appointment_reasons" CASCADE;
DROP TABLE IF EXISTS "medicines" CASCADE;

-- 1d. Enum types declared by the clean DDL. Dropped IF EXISTS so the
--     CREATE TYPE statements below never collide (CASCADE removes any
--     stray dependent object; tables referencing them are already gone).
DROP TYPE IF EXISTS "appointment_status" CASCADE;
DROP TYPE IF EXISTS "account_type" CASCADE;
DROP TYPE IF EXISTS "exam_status" CASCADE;

-- ---------------------------------------------------------------------------
-- 2. CLEAN SCHEMA — VERBATIM from spec section 2
--    (docs/superpowers/specs/2026-08-28-final-clean-schema.md)
-- ---------------------------------------------------------------------------

-- 2.1 Enums

-- Appointment status: EXACTLY these four values (Decision B). No 'confirmed'.
CREATE TYPE "appointment_status" AS ENUM (
  'pending',
  'completed',
  'no_show',
  'cancelled'
);

-- Account type for app_accounts linkage.
CREATE TYPE "account_type" AS ENUM ('student', 'admin');

-- Annual-examination clearance state (Distinct from appointment status).
CREATE TYPE "exam_status" AS ENUM ('no_record', 'pending', 'cleared');

-- 2.2 Lookup tables: departments, courses, appointment_reasons, medicines

CREATE TABLE "departments" (
  "department_id"    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "department_name"  character varying(200) NOT NULL UNIQUE,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "courses" (
  "course_id"       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "department_id"   bigint NOT NULL REFERENCES "departments"("department_id")
                    ON UPDATE CASCADE ON DELETE RESTRICT,
  "course_name"     character varying(200) NOT NULL UNIQUE,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

-- Canned appointment reasons (was legacy "reason"). Only description + is_active
-- remain; the ambiguous legacy "status" and "remarks" columns are dropped (Decision H).
CREATE TABLE "appointment_reasons" (
  "reason_id"    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "description"  text NOT NULL UNIQUE,
  "is_active"    boolean NOT NULL DEFAULT TRUE,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- Medicine lookup/stock catalog used by the picker + filters (Decision F).
CREATE TABLE "medicines" (
  "medicine_id"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "medicine_name"   character varying(200) NOT NULL UNIQUE,
  "stock_quantity"  integer NOT NULL DEFAULT 0,
  "is_active"       boolean NOT NULL DEFAULT TRUE,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_medicines_stock_nonnegative" CHECK ("stock_quantity" >= 0)
);

-- 2.3 Identity & people: students, emergency_contacts, medical_histories, admin_accounts, app_accounts

-- Single canonical STUDENT record (Decision C). Collapses legacy
-- personal_information + student_name + department/course refs + school_account_directory.
CREATE TABLE "students" (
  "student_id"       character varying(32) PRIMARY KEY,   -- school id, e.g. '202411829'
  "first_name"       character varying(200) NOT NULL,
  "middle_initial"   character varying(10),
  "last_name"        character varying(200) NOT NULL,
  "department_id"    bigint REFERENCES "departments"("department_id")
                     ON UPDATE CASCADE ON DELETE SET NULL,
  "course_id"        bigint REFERENCES "courses"("course_id")
                     ON UPDATE CASCADE ON DELETE SET NULL,
  "year_level"       integer NOT NULL DEFAULT 1,
  "gender"           character varying(20),                -- 'Male' | 'Female'
  "birth_date"       date,
  "contact_number"   character varying(40),
  "email"            character varying(320),               -- school email
  "civil_status"     character varying(40),                -- 'Single' | 'Married'
  "present_address"  text,
  "photo"            text,                                  -- optional 1x1 photo (data URL)
  "is_active"        boolean NOT NULL DEFAULT TRUE,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_students_year_level" CHECK ("year_level" BETWEEN 1 AND 4)
);

CREATE TABLE "emergency_contacts" (
  "contact_id"       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id"       character varying(32) NOT NULL REFERENCES "students"("student_id")
                     ON UPDATE CASCADE ON DELETE CASCADE,
  "contact_name"     character varying(200) NOT NULL,
  "relationship"     character varying(100),
  "phone_number"     character varying(40),
  "present_address"  text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- Medical history: one explicit has_<condition> boolean per condition (legacy set),
-- plus allergy text and operation info (date + procedure, per the feature panel).
CREATE TABLE "medical_histories" (
  "history_id"                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id"                    character varying(32) NOT NULL UNIQUE
                                  REFERENCES "students"("student_id")
                                  ON UPDATE CASCADE ON DELETE CASCADE,
  "has_asthma"                    boolean NOT NULL DEFAULT FALSE,
  "has_chicken_pox"               boolean NOT NULL DEFAULT FALSE,
  "has_diabetes"                  boolean NOT NULL DEFAULT FALSE,
  "has_dysmenorrhea"              boolean NOT NULL DEFAULT FALSE,
  "has_epilepsy_seizure"          boolean NOT NULL DEFAULT FALSE,
  "has_heart_disorder"            boolean NOT NULL DEFAULT FALSE,
  "has_hepatitis"                 boolean NOT NULL DEFAULT FALSE,
  "has_hypertension"              boolean NOT NULL DEFAULT FALSE,
  "has_measles"                   boolean NOT NULL DEFAULT FALSE,
  "has_mumps"                     boolean NOT NULL DEFAULT FALSE,
  "has_anxiety_disorder"          boolean NOT NULL DEFAULT FALSE,
  "has_panic_attack"              boolean NOT NULL DEFAULT FALSE,
  "has_pneumonia"                 boolean NOT NULL DEFAULT FALSE,
  "has_tb_primary_complex"        boolean NOT NULL DEFAULT FALSE,
  "has_typhoid_fever"             boolean NOT NULL DEFAULT FALSE,
  "has_covid19"                   boolean NOT NULL DEFAULT FALSE,
  "has_urinary_tract_infection"   boolean NOT NULL DEFAULT FALSE,
  "allergies"                     text,                      -- allergy specify text
  "has_operation_history"         boolean NOT NULL DEFAULT FALSE,
  "operation_procedure"           text,                      -- previousOperation.procedure
  "operation_date"                date,                      -- previousOperation.date
  "created_at"                    timestamptz NOT NULL DEFAULT now(),
  "updated_at"                    timestamptz NOT NULL DEFAULT now()
);

-- Clinic staff / admin accounts (was legacy "admin"). "firstname" renamed to first_name.
CREATE TABLE "admin_accounts" (
  "admin_id"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "username"     character varying(100) NOT NULL UNIQUE,
  "first_name"   character varying(200) NOT NULL,
  "last_name"    character varying(200) NOT NULL,
  "email"        character varying(320) NOT NULL UNIQUE,
  "role"         character varying(50) NOT NULL DEFAULT 'admin',
  "license_no"   character varying(100),
  "is_active"    boolean NOT NULL DEFAULT TRUE,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- THE single auth/identity linkage table (Decision A): maps an authenticated Supabase
-- user to a student OR an admin. No RLS. Enables school login (username -> email).
-- auth_user_id is a plain uuid (no auth.users dependency) so DDL stays self-contained.
CREATE TABLE "app_accounts" (
  "account_id"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "auth_user_id"   uuid UNIQUE,
  "email"          character varying(320) NOT NULL UNIQUE,   -- <username>@gordoncollege.edu.ph
  "account_type"   "account_type" NOT NULL,
  "student_id"     character varying(32) REFERENCES "students"("student_id")
                   ON UPDATE CASCADE ON DELETE CASCADE,
  "admin_id"       bigint REFERENCES "admin_accounts"("admin_id")
                   ON UPDATE CASCADE ON DELETE CASCADE,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_app_account_owner"
    CHECK (
      (("account_type" = 'student'::"account_type") AND "student_id" IS NOT NULL AND "admin_id" IS NULL)
      OR
      (("account_type" = 'admin'::"account_type") AND "admin_id" IS NOT NULL AND "student_id" IS NULL)
    )
);

-- 2.4 Scheduling: clinic_appointment_settings, clinic_schedules, time_slots, appointments, appointment_status_history

-- Singleton clinic scheduling defaults (was clinic_appointment_settings).
CREATE TABLE "clinic_appointment_settings" (
  "setting_id"              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "slot_interval_minutes"   integer NOT NULL DEFAULT 30,
  "max_students_per_slot"   integer NOT NULL DEFAULT 10,
  "work_start"              time NOT NULL,
  "work_end"                time NOT NULL,
  "break_start"             time,
  "break_end"               time,
  "updated_by_admin_id"     bigint REFERENCES "admin_accounts"("admin_id")
                            ON UPDATE CASCADE ON DELETE SET NULL,
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_settings_slot_interval"  CHECK ("slot_interval_minutes" > 0),
  CONSTRAINT "chk_settings_max_students"   CHECK ("max_students_per_slot" > 0)
);

-- Per-date clinic schedule override (was clinic_schedule). "reason" -> closure_reason.
CREATE TABLE "clinic_schedules" (
  "schedule_id"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "working_date"    date NOT NULL,
  "work_start"      time NOT NULL,
  "work_end"        time NOT NULL,
  "break_start"     time,
  "break_end"       time,
  "is_enabled"      boolean NOT NULL DEFAULT TRUE,
  "closure_reason"  text,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

-- Materialized slot instances for a given day (was time_slot).
CREATE TABLE "time_slots" (
  "slot_id"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "schedule_id"    bigint NOT NULL REFERENCES "clinic_schedules"("schedule_id")
                   ON UPDATE CASCADE ON DELETE CASCADE,
  "slot_start"     time NOT NULL,
  "slot_end"       time NOT NULL,
  "max_capacity"   integer NOT NULL DEFAULT 10,
  "booked_count"   integer NOT NULL DEFAULT 0,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_time_slots_capacity"     CHECK ("max_capacity" > 0),
  CONSTRAINT "chk_time_slots_booked_counts" CHECK ("booked_count" >= 0 AND "booked_count" <= "max_capacity")
);

-- Appointments (was appointment). slot is NULLABLE (Decision E); student is NULLABLE
-- for walk-ins (Decision D); date + time required (Decision E).
CREATE TABLE "appointments" (
  "appointment_id"      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id"          character varying(32) REFERENCES "students"("student_id")
                        ON UPDATE CASCADE ON DELETE CASCADE,
  "time_slot_id"        bigint REFERENCES "time_slots"("slot_id")
                        ON UPDATE CASCADE ON DELETE RESTRICT,
  "reason_id"           bigint REFERENCES "appointment_reasons"("reason_id")
                        ON UPDATE CASCADE ON DELETE SET NULL,
  "appointment_date"    date NOT NULL,
  "appointment_time"    time NOT NULL,
  "appointment_purpose" text,
  "is_walk_in"          boolean NOT NULL DEFAULT FALSE,
  "booked_at"           timestamptz NOT NULL DEFAULT now(),
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

-- Appointment status history / audit (was "status"). Latest row by changed_at wins.
-- Statuses restricted to the four-value enum (Decision B). Never in-place updated.
CREATE TABLE "appointment_status_history" (
  "status_id"             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "appointment_id"        bigint NOT NULL REFERENCES "appointments"("appointment_id")
                          ON UPDATE CASCADE ON DELETE CASCADE,
  "previous_status"       "appointment_status",          -- NULL on first insert
  "new_status"            "appointment_status" NOT NULL,
  "remarks"               text,
  "changed_by_admin_id"   bigint REFERENCES "admin_accounts"("admin_id")
                          ON UPDATE CASCADE ON DELETE SET NULL,
  "changed_at"            timestamptz NOT NULL DEFAULT now()
);

-- 2.5 Logbook / visits / medicines dispensed

-- A clinic visit (was appointment_log). Patient link NULLABLE + inline walk-in fields
-- (Decision D). attending_admin_id renamed from admin_id.
CREATE TABLE "visit_logs" (
  "visit_log_id"               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "appointment_id"             bigint REFERENCES "appointments"("appointment_id")
                               ON UPDATE CASCADE ON DELETE SET NULL,
  "student_id"                 character varying(32) REFERENCES "students"("student_id")
                               ON UPDATE CASCADE ON DELETE SET NULL,
  "attending_admin_id"         bigint REFERENCES "admin_accounts"("admin_id")
                               ON UPDATE CASCADE ON DELETE SET NULL,
  "is_walk_in"                 boolean NOT NULL DEFAULT FALSE,
  "walk_in_name"               text,
  "walk_in_age"                integer,
  "walk_in_sex"                text,
  "walk_in_contact"            text,
  "walk_in_department_course"  text,
  "complaint"                  text,
  "created_at"                 timestamptz NOT NULL DEFAULT now(),
  "updated_at"                 timestamptz NOT NULL DEFAULT now()
);

-- Medicines dispensed on a visit (was appointment_log_medicine).
-- Stores a denormalized medicine_name SNAPSHOT (Decision F) so historical
-- prescriptions survive later edits of the medicines lookup.
CREATE TABLE "visit_log_medicines" (
  "visit_medicine_id"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "visit_log_id"       bigint NOT NULL REFERENCES "visit_logs"("visit_log_id")
                       ON UPDATE CASCADE ON DELETE CASCADE,
  "medicine_id"        bigint REFERENCES "medicines"("medicine_id")
                       ON UPDATE CASCADE ON DELETE RESTRICT,
  "medicine_name"      character varying(200) NOT NULL,   -- snapshot at time of dispensing
  "quantity_dispensed" integer NOT NULL DEFAULT 1,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_visit_log_medicines_qty" CHECK ("quantity_dispensed" > 0)
);

-- 2.6 Medical records: annual_examinations, physical_examinations, laboratory_results, chest_xrays, medical_certificates

-- Annual examination per student + academic year (was annual_examination).
-- exam_status is the CLEARANCE state (no_record/pending/cleared) — distinct from
-- the appointment-status enum (Decision B).
CREATE TABLE "annual_examinations" (
  "annual_exam_id"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id"            character varying(32) NOT NULL REFERENCES "students"("student_id")
                          ON UPDATE CASCADE ON DELETE CASCADE,
  "school_year"           character varying(32) NOT NULL,   -- e.g. '2025-2026'
  "year_label"            character varying(32) NOT NULL,   -- 'Year I'..'Year IV'
  "exam_status"           "exam_status" NOT NULL DEFAULT 'no_record',
  "date_examined"         date,
  "examined_by_admin_id"  bigint REFERENCES "admin_accounts"("admin_id")
                          ON UPDATE CASCADE ON DELETE SET NULL,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_annual_exam_year" UNIQUE ("student_id", "year_label")
);

-- Physical examination per annual exam (was physical_examination).
-- Resolves the legacy duplication: ONE <system>_result column holds the finding
-- value ('Normal'/'With Findings'), and a matching <system>_remarks column holds the
-- free-text remark (BOTH are needed by the feature panel: findings{} + findingsRemarks{}).
CREATE TABLE "physical_examinations" (
  "examination_id"           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "annual_exam_id"           bigint NOT NULL UNIQUE REFERENCES "annual_examinations"("annual_exam_id")
                             ON UPDATE CASCADE ON DELETE CASCADE,
  "blood_pressure"           character varying(20),
  "cardiac_rate"             numeric(6,1),
  "respiratory_rate"         numeric(6,1),
  "temperature"              numeric(5,2),
  "weight_kg"                numeric(7,2),
  "height_cm"                numeric(7,2),
  "bmi"                      numeric(7,2),
  "visual_acuity"            character varying(50),
  "skin_result"              character varying(50) NOT NULL DEFAULT 'Normal',
  "skin_remarks"             text,
  "heent_result"             character varying(50) NOT NULL DEFAULT 'Normal',
  "heent_remarks"            text,
  "heart_result"             character varying(50) NOT NULL DEFAULT 'Normal',
  "heart_remarks"            text,
  "abdomen_result"           character varying(50) NOT NULL DEFAULT 'Normal',
  "abdomen_remarks"          text,
  "extremities_result"       character varying(50) NOT NULL DEFAULT 'Normal',
  "extremities_remarks"      text,
  "other_findings_result"    character varying(50) NOT NULL DEFAULT 'Normal',
  "other_findings_remarks"   text,
  "other_findings_label"     text,
  "general_remarks"          text,
  "final_assessment"         text,
  "examined_by_admin_id"     bigint REFERENCES "admin_accounts"("admin_id")
                             ON UPDATE CASCADE ON DELETE SET NULL,
  "examined_at"              timestamptz NOT NULL DEFAULT now(),
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

-- Laboratory results per physical exam (was laboratory_result).
CREATE TABLE "laboratory_results" (
  "lab_result_id"          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "examination_id"         bigint NOT NULL UNIQUE REFERENCES "physical_examinations"("examination_id")
                           ON UPDATE CASCADE ON DELETE CASCADE,
  "cbc_date"               date,
  "hemoglobin"             numeric(7,2),
  "hematocrit"             numeric(7,2),
  "wbc"                    numeric(8,2),
  "platelet_count"         numeric(10,2),
  "blood_type"             character varying(10),   -- A+/A-/B+/B-/AB+/AB-/O+/O-
  "urinalysis_date"        date,
  "glucose"                character varying(20),   -- Negative/Trace/1+/2+/3+/4+
  "protein"                character varying(20),
  "other_examination_type" character varying(100),
  "other_date"             date,
  "other_results"          text,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

-- Chest x-ray per lab result (was chest_xray).
CREATE TABLE "chest_xrays" (
  "chest_xray_id"     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "lab_result_id"     bigint NOT NULL UNIQUE REFERENCES "laboratory_results"("lab_result_id")
                      ON UPDATE CASCADE ON DELETE CASCADE,
  "chest_xray_date"   date,
  "chest_xray_result" text,
  "chest_xray_notes"  text,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

-- Medical certificate / diagnosis & final remark (was medical_certificate).
-- purposes is TEXT[] with default empty array (Decision G).
-- chk_certificate_source preserved: exactly one of log_id / annual_exam_id (Decision G).
CREATE TABLE "medical_certificates" (
  "certificate_id"        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "log_id"                bigint REFERENCES "visit_logs"("visit_log_id")
                          ON UPDATE CASCADE ON DELETE SET NULL,
  "annual_exam_id"        bigint REFERENCES "annual_examinations"("annual_exam_id")
                          ON UPDATE CASCADE ON DELETE CASCADE,
  "diagnosis"             text,
  "final_remark"          text,
  "is_essentially_normal" boolean NOT NULL DEFAULT FALSE,
  "purposes"              text[] NOT NULL DEFAULT '{}',
  "date_issued"           date NOT NULL DEFAULT CURRENT_DATE,
  "valid_until"           date,
  "prepared_by_admin_id"  bigint REFERENCES "admin_accounts"("admin_id")
                          ON UPDATE CASCADE ON DELETE SET NULL,
  "approved_by_admin_id"  bigint REFERENCES "admin_accounts"("admin_id")
                          ON UPDATE CASCADE ON DELETE SET NULL,
  "remarks"               text,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now(),
  -- Preserve chk_certificate_source meaning: exactly one of log_id / annual_exam_id (XOR).
  CONSTRAINT "chk_certificate_source"
    CHECK ((("log_id" IS NOT NULL) <> ("annual_exam_id" IS NOT NULL)))
);

-- 2.7 Feedback (new)

-- Feedback from students (new table; migration previously existed for feedback).
CREATE TABLE "feedback" (
  "feedback_id"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "student_id"   character varying(32) NOT NULL REFERENCES "students"("student_id")
                 ON UPDATE CASCADE ON DELETE CASCADE,
  "rating"       integer NOT NULL,
  "message"      text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_feedback_rating" CHECK ("rating" BETWEEN 1 AND 5)
);

-- 2.8 Views (preserved support objects)

-- student_masterlist — single source-of-truth flattened student view (Decision C)
CREATE VIEW "student_masterlist" AS
SELECT
  s."student_id",
  s."last_name",
  s."first_name",
  s."middle_initial",
  (s."last_name" || ', ' || s."first_name"
     || COALESCE(' ' || left(s."middle_initial", 1) || '.', '')) AS "full_name",
  d."department_id",
  d."department_name",
  c."course_id",
  c."course_name",
  s."year_level",
  s."gender",
  s."birth_date",
  date_part('year', age(s."birth_date"))::integer AS "age",
  s."contact_number",
  s."email",
  s."civil_status",
  s."present_address"
FROM "students" s
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "courses" c ON c."course_id" = s."course_id";

-- report_appointment_rows — flattened appointments for reports; latest-status-wins preserved
CREATE VIEW "report_appointment_rows" AS
SELECT
  a."appointment_id",
  a."student_id",
  a."appointment_date",
  a."appointment_time",
  r."description" AS "visit_reason",
  d."department_id",
  d."department_name",
  COALESCE(vl."walk_in_sex", s."gender") AS "gender",
  COALESCE(vl."walk_in_age", date_part('year', age(s."birth_date"))::integer) AS "age",
  latest_status."new_status" AS "current_status",
  latest_log."complaint"
FROM "appointments" a
LEFT JOIN "appointment_reasons" r ON r."reason_id" = a."reason_id"
LEFT JOIN "students" s ON s."student_id" = a."student_id"
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "visit_logs" vl ON vl."appointment_id" = a."appointment_id"
LEFT JOIN LATERAL (
  SELECT h."new_status"
  FROM "appointment_status_history" h
  WHERE h."appointment_id" = a."appointment_id"
  ORDER BY h."changed_at" DESC NULLS LAST, h."status_id" DESC
  LIMIT 1
) latest_status ON TRUE
LEFT JOIN LATERAL (
  SELECT l."complaint"
  FROM "visit_logs" l
  WHERE l."appointment_id" = a."appointment_id"
  ORDER BY l."created_at" DESC NULLS LAST, l."visit_log_id" DESC
  LIMIT 1
) latest_log ON TRUE;

-- End of clean-schema DDL (spec section 2). Apply the seed file next.