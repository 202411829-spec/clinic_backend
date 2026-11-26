# tests/test_admin_role_migration_contract.py
"""SQL contract for the admin access-role migration (admin | super_admin)."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "2026-11-25_admin_access_roles.sql"
CLEAN_DDL = ROOT / "migrations" / "2026-08-28_clean_rebuild_ddl.sql"
CLEAN_SEED = ROOT / "migrations" / "2026-08-28_clean_seed.sql"


def _migration_sql() -> str:
    assert MIGRATION.exists(), f"missing migration: {MIGRATION}"
    return MIGRATION.read_text(encoding="utf-8")


def test_migration_backfills_legacy_roles_to_admin():
    sql = _migration_sql()

    # nurse / doctor / NULL -> admin
    assert 'SET "role" = \'admin\'' in sql
    assert "IN ('nurse', 'doctor')" in sql
    assert '"role" IS NULL' in sql

    # The backfill runs after the stale-constraint cleanup so a legacy
    # nurse/doctor CHECK can never block it.
    assert sql.index("pg_get_constraintdef") < sql.index('SET "role" = \'admin\'')


def test_migration_promotes_the_special_admin_to_super_admin():
    sql = _migration_sql()

    assert "'admin@gordoncollege.edu.ph'" in sql
    assert 'SET "role" = \'super_admin\'' in sql
    assert 'acc."account_type" = \'admin\'' in sql


def test_migration_sets_default_and_adds_new_check():
    sql = _migration_sql()

    assert 'ALTER COLUMN "role" SET DEFAULT \'admin\'' in sql
    assert 'DROP CONSTRAINT IF EXISTS "admin_accounts_role_check"' in sql
    assert re.search(
        r'ADD CONSTRAINT "admin_accounts_role_check"\s+'
        r'CHECK \("role" IN \(\'admin\', \'super_admin\'\)\)',
        sql,
    )

    # Idempotent: only CHECK constraints mentioning the old role values
    # are dropped by the DO block, and the new constraint is
    # drop-if-exists + add.
    assert "c.contype = 'c'" in sql
    assert "ARRAY['%nurse%', '%doctor%']" in sql


def test_migration_deletes_no_accounts_or_data():
    sql = _migration_sql()

    forbidden = [
        "DELETE FROM",
        "DROP TABLE",
        "DROP COLUMN",
        "TRUNCATE",
        "DROP SCHEMA",
        "ALTER TABLE \"app_accounts\"",
    ]
    for phrase in forbidden:
        assert phrase not in sql, f"forbidden phrase in migration: {phrase}"

    # Still a reloadable, additive migration.
    assert sql.rstrip().endswith("NOTIFY pgrst, 'reload schema';")


def test_clean_ddl_declares_the_new_role_check_and_default():
    ddl = CLEAN_DDL.read_text(encoding="utf-8")
    start = ddl.index('CREATE TABLE "admin_accounts"')
    end = ddl.index("\n);", start)
    admin_table = ddl[start:end]

    assert re.search(
        r'"role"\s+character varying\(50\) NOT NULL DEFAULT \'admin\'', admin_table
    )
    assert 'CONSTRAINT "admin_accounts_role_check"' in admin_table
    assert re.search(r'CHECK \("role" IN \(\'admin\', \'super_admin\'\)\)', admin_table)


def test_clean_seed_uses_only_the_new_access_roles():
    seed = CLEAN_SEED.read_text(encoding="utf-8")

    admin_row = next(
        line for line in seed.splitlines() if "'admin001'" in line and "'Mark'" in line
    )
    assert "'super_admin'" in admin_row

    nurse_row = next(
        line
        for line in seed.splitlines()
        if "'nurse001'" in line and "'Joseph Daniel'" in line
    )
    assert "'admin'" in nurse_row
    assert "'nurse'" not in nurse_row

    # No legacy access-role literals remain as role values.
    assert "'nurse'" not in seed
    assert "'doctor'" not in seed
