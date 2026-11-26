-- Additive migration: optional structured present-address fields.
-- Legacy students.present_address is untouched; no backfill or parsing is
-- performed. Existing rows keep NULL address_* columns.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "address_region_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_province_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_city_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_barangay_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_street" text,
  ADD COLUMN IF NOT EXISTS "address_house_number" text;

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
  s."suffix",
  s."address_region_code",
  s."address_province_code",
  s."address_city_code",
  s."address_barangay_code",
  s."address_street",
  s."address_house_number"
FROM "students" s
LEFT JOIN "departments" d ON d."department_id" = s."department_id"
LEFT JOIN "courses" c ON c."course_id" = s."course_id";

NOTIFY pgrst, 'reload schema';
