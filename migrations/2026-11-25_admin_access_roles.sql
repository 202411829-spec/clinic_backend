-- ============================================================
-- 2026-11-25 — Admin access roles: admin | super_admin
--
-- Replaces the legacy `nurse` / `doctor` access roles with the
-- two-tier `admin` / `super_admin` model.
--
-- Additive and idempotent: no accounts, rows, or columns are
-- deleted. Safe to re-run.
--
-- Order matters:
--   1. Drop only stale CHECK constraints on admin_accounts that
--      mention the old role values (the live constraint name is
--      unknown), so the backfill cannot be blocked by a legacy
--      nurse/doctor CHECK.
--   2. Backfill legacy/NULL roles to 'admin'.
--   3. Promote the admin linked to app_accounts.email =
--      admin@gordoncollege.edu.ph to 'super_admin'.
--   4. Default new rows to 'admin'.
--   5. Add the new CHECK allowing only admin/super_admin.
-- ============================================================

-- 1) Drop stale role CHECK constraints (definition mentions the old
--    role values). Only CHECK constraints on admin_accounts are
--    considered; nothing else is touched.
DO $$
DECLARE
  stale_constraint RECORD;
BEGIN
  FOR stale_constraint IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'admin_accounts'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE ANY (ARRAY['%nurse%', '%doctor%'])
  LOOP
    EXECUTE format('ALTER TABLE "admin_accounts" DROP CONSTRAINT %I', stale_constraint.conname);
  END LOOP;
END $$;

-- 2) Backfill legacy roles (and any NULL) to 'admin'.
UPDATE "admin_accounts"
   SET "role" = 'admin'
 WHERE "role" IS NULL
    OR lower("role") IN ('nurse', 'doctor');

-- 3) The admin who logs in with admin@gordoncollege.edu.ph becomes
--    the initial super_admin.
UPDATE "admin_accounts" AS a
   SET "role" = 'super_admin'
  FROM "app_accounts" AS acc
 WHERE acc."admin_id" = a."admin_id"
   AND acc."account_type" = 'admin'
   AND lower(acc."email") = 'admin@gordoncollege.edu.ph';

-- 4) New admin rows default to 'admin'.
ALTER TABLE "admin_accounts"
  ALTER COLUMN "role" SET DEFAULT 'admin';

-- 5) Only 'admin' and 'super_admin' are allowed from now on.
ALTER TABLE "admin_accounts"
  DROP CONSTRAINT IF EXISTS "admin_accounts_role_check";

ALTER TABLE "admin_accounts"
  ADD CONSTRAINT "admin_accounts_role_check"
  CHECK ("role" IN ('admin', 'super_admin'));

NOTIFY pgrst, 'reload schema';
