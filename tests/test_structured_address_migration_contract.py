from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_structured_address.sql"
EMERGENCY_MIGRATION = ROOT / "migrations" / "2026-11-25_structured_emergency_address.sql"
SAME_ADDRESS_MIGRATION = ROOT / "migrations" / "2026-11-25_emergency_same_as_student_address.sql"
CLEAN_DDL = ROOT / "migrations" / "2026-08-28_clean_rebuild_ddl.sql"

ADDRESS_COLUMNS = [
    "address_region_code",
    "address_province_code",
    "address_city_code",
    "address_barangay_code",
    "address_street",
    "address_house_number",
]

VIEW_MARKER = 'CREATE OR REPLACE VIEW "student_masterlist" AS'
CLEAN_VIEW_MARKER = 'CREATE VIEW "student_masterlist" AS'


def view_select(sql, marker):
    start = sql.index(marker)
    end = sql.index("\nFROM ", start)
    return sql[start:end]


def assert_view_order(sql, marker):
    view = view_select(sql, marker)
    previous = 's."suffix"'
    for column in ADDRESS_COLUMNS:
        current = f's."{column}"'
        assert current in view, f"view is missing {current}"
        assert view.index(previous) < view.index(current), f"{current} must be appended after {previous}"
        previous = current


def test_structured_address_migration_is_additive_and_never_backfills_legacy_text():
    assert MIGRATION.exists(), f"missing migration: {MIGRATION}"
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'ALTER TABLE "students"' in sql
    for column in ADDRESS_COLUMNS:
        assert f'ADD COLUMN IF NOT EXISTS "{column}"' in sql

    assert VIEW_MARKER in sql
    assert 's."present_address"' in sql
    assert_view_order(sql, VIEW_MARKER)
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    forbidden = [
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "students"',
        "split_part",
        "regexp_split_to_array",
        "ENABLE ROW LEVEL SECURITY",
        "GRANT ",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"


def test_clean_install_schema_matches_the_additive_address_migration():
    ddl = CLEAN_DDL.read_text(encoding="utf-8")

    for column in ADDRESS_COLUMNS:
        assert f'"{column}"' in ddl

    assert CLEAN_VIEW_MARKER in ddl
    assert 's."present_address"' in ddl
    assert_view_order(ddl, CLEAN_VIEW_MARKER)


def test_emergency_contact_address_migration_is_additive_and_matches_clean_ddl():
    assert EMERGENCY_MIGRATION.exists(), f"missing migration: {EMERGENCY_MIGRATION}"
    sql = EMERGENCY_MIGRATION.read_text(encoding="utf-8")
    ddl = CLEAN_DDL.read_text(encoding="utf-8")

    assert 'ALTER TABLE "emergency_contacts"' in sql
    for column in ADDRESS_COLUMNS:
        assert f'ADD COLUMN IF NOT EXISTS "{column}"' in sql
        assert f'"{column}"' in ddl

    assert '"present_address"' in sql
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    for phrase in (
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "emergency_contacts"',
        "split_part",
        "regexp_split_to_array",
    ):
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"


def test_same_as_student_address_migration_is_additive_and_defaults_existing_rows_off():
    assert SAME_ADDRESS_MIGRATION.exists(), f"missing migration: {SAME_ADDRESS_MIGRATION}"
    sql = SAME_ADDRESS_MIGRATION.read_text(encoding="utf-8")
    ddl = CLEAN_DDL.read_text(encoding="utf-8")

    assert 'ALTER TABLE "emergency_contacts"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "same_as_student_address" boolean NOT NULL DEFAULT false' in sql
    assert '"same_as_student_address" boolean NOT NULL DEFAULT FALSE' in ddl
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    for phrase in (
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "INSERT INTO",
        'UPDATE "emergency_contacts"',
    ):
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"
