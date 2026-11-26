import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_admin_signup_name_fields.sql"
CLEAN_DDL = ROOT / "migrations" / "2026-08-28_clean_rebuild_ddl.sql"
ADMIN_MGMT = ROOT / "routers" / "admin_mgmt.py"
AGENT = ROOT / "routers" / "agent.py"


def test_admin_name_fields_migration_is_additive():
    assert MIGRATION.exists(), f"missing migration: {MIGRATION}"
    sql = MIGRATION.read_text(encoding="utf-8")

    assert 'ALTER TABLE "admin_accounts"' in sql
    assert 'ADD COLUMN IF NOT EXISTS "middle_initial" character varying(10)' in sql
    assert 'ADD COLUMN IF NOT EXISTS "suffix" character varying(20);' in sql
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")

    forbidden = [
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "INSERT INTO",
        "UPDATE ",
        "ENABLE ROW LEVEL SECURITY",
        "GRANT ",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"


def test_clean_install_admin_schema_matches_the_additive_migration():
    ddl = CLEAN_DDL.read_text(encoding="utf-8")
    start = ddl.index('CREATE TABLE "admin_accounts"')
    end = ddl.index("\n);", start)
    admin_table = ddl[start:end]

    assert re.search(r'"middle_initial"\s+character varying\(10\)', admin_table)
    assert re.search(r'"suffix"\s+character varying\(20\)', admin_table)
    assert admin_table.index('"last_name"') < admin_table.index('"middle_initial"')
    assert admin_table.index('"middle_initial"') < admin_table.index('"suffix"')


def test_admin_lookup_paths_return_the_complete_name_fields():
    mgmt = ADMIN_MGMT.read_text(encoding="utf-8")
    agent = AGENT.read_text(encoding="utf-8")

    assert '"middle_initial": r.get("middle_initial")' in mgmt
    assert '"suffix": r.get("suffix")' in mgmt
    assert '"middle_initial": admin_row.get("middle_initial")' in mgmt
    assert '"suffix": admin_row.get("suffix")' in mgmt
    assert 'first_name, last_name, middle_initial, suffix, role' in mgmt

    assert '"middle_initial": r.get("middle_initial")' in agent
    assert '"suffix": r.get("suffix")' in agent
