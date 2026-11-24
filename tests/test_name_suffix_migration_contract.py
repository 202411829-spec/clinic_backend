import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_optional_name_suffixes.sql"
CLEAN_DDL = ROOT / "migrations" / "2026-08-28_clean_rebuild_ddl.sql"

FULL_NAME_LINES = [
    '  (s."last_name" || \', \' || s."first_name"',
    '     || COALESCE(\' \' || left(s."middle_initial", 1) || \'.\', \'\')) AS "full_name",',
]


def view_select(sql, create_marker):
    start = sql.index(create_marker)
    end = sql.index("\nFROM ", start)
    return sql[start:end]


def test_optional_name_suffix_migration_is_additive_and_never_rewrites_legacy_names():
    assert MIGRATION.exists(), f"missing migration: {MIGRATION}"
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'ALTER TABLE "students"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "suffix" character varying(20);' in sql

    assert 'ALTER TABLE "emergency_contacts"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "first_name" character varying(200)' in sql
    assert 'ADD COLUMN IF NOT EXISTS "middle_initial" character varying(10)' in sql
    assert 'ADD COLUMN IF NOT EXISTS "last_name" character varying(200)' in sql
    assert 'ADD COLUMN IF NOT EXISTS "suffix" character varying(20);' in sql

    assert 'CREATE OR REPLACE VIEW "student_masterlist" AS' in sql
    assert re.search(r'^\s+s\."suffix"(?:,)?$', sql, re.MULTILINE)
    for line in FULL_NAME_LINES:
        assert line in sql, f"full_name expression changed: {line}"
    view = view_select(sql, 'CREATE OR REPLACE VIEW "student_masterlist" AS')
    assert view.index('AS "full_name"') < view.index('s."suffix"')
    assert view.index('s."data_privacy_consented_at"') < view.index('s."suffix"')
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    forbidden = [
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "students"',
        'UPDATE "emergency_contacts"',
        "ENABLE ROW LEVEL SECURITY",
        "GRANT ",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"


def test_clean_install_schema_matches_the_additive_migration():
    ddl = CLEAN_DDL.read_text(encoding="utf-8")

    assert re.search(r'"suffix"\s+character varying\(20\),', ddl)
    assert re.search(r'"first_name"\s+character varying\(200\),', ddl)
    assert re.search(r'"middle_initial"\s+character varying\(10\),', ddl)
    assert re.search(r'"last_name"\s+character varying\(200\),', ddl)
    assert 'CREATE VIEW "student_masterlist" AS' in ddl
    assert re.search(r'^\s+s\."suffix"(?:,)?$', ddl, re.MULTILINE)
    for line in FULL_NAME_LINES:
        assert line in ddl, f"full_name expression changed: {line}"
    view = view_select(ddl, 'CREATE VIEW "student_masterlist" AS')
    assert view.index('AS "full_name"') < view.index('s."suffix"')
    assert view.index('s."data_privacy_consented_at"') < view.index('s."suffix"')
