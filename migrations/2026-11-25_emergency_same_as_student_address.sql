-- Additive migration: remember whether the emergency contact address is the
-- same as the student's present address. Existing rows default to false, so
-- saved separate addresses keep their current behavior.

ALTER TABLE "emergency_contacts"
  ADD COLUMN IF NOT EXISTS "same_as_student_address" boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
