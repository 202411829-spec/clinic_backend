-- Additive migration: optional name suffixes and structured emergency-contact names.
-- Existing rows keep NULL suffix/name columns; legacy contact_name is untouched.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "suffix" character varying(20);

ALTER TABLE "emergency_contacts"
  ADD COLUMN IF NOT EXISTS "first_name" character varying(200),
  ADD COLUMN IF NOT EXISTS "middle_initial" character varying(10),
  ADD COLUMN IF NOT EXISTS "last_name" character varying(200),
  ADD COLUMN IF NOT EXISTS "suffix" character varying(20);

CREATE OR REPLACE VIEW "student_masterlist" AS
SELECT
  s."student_id",
  s."last_name",
  s."first_name",
  s."middle_initial",
  (s."last_name" || ', ' || s."first_name"
     || COALESCE(' ' || left(s."middle_initial", 1) || '.', '')) AS "full_name",
  d."department_id",
  d."department_name",
  c."course_id",
  c."course_name",
  s."year_level",
  s."gender",
  s."birth_date",
  date_part('year', age(s."birth_date"))::integer AS "age",
  s."contact_number",
  s."email",
  s."civil_status",
  s."present_address",
  s."data_privacy_consented_at",
  s."suffix"
FROM "students" s
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "courses" c ON c."course_id" = s."course_id";

NOTIFY pgrst, 'reload schema';
