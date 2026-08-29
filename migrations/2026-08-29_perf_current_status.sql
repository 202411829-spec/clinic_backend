-- ============================================================
-- 2026-08-29 — Performance hardening: denormalized
-- appointments.current_status + read-path indexes
--
-- Sprint 1 (P0) for ~7,000 students. Makes "latest status wins"
-- a single-column read (with one supporting index) instead of a
-- whole-history-table fetch in Python, and adds the indexes the
-- logbook / slots / reports read paths scan on.
--
-- Safe to run REPEATEDLY (idempotent):
--   * ADD COLUMN / CREATE INDEX use IF NOT EXISTS
--   * the backfill UPDATE only touches rows where current_status
--     is still NULL, so re-runs are no-ops
--
-- Apply order: run AFTER migrations/2026-08-28_clean_rebuild_ddl.sql
-- (it requires the appointments / appointment_status_history tables
-- and the "appointment_status" enum).
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Denormalized "current status" column on appointments.
--
-- Mirrors the "appointment_status" enum used by
-- appointment_status_history.new_status (pending/completed/
-- no_show/cancelled). Kept WITHOUT a default: walk-in appointments
-- have no status history row and must read as NULL (the Python
-- readers treat a missing status the same as today's empty-lookup case).
-- ---------------------------------------------------------------------------
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "current_status" "appointment_status";

-- ---------------------------------------------------------------------------
-- 2. Backfill: current_status = the latest history row per appointment.
--
-- Same "latest row wins" rule the report_appointment_rows view uses:
-- ORDER BY changed_at DESC (NULLS LAST) then status_id DESC to break
-- ties deterministically. DISTINCT ON picks exactly one row per
-- appointment_id. Only fills rows that are still NULL, so the sweep
-- is a no-op on repeat runs.
-- ---------------------------------------------------------------------------
UPDATE "appointments" a
SET "current_status" = h."new_status"
FROM (
    SELECT DISTINCT ON (h."appointment_id")
           h."appointment_id",
           h."new_status"
    FROM "appointment_status_history" h
    ORDER BY h."appointment_id", h."changed_at" DESC NULLS LAST, h."status_id" DESC
) h
WHERE a."appointment_id" = h."appointment_id"
  AND a."current_status" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Read-path indexes (all IF NOT EXISTS → idempotent).
--
-- These cover the hot queries in Sprint 1:
--   * logbook list / student log: appointments by date, by student,
--     visit_logs by appointment, visit_log_medicines by visit_log
--   * slots panel: appointments by time_slot_id
--   * dashboard: appointments by appointment_date
--   * reports/masterlist joins: students by department/course
--   * schedule preview/clinic closed checks: clinic_schedules by date
--   * status reads: appointment_status_history by (appointment_id,
--     changed_at DESC) — the (changed_at) index serves whole-table
--     queries like notifications' "all changes" path.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_appointments_appointment_date"
  ON "appointments" ("appointment_date");

CREATE INDEX IF NOT EXISTS "idx_appointments_student_id"
  ON "appointments" ("student_id");

CREATE INDEX IF NOT EXISTS "idx_appointments_time_slot_id"
  ON "appointments" ("time_slot_id");

CREATE INDEX IF NOT EXISTS "idx_appointment_status_history_appointment_changed_at"
  ON "appointment_status_history" ("appointment_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_appointment_status_history_changed_at"
  ON "appointment_status_history" ("changed_at");

CREATE INDEX IF NOT EXISTS "idx_visit_logs_appointment_id"
  ON "visit_logs" ("appointment_id");

CREATE INDEX IF NOT EXISTS "idx_students_department_id"
  ON "students" ("department_id");

CREATE INDEX IF NOT EXISTS "idx_students_course_id"
  ON "students" ("course_id");

CREATE INDEX IF NOT EXISTS "idx_clinic_schedules_working_date"
  ON "clinic_schedules" ("working_date");

CREATE INDEX IF NOT EXISTS "idx_visit_log_medicines_visit_log_id"
  ON "visit_log_medicines" ("visit_log_id");