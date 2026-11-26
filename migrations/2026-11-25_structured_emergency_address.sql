-- Additive migration: optional structured emergency-contact address fields.
-- The legacy emergency_contacts."present_address" value is untouched; no
-- backfill or parsing is performed. Existing rows keep NULL address_* columns.

ALTER TABLE "emergency_contacts"
  ADD COLUMN IF NOT EXISTS "address_region_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_province_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_city_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_barangay_code" character varying(32),
  ADD COLUMN IF NOT EXISTS "address_street" text,
  ADD COLUMN IF NOT EXISTS "address_house_number" text;

NOTIFY pgrst, 'reload schema';
