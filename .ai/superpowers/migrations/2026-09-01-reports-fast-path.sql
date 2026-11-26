-- ============================================================
-- 2026-09-01 — Reports fast-path guarantee + materialized view
--
-- Run in Supabase SQL Editor.  All statements are idempotent
-- (CREATE OR REPLACE / IF NOT EXISTS / CREATE UNIQUE INDEX
-- IF NOT EXISTS), so this file is safe to run repeatedly.
--
-- WHAT THIS DOES:
--   1. Ensures the `report_breakdown` RPC function exists and
--      matches exactly what the Flask router expects (same name,
--      same args, same return shape).  The router will 500 if
--      this function is missing — no more silent fallback to
--      a full-table-scan Python counter.
--   2. Creates `mv_daily_reports`, a materialized view that
--      pre-joins the same data as `report_appointment_rows` but
--      stores it on disk.  Designed for PAST dates: pg_cron
--      refreshes it nightly at 02:00 UTC so yesterday-and-older
--      reports read from the MV instead of re-executing the
--      expensive LATERAL joins on the live view.
--   3. Schedules a nightly `REFRESH MATERIALIZED VIEW CONCURRENTLY`
--      via pg_cron (requires the pg_cron extension).
--   4. Notifies PostgREST to reload its schema cache so the RPC
--      is immediately callable.
--
-- DESIGN NOTE — "mv covers history, live RPC covers today":
--   The MV is refreshed once per day.  Today's live appointments
--   haven't been refreshed yet, so the RPC still queries the live
--   `report_appointment_rows` view for today's date.  Past dates
--   can (in a future step) be routed to the MV for sub-second
--   reads.  This migration creates the infrastructure; the
--   routing logic is a separate PR.
-- ============================================================

-- ── 1. report_breakdown RPC ──────────────────────────────────
-- Matches the exact call the Flask router makes:
--   supabase.rpc("report_breakdown", {
--     "p_report_date": "YYYY-MM-DD",
--     "p_department_id": <int or null>
--   })
-- Returns a JSON object keyed by view column; each value is an
-- array of {<column>: value, count} rows sorted by descending
-- count — the shape _breakdown() in reports.py relabels and
-- turns into [{label, count, percent}].
-- ============================================================

CREATE OR REPLACE FUNCTION public.report_breakdown(
    p_report_date date,
    p_department_id integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- Every bucket the Reports page renders, keyed by the view
    -- column whose distinct values become the bucket labels.
    v_fields text[] := ARRAY[
        'current_status',
        'visit_reason',
        'department_name',
        'complaint',
        'gender',
        'age',
        'student_id'
    ];
    -- The department filter is a no-op when NULL so the same
    -- statement (and same USING params) works for both cases.
    v_where text := 'appointment_date = $1 AND ($2 IS NULL OR department_id = $2)';
    v_key   text;
    v_rows  json;
    v_result jsonb := '{}'::jsonb;
BEGIN
    FOREACH v_key IN ARRAY v_fields LOOP
        EXECUTE format(
            'SELECT coalesce('
            '  json_agg(j ORDER BY (j->>''count'')::int DESC),'
            '  ''[]''::json'
            ' )'
            ' FROM ('
            '  SELECT json_build_object(%L, %I, ''count'', count(*)::int) AS j'
            '  FROM report_appointment_rows'
            '  WHERE %s'
            '  GROUP BY %I'
            ' ) x',
            v_key, v_key, v_where, v_key
        ) INTO v_rows USING p_report_date, p_department_id;

        v_result := v_result || jsonb_build_object(v_key, to_jsonb(v_rows));
    END LOOP;

    RETURN v_result::json;
END;
$$;


-- ── 2. Materialized view for past-date reports ───────────────
-- Same column shape as `report_appointment_rows` but stored on
-- disk.  The expensive LATERAL joins (latest status, latest
-- complaint) are baked in at refresh time instead of re-executed
-- on every report request.
--
-- A UNIQUE INDEX on appointment_id is required for
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (which avoids
-- locking the view during the nightly refresh).
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_daily_reports AS
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

-- UNIQUE INDEX required for CONCURRENTLY refresh (Postgres docs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_reports_appointment_id
  ON public.mv_daily_reports ("appointment_id");

-- Read-path index: most queries filter by date.
CREATE INDEX IF NOT EXISTS idx_mv_daily_reports_appointment_date
  ON public.mv_daily_reports ("appointment_date");


-- ── 3. pg_cron: nightly refresh at 02:00 UTC ────────────────
-- REFRESH MATERIALIZED VIEW CONCURRENTLY rebuilds the MV
-- without holding an exclusive lock (reads continue during the
-- refresh), using the unique index above to swap data in place.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'refresh-daily-reports',         -- job name
    '0 2 * * *',                     -- cron: every day at 02:00 UTC
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_reports$$
);


-- ── 4. Notify PostgREST to reload schema cache ──────────────
-- PostgREST caches schema metadata (functions, views, etc.)
-- and only picks up new/replaced objects after a reload event.
-- The NOTIFY pgrst event triggers an immediate reload so the
-- report_breakdown RPC is callable without a PostgREST restart.
-- ============================================================

NOTIFY pgrst, 'reload schema';
