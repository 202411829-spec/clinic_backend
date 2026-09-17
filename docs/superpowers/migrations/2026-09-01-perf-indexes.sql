-- ============================================================
-- Performance indexes for Masterlist sort/search + Years dropdown
-- PR #1 of 1-week scalable refactor
--
-- Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor).
-- All statements use IF NOT EXISTS so they are safe to re-run.
-- ============================================================

-- B-tree indexes for exact-match filters and ORDER BY clauses
-- used by the Masterlist students endpoint.
CREATE INDEX IF NOT EXISTS idx_students_last_name ON students(last_name);
CREATE INDEX IF NOT EXISTS idx_students_first_name ON students(first_name);
CREATE INDEX IF NOT EXISTS idx_students_year_level ON students(year_level);

-- Composite index for visit_logs sorted by created_at (used by logbook).
-- The DESC order matches the most common query pattern (newest first).
CREATE INDEX IF NOT EXISTS idx_visit_logs_created_at ON visit_logs(created_at DESC, visit_log_id DESC);

-- Trigram extension + GIN indexes for ILIKE / fuzzy search on names.
-- This makes "search by surname" fast even with leading wildcards
-- (e.g. WHERE last_name ILIKE '%santos%') — the pattern the Masterlist
-- search bar uses.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_students_last_name_trgm ON students USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_first_name_trgm ON students USING gin (first_name gin_trgm_ops);
