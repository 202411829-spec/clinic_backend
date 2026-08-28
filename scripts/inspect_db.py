"""
Inspect the current state of the clinic database before cleaning.

Read-only. Prints row counts + samples for every table involved in
the test-data cleanup so we know exactly what to delete and what to
keep. Uses only the shared supabase client (service role).
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase


TABLES = [
    "visit_log_medicines",
    "visit_logs",
    "appointments",
    "appointment_status_history",
    "feedback",
    "admin_accounts",
    "students",
    "departments",
    "courses",
    "appointment_reasons",
    "medicines",
    "clinic_appointment_settings",
    "clinic_schedules",
    "time_slots",
]


def _print_row(label, row):
    print(f"    {label}: {json.dumps(row, default=str, indent=2)}")


def inspect():
    for table in TABLES:
        print(f"=== {table} ===")
        try:
            resp = supabase.table(table).select("*").limit(200).execute()
            rows = resp.data or []
            print(f"  count (up to 200): {len(rows)}")
            for row in rows:
                _print_row("row", row)
        except Exception as e:
            print(f"  ERROR: {e!r}")
        print()

    # Supabase Auth users (students / admins sign in here)
    print("=== auth.users ===")
    try:
        resp = supabase.auth.admin.list_users()
        users = resp.users if hasattr(resp, "users") else resp
        for u in users:
            print(f"  user: id={u.id} email={u.email} created={getattr(u, 'created_at', '')}")
    except Exception as e:
        # Try the legacy list_users shape
        try:
            resp = supabase.auth.admin.list_users()
            print("  raw:", resp)
        except Exception as e2:
            print(f"  ERROR: {e!r}")
            print(f"  ERROR2: {e2!r}")


if __name__ == "__main__":
    inspect()