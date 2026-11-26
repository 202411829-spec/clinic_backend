-- ============================================================
-- 2026-11-26 — Dental Service reason + reason-scoped clinic schedules
--
-- Additive and idempotent: no rows or columns are dropped, no
-- existing clinic_schedules / time_slots rows are modified, and no
-- backfill is performed. Safe to re-run.
--
-- What it does, in order:
--   1. appointment_reasons.uses_dedicated_schedule — marks a reason
--      that books against its OWN clinic_schedules rows instead of
--      the legacy date-wide general schedule (default false keeps
--      every existing reason on the general schedule).
--   2. clinic_schedules.reason_id — optional scope on a schedule
--      row. NULL = the legacy general schedule for that date (all
--      pre-existing rows keep NULL untouched); a value = schedules
--      belonging to that dedicated reason only.
--   3. Seeds the active 'Dental Service' reason idempotently if it
--      is absent and forces its dedicated flag on. NEVER inserts
--      clinic_schedules/time_slots rows — a dedicated reason starts
--      with no configured availability until an admin creates its
--      schedule through POST /clinic-schedule?reason_id=... (or the
--      body equivalent).
--   4. Composite index for the (working_date, reason_id) lookups
--      every reason-scoped schedule query now performs.
--
-- Apply AFTER migrations/2026-08-28_clean_rebuild_ddl.sql +
-- 2026-08-28_clean_seed.sql (those already define the columns and
-- seed the third reason), or against a live schema to upgrade it.
-- ============================================================

-- 1) Reason flag: dedicated schedules are opt-in per reason.
ALTER TABLE "appointment_reasons"
  ADD COLUMN IF NOT EXISTS "uses_dedicated_schedule" boolean NOT NULL DEFAULT false;

-- 2) Optional reason scope on schedules: NULL = legacy general schedule.
--    ON DELETE SET NULL keeps a schedule row if its reason ever goes away
--    (it simply becomes a general schedule again); no cascade surprises.
ALTER TABLE "clinic_schedules"
  ADD COLUMN IF NOT EXISTS "reason_id" bigint
  REFERENCES "appointment_reasons" ("reason_id")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- 3) Seed the Dental Service reason idempotently (UNIQUE on
--    description is the conflict target). Active on insert; a re-run
--    only re-asserts the dedicated flag. No schedule rows are created.
INSERT INTO "appointment_reasons" ("description", "is_active", "uses_dedicated_schedule")
VALUES ('Dental Service', TRUE, TRUE)
ON CONFLICT ("description") DO UPDATE
SET "uses_dedicated_schedule" = TRUE,
    "updated_at" = now();

-- 4) Helpful index for reason-scoped schedule lookups
--    (GET /clinic-schedule/<date>?reason_id=..., closed-date checks,
--    duplicate collapsing on POST /clinic-schedule).
CREATE INDEX IF NOT EXISTS "idx_clinic_schedules_working_date_reason_id"
  ON "clinic_schedules" ("working_date", "reason_id");

-- Reload PostgREST's schema cache so the new columns are queryable
-- over the API immediately after applying.
NOTIFY pgrst, 'reload schema';
