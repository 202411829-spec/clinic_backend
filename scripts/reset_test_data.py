"""
Reset test data: clean the clinic DB and seed minimal fresh test data.

WHAT IT DOES
============
1. CLEAN  -  deletes ALL rows from the test-data tables:
     visit_log_medicines, medical_certificates, visit_logs,
     appointment_status_history, appointments, feedback (if it exists).
     Every row currently in these tables is test data (TEST001 bookings,
     "pipeline verify" / "e2e" rows, and admin walk-in tests), so
     removing all of them is the clean state.

     medical_certificates MUST be deleted before visit_logs: a DB
     trigger on the log delete re-inserts a source-less certificate copy
     (log_id NULL) that violates the chk_certificate_source check and
     aborts the whole delete. Deleting the certificates first avoids it.

2. PRESERVE  -  touches nothing else. Before/after counts are printed
   for: admin_accounts, students, departments, courses,
   appointment_reasons, medicines, clinic_appointment_settings,
   clinic_schedules, time_slots. The script aborts (exit 1) if any of
   these cannot be read, so a preserved table is never silently broken.

3. SEED  -  creates exactly one of each flow, using existing accounts:
     a. Student appointment booking      -> TEST001 (auth user
        test001@gordoncollege.edu.ph) books the earliest available
        time slot on the nearest enabled clinic day; a "pending"
        status row is created (mirrors POST /appointments).
     b. Appointment status update        -> same appointment advanced
        pending -> completed by admin_id 1 (admin001) (mirrors
        PATCH /appointments/<id>/status).
     c. Admin walk-in logbook entry      -> unregistered student
        "202411829" (exercises the walk_in_* manual fields) seen by
        admin_id 1; creates appointment + visit_log (mirrors
        POST /logbook/walk-in).
     d. Logbook medicine entry           -> Paracetamol (medicine_id 1)
        x2 attached to the walk-in log (mirrors POST /logbook/<id>/medicine).
 e. Feedback entry                -> TEST001 rating 5.
        NOTE: the `feedback` table does not exist in this database and
        the script cannot run DDL through the Supabase REST client.
        The clean `feedback` table is created by the standalone clean
        schema DDL (docs/superpowers/specs/2026-08-28-final-clean-schema.md),
        not by this script. If seeding feedback fails with "table not
        found", apply that DDL first, then re-run this script (or with
        --feedback-only).

USAGE
=====
    python -B scripts/reset_test_data.py            # clean + seed
    python -B scripts/reset_test_data.py --feedback-only   # seed feedback only
    python -B scripts/reset_test_data.py --dry-run  # show deletes, change nothing

Exit codes: 0 ok, 1 error, 3 feedback table missing.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase

# ---------------------------------------------------------------------------
# Table sets
# ---------------------------------------------------------------------------

CLEAN_TABLES = [
    # FK-safe delete order: children before parents. medical_certificates
    # comes before visit_logs because a DB trigger re-inserts a
    # source-less certificate on log delete, violating chk_certificate_source.
    ("visit_log_medicines", "visit_medicine_id"),
    ("medical_certificates", "certificate_id"),
    ("visit_logs", "visit_log_id"),
    ("appointment_status_history", "status_id"),
    ("appointments", "appointment_id"),
    ("feedback", "feedback_id"),
]

PRESERVED_TABLES = [
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

# Distinctive marker so seeded rows are recognizable / removable later.
SEED_MARKER = "FRESH-SEED"

FEEDBACK_CREATE_SQL = """\
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor), then
-- re-run: python -B scripts/reset_test_data.py --feedback-only
create table if not exists feedback (
    feedback_id bigint generated always as identity primary key,
    student_id  text        not null,
    rating      int         not null check (rating between 1 and 5),
    message     text,
    created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_student
    on feedback (student_id, created_at desc);

alter table feedback enable row level security;

drop policy if exists "feedback_select_own" on feedback;
create policy "feedback_select_own"
    on feedback for select
    using (true);

drop policy if exists "feedback_insert_any" on feedback;
create policy "feedback_insert_any"
    on feedback for insert
    with check (true);
"""


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def count_table(table):
    # PostgREST count needs the Prefer header, which the py client
    # hides  -  so read rows, capped at 1000, and count what we see.
    resp = supabase.table(table).select("*").limit(1000).execute()
    rows = resp.data or []
    if len(rows) < 1000:
        return len(rows)
    return f"{len(rows)}+"


# ---------------------------------------------------------------------------
# 1. CLEAN
# ---------------------------------------------------------------------------

def clean(dry_run=False):
    print("== CLEAN ==")
    for table, pk in CLEAN_TABLES:
        try:
            before = count_table(table)
            if dry_run:
                print(f"  [dry-run] would delete all {before} row(s) from {table}")
                continue
            resp = supabase.table(table).delete().neq(pk, -1).execute()
            after = len(resp.data or [])
            print(f"  deleted {after} row(s) from {table} (was {before})")
        except Exception as e:
            text = str(e)
            if table == "feedback" and ("PGRST205" in text or "Could not find the table" in text):
                print(f"  {table}: table does not exist in this database  -  nothing to clean")
                continue
            fail(f"failed to clean {table}: {e!r}")


# ---------------------------------------------------------------------------
# 2. VERIFY PRESERVED
# ---------------------------------------------------------------------------

def verify_preserved():
    print("== PRESERVED (must not change) ==")
    counts = {}
    for table in PRESERVED_TABLES:
        try:
            counts[table] = count_table(table)
            print(f"  {table}: {counts[table]}")
        except Exception as e:
            fail(f"cannot read preserved table {table}: {e!r}")
    return counts


# ---------------------------------------------------------------------------
# 3. SEED
# ---------------------------------------------------------------------------

def _resolve_seed_date_and_slot():
    """
    Pick the seed appointment day: the nearest clinic day (is_enabled)
    at/after today that has materialized time_slots rows. Returns
    (working_date, schedule_id, booking_slot, walk_in_slot).

    booking_slot = earliest slot of that day.
    walk_in_slot = a slot at/after 10:00 on the same day (falls back to
    the last slot of the day).

    Raises a clear error when no usable day exists (e.g. schedules were
    deleted) so the operator knows the seed cannot proceed.
    """
    from datetime import date

    today = date.today().isoformat()

    schedules = (supabase.table("clinic_schedules").select("*").execute().data or [])
    slots = (supabase.table("time_slots").select("*").execute().data or [])

    slots_by_schedule = {}
    for slot in slots:
        slots_by_schedule.setdefault(slot.get("schedule_id"), []).append(slot)

    candidates = []
    for s in schedules:
        if s.get("is_enabled") is False:
            continue
        working_date = str(s.get("working_date") or "")[:10]
        if working_date >= today and slots_by_schedule.get(s.get("schedule_id")):
            candidates.append((working_date, s, slots_by_schedule[s.get("schedule_id")]))

    if not candidates:
        fail(
            "no enabled clinic day at/after today has materialized time_slots "
            "rows; cannot seed a booking. Create a clinic_schedules row and "
            "materialize slots (or re-run with --feedback-only)."
        )

    candidates.sort(key=lambda item: (item[0], item[1].get("schedule_id")))
    working_date, schedule, day_slots = candidates[0]
    day_slots.sort(key=lambda sl: str(sl.get("slot_start") or ""))

    booking_slot = day_slots[0]
    walk_in_slot = next(
        (sl for sl in day_slots if str(sl.get("slot_start") or "") >= "10:00:00"),
        day_slots[-1],
    )
    return working_date, schedule, booking_slot, walk_in_slot


def _insert(table, payload, what):
    resp = supabase.table(table).insert(payload).execute()
    rows = resp.data or []
    if not rows:
        fail(f"failed to insert {what} into {table}: empty response")
    print(f"  + inserted {what}: {rows[0]}")
    return rows[0]


def _resolve_reason_id(description):
    """
    Look up the appointment_reasons row by its canonical description so the
    seed never hardcodes reason_ids (the canonical set is exactly 2:
    'Medical Certificate' and 'Consultation').
    """
    resp = supabase.table("appointment_reasons").select("reason_id,description").execute()
    rows = resp.data or []
    by_description = {r.get("description"): r.get("reason_id") for r in rows}
    reason_id = by_description.get(description)
    if reason_id is None:
        fail(
            f"appointment_reasons has no '{description}' row; expected the "
            "canonical seed (Medical Certificate / Consultation)"
        )
    return reason_id


def seed(dry_run=False):
    print("== SEED ==")
    working_date, schedule, booking_slot, walk_in_slot = _resolve_seed_date_and_slot()
    print(f"  resolved seed day: {working_date} (schedule {schedule.get('schedule_id')})")
    print(f"  booking slot: {str(booking_slot['slot_start'])[:5]} (slot_id {booking_slot['slot_id']})")
    print(f"  walk-in slot: {str(walk_in_slot['slot_start'])[:5]} (slot_id {walk_in_slot['slot_id']})")
    if dry_run:
        print("  [dry-run] no rows created")
        return

    # --- a. Student appointment booking (TEST001, pending) --------------
    consultation_reason_id = _resolve_reason_id("Consultation")
    booking_data = {
        "student_id": "TEST001",
        "time_slot_id": booking_slot["slot_id"],
        "appointment_date": working_date,
        "appointment_time": str(booking_slot["slot_start"])[:8],
        "reason_id": consultation_reason_id,  # Consultation
        "appointment_purpose": f"{SEED_MARKER} student booking",
    }
    booking = _insert("appointments", booking_data, "student appointment booking (TEST001)")
    appointment_id = booking["appointment_id"]

    pending = _insert(
        "appointment_status_history",
        {
            "appointment_id": appointment_id,
            "previous_status": None,
            "new_status": "pending",
            "remarks": f"{SEED_MARKER} booked by student",
            "changed_by_admin_id": None,
        },
        "pending status row for student booking",
    )

    # --- b. Appointment status update (pending -> completed) -------------
    _insert(
        "appointment_status_history",
        {
            "appointment_id": appointment_id,
            "previous_status": pending["new_status"],
            "new_status": "completed",
            "remarks": f"{SEED_MARKER} completed by admin (admin001)",
            "changed_by_admin_id": 1,
        },
        "status update pending -> completed (admin001)",
    )

    # --- c. Admin walk-in logbook entry (unregistered walk-in) -----------
    walk_in_appt = _insert(
        "appointments",
        {
            "student_id": "202411829",
            "time_slot_id": walk_in_slot["slot_id"],
            "appointment_date": working_date,
            "appointment_time": str(walk_in_slot["slot_start"])[:8],
            "reason_id": consultation_reason_id,  # Consultation
            "appointment_purpose": f"{SEED_MARKER} walk-in",
            "is_walk_in": True,
        },
        "walk-in appointment (202411829, unregistered)",
    )

    log = _insert(
        "visit_logs",
        {
            "appointment_id": walk_in_appt["appointment_id"],
            "complaint": f"{SEED_MARKER}: fever and headache",
            "attending_admin_id": 1,  # admin001
            "is_walk_in": True,
            "walk_in_contact": None,
            "walk_in_name": "Mark Joshua Alfonso",
            "walk_in_age": 21,
            "walk_in_sex": "Male",
            "walk_in_department_course": "BS Computer Science - College of Computer Studies (CCS)",
        },
        "walk-in logbook entry (admin001)",
    )

    # --- d. Logbook medicine entry ---------------------------------------
    _insert(
        "visit_log_medicines",
        {
            "visit_log_id": log["visit_log_id"],
            "medicine_id": 1,
            "medicine_name": "Paracetamol",  # snapshot at time of dispensing
            "quantity_dispensed": 2,
        },
        "logbook medicine entry (Paracetamol x2)",
    )

    # --- e. Feedback entry ------------------------------------------------
    return _seed_feedback()


def _seed_feedback():
    try:
        _insert(
            "feedback",
            {
                "student_id": "TEST001",
                "rating": 5,
                "message": f"{SEED_MARKER}: very helpful clinic staff",
            },
            "feedback entry (TEST001, rating 5)",
        )
        return True
    except Exception as e:
        text = str(e)
        if "PGRST205" in text or "Could not find the table" in text:
            print()
            print("BLOCKED: the `feedback` table does not exist in this database.")
            print("The Supabase REST client (service role key) cannot run DDL.")
            print("Run this SQL once in the Supabase SQL editor, then re-run:")
            print("    python -B scripts/reset_test_data.py --feedback-only")
            print()
            print(FEEDBACK_CREATE_SQL)
            return False
        raise


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__.split("USAGE")[0])
    parser.add_argument("--dry-run", action="store_true", help="show what would be deleted/created without changing anything")
    parser.add_argument("--feedback-only", action="store_true", help="only seed the feedback entry (table must exist)")
    args = parser.parse_args()

    print("== BEFORE ==")
    verify_preserved()

    if not args.feedback_only:
        clean(dry_run=args.dry_run)
        print()
        print("== AFTER CLEAN ==")
        verify_preserved()

    print()
    feedback_ok = seed(dry_run=args.dry_run)

    print()
    print("== FINAL ==")
    verify_preserved()

    if not feedback_ok:
        print()
        print("DONE except feedback (table missing)  -  see BLOCKED instructions above.")
        sys.exit(3)


if __name__ == "__main__":
    main()