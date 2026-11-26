-- Additive migration: structured name fields for admin signup requests.
-- Existing admin rows keep NULL middle_initial/suffix values.

ALTER TABLE "admin_accounts"
  ADD COLUMN IF NOT EXISTS "middle_initial" character varying(10),
  ADD COLUMN IF NOT EXISTS "suffix" character varying(20);

NOTIFY pgrst, 'reload schema';
