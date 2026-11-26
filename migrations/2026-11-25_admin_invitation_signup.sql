-- Invitation signup support for admin_accounts.
--
-- A super-admin-created invite needs a server-issued token so the signup page
-- can prefill/lock the invited email and the backend can prove that the
-- completing account is the invited one. The token is random, single-purpose,
-- and never returned by the admin list API; it only travels in the emailed
-- signup link. This migration is additive and safe to re-run.

ALTER TABLE "admin_accounts"
  ADD COLUMN IF NOT EXISTS "invitation_token" character varying(100);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_accounts_invitation_token_key"
  ON "admin_accounts" ("invitation_token")
  WHERE "invitation_token" IS NOT NULL;

NOTIFY pgrst, 'reload schema';
