-- ============================================================
-- 2026-08-29 — Report breakdown aggregation as a Postgres RPC
--
-- Sprint 2 pushed reports aggregation into SQL, but the original
-- implementation used PostgREST in-select aggregates
-- (`.select("current_status,count()")`), which THIS Supabase
-- instance rejects with PGRST123 ("Use of aggregate functions is
-- not allowed") — so GET /api/reports/ 500'd on every date.
--
-- This function does the same grouped counting in PostgreSQL and
-- returns the counts as JSON, so the backend can call it over the
-- RPC endpoint (`POST /rest/v1/rpc/report_breakdown`) instead of
-- using in-select aggregates. It returns one key per breakdown
-- field; each value is an array of {<field>: value, count} rows
-- (the exact shape PostgREST's grouped select would have produced),
-- ordered by descending count. The backend still derives labels /
-- percents / totals from these counts, so the public report shape
-- is unchanged.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, safe to run repeatedly.
--
-- Apply order: after migrations/2026-08-28_clean_rebuild_ddl.sql
-- (requires the report_appointment_rows view). This file only
-- creates a function — no destructive change, no data touched.
--
-- Apply (read-only for data):
--     psql/pg admin connects with the SUPABASE_DB_URL DSN and runs
--     this file as a single script. PostgREST picks the function up
--     on its automatic schema reload (or after a
--     `notify pgrst, 'reload schema';`).
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