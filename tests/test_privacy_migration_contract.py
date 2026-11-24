from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_student_data_privacy_consent.sql"


def test_consent_migration_is_additive_idempotent_and_view_preserving():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'ALTER TABLE "students"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "data_privacy_consented_at" timestamptz;' in sql
    assert 'CREATE OR REPLACE VIEW "student_masterlist" AS' in sql
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    required_view_lines = [
        '  s."student_id",',
        '  s."last_name",',
        '  s."first_name",',
        '  s."middle_initial",',
        '  (s."last_name" || \', \' || s."first_name"',
        '     || COALESCE(\' \' || left(s."middle_initial", 1) || \'.\', \'\')) AS "full_name",',
        '  d."department_id",',
        '  d."department_name",',
        '  c."course_id",',
        '  c."course_name",',
        '  s."year_level",',
        '  s."gender",',
        '  s."birth_date",',
        '  date_part(\'year\', age(s."birth_date"))::integer AS "age",',
        '  s."contact_number",',
        '  s."email",',
        '  s."civil_status",',
        '  s."present_address",',
        '  s."data_privacy_consented_at"',
        'FROM "students" s',
        'LEFT JOIN "departments" d ON d."department_id" = s."department_id"',
        'LEFT JOIN "courses" c ON c."course_id" = s."course_id";',
    ]
    for line in required_view_lines:
        assert line in sql, f"missing preserved view line: {line}"

    forbidden = [
        "DROP TABLE",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "students"',
        "ENABLE ROW LEVEL SECURITY",
        "GRANT ",
        "2026-08-28_clean_rebuild_ddl.sql",
        "2026-08-28_clean_seed.sql",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"
