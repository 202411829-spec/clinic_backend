-- Additive migration: persistent Data Privacy consent.
-- Existing students remain NULL until they explicitly consent.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "data_privacy_consented_at" timestamptz;

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
  s."data_privacy_consented_at"
FROM "students" s
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "courses" c ON c."course_id" = s."course_id";

NOTIFY pgrst, 'reload schema';
