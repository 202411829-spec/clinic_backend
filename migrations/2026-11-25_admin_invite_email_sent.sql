-- ============================================================
-- 2026-11-25 — Admin invite email tracking
--
-- Additive and idempotent: records when an admin invitation was
-- successfully submitted to the configured email provider. Existing
-- invites have NULL and are treated as "not yet sent", so the next
-- invite/resend attempt sends one and stamps it. No data is backfilled
-- or deleted.
-- ============================================================

ALTER TABLE "admin_accounts"
  ADD COLUMN IF NOT EXISTS "invite_email_sent_at" timestamptz;

NOTIFY pgrst, 'reload schema';
