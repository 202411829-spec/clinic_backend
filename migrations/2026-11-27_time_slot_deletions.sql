-- ============================================================
-- 2026-11-27 — Persisted time-block deletions
--
-- Additive and idempotent. No existing rows are modified and no
-- appointment data is removed. This table remembers a time block that
-- an admin deliberately removed for a date/scope so regenerating the
-- day's schedule (or serving the default/virtual slots) cannot bring
-- the same block back on reload.
--
-- Apply alongside the reason-scoped schedule migration. NULL reason_id
-- is the legacy general scope; a non-NULL value is an exact reason scope.
-- Partial unique indexes are used because Postgres UNIQUE treats NULLs
-- as distinct.
-- ============================================================

CREATE TABLE IF NOT EXISTS "time_slot_deletions" (
  "deletion_id"   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "working_date"  date NOT NULL,
  "slot_start"    time NOT NULL,
  "slot_end"      time NOT NULL,
  "reason_id"     bigint,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_time_slot_deletions_general"
  ON "time_slot_deletions" ("working_date", "slot_start")
  WHERE "reason_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_time_slot_deletions_reason"
  ON "time_slot_deletions" ("working_date", "slot_start", "reason_id")
  WHERE "reason_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_time_slot_deletions_scope"
  ON "time_slot_deletions" ("working_date", "reason_id");
