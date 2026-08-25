import time
import socket

from datetime import date

try:
    import httpx
except ImportError:
    httpx = None

from database import supabase


# ============================================================
# RETRY WRAPPER — same fix as logbook.py / appointment.py. The
# Supabase/httpx client occasionally hits transient low-level
# socket errors on Windows dev machines (e.g. WinError 10035 /
# WSAEWOULDBLOCK) when it reuses a pooled connection that isn't
# quite ready yet. These are not real failures, just a stale
# connection — retrying the exact same query a moment later
# succeeds. Every .execute() call in this file should go
# through here instead of being called directly, so a flaky
# socket doesn't surface as a 500.
#
# This file is the shared helper module imported by BOTH
# appointment.py and logbook.py — build_student_lookup() and
# build_reason_lookup() run on almost every request in the app,
# so this was the last unprotected call site.
#
# It is also the SINGLE CANONICAL HOME of execute_with_retry /
# _looks_transient / TRANSIENT_ERRORS and of the shared lookup
# builders (calculate_age, normalize_student_id, get_lookup,
# build_student_lookup, build_reason_lookup,
# build_medicine_lookup, get_medicines_for_log). logbook.py and
# appointment.py used to carry near-identical copies that had
# started to diverge (logbook normalized student ids with
# str().strip().upper(); helpers did not) — they now import from
# here instead.
#
# NOTE: httpx/postgrest-py wrap the raw OSError in their own
# exception types (httpx.ConnectError, httpx.ReadError, etc.)
# instead of letting it bubble up as a plain OSError, so we have
# to catch those wrapped types too — not just OSError itself.
# ============================================================

if httpx is not None:
    TRANSIENT_ERRORS = (
        OSError,
        socket.error,
        ConnectionError,
        TimeoutError,
        httpx.ConnectError,
        httpx.ReadError,
        httpx.WriteError,
        httpx.ConnectTimeout,
        httpx.ReadTimeout,
        httpx.RemoteProtocolError,
        httpx.PoolTimeout,
    )
else:
    TRANSIENT_ERRORS = (OSError, socket.error, ConnectionError, TimeoutError)


def _looks_transient(error):
    """
    Fallback check for transient errors that don't match
    TRANSIENT_ERRORS by type but clearly are one by message —
    e.g. a postgrest APIError whose __cause__ is a socket error.
    """
    text = str(error).lower()
    markers = (
        "10035", "would block", "connection reset", "connection aborted",
        "broken pipe", "timed out", "timeout", "connection refused",
        "server disconnected", "econnreset",
    )
    if any(marker in text for marker in markers):
        return True

    cause = getattr(error, "__cause__", None)
    if cause is not None and isinstance(cause, TRANSIENT_ERRORS):
        return True

    return False


def execute_with_retry(query, retries=5, delay=0.3):
    """
    Call .execute() on a Supabase query builder, retrying on
    transient connection/socket errors (timeouts, resets,
    "would block" errors, etc). Raises the last error if every
    attempt fails.
    """

    last_error = None

    for attempt in range(retries):

        try:
            return query.execute()

        except TRANSIENT_ERRORS as e:

            last_error = e
            print(
                f"Supabase query attempt {attempt + 1}/{retries} "
                f"failed with transient error: {repr(e)} — retrying..."
            )
            time.sleep(delay * (attempt + 1))  # small backoff

        except Exception as e:

            if _looks_transient(e):
                last_error = e
                print(
                    f"Supabase query attempt {attempt + 1}/{retries} "
                    f"failed with transient-looking error: {repr(e)} — retrying..."
                )
                time.sleep(delay * (attempt + 1))
                continue

            # Non-transient errors (bad query, auth, etc) — don't retry,
            # fail fast so the real problem surfaces immediately.
            raise

    # All retries exhausted — raise the last transient error so the
    # calling route's except block can format a normal error response.
    raise last_error


# ============================================================
# SHARED HELPERS
#
# Used by both appointment.py and logbook.py to join student
# details (name, age, sex, department & course) and reference
# tables (reason, medicines) onto raw rows from Supabase.
# ============================================================

def calculate_age(birth_date_value):
    if not birth_date_value:
        return None

    try:
        parts = str(birth_date_value)[:10].split("-")
        birth = date(int(parts[0]), int(parts[1]), int(parts[2]))
        today = date.today()
        age = today.year - birth.year

        if (today.month, today.day) < (birth.month, birth.day):
            age -= 1

        return age

    except Exception:
        return None


def normalize_student_id(student_id_value):
    """
    Normalize a student_id for matching between the appointment
    table and personal_information table. Without this, a
    student_id that's stored as an int in one table and a string
    in the other (or has stray whitespace/case differences from
    manual entry, e.g. a walk-in form) silently fails to join,
    and the visit shows up with blank name/age/sex/course even
    though the student IS registered.

    This used to live only in logbook.py; it is now the single
    canonical variant so every caller joins with the same,
    more defensive keying.
    """
    if student_id_value is None:
        return None

    return str(student_id_value).strip().upper()


def get_lookup(table, id_column):
    """
    Fetch a whole table and return it as a dict keyed by its id
    column, e.g. {1: {...row...}, 2: {...row...}}
    """
    response = execute_with_retry(
        supabase
        .table(table)
        .select("*")
    )

    rows = response.data or []

    return {row[id_column]: row for row in rows}


def build_student_lookup():
    """
    Returns a dict keyed by NORMALIZED student_id (see
    normalize_student_id), with fully joined student details:
    name, age, sex, department & course.

    NOTE: keys are normalized, so callers must pass
    normalize_student_id(raw_id) when looking a student up.
    The raw (unmodified) student_id is still preserved in each
    row's "student_id" field for display/response purposes.
    """

    personal_info_response = execute_with_retry(
        supabase
        .table("personal_information")
        .select("*")
    )

    personal_info_rows = personal_info_response.data or []

    names_by_id = get_lookup("student_name", "name_id")
    departments_by_id = get_lookup("department", "department_id")
    courses_by_id = get_lookup("course_dept", "course_id")

    students = {}

    for info in personal_info_rows:

        student_id = info.get("student_id")
        student_id_key = normalize_student_id(student_id)

        name_row = names_by_id.get(info.get("name_id"), {})

        first_name = name_row.get("first_name", "")
        middle_initial = name_row.get("middle_initial") or ""
        last_name = name_row.get("last_name", "")

        middle_part = f" {middle_initial}." if middle_initial else ""
        full_name = f"{first_name}{middle_part} {last_name}".strip()

        department_row = departments_by_id.get(
            info.get("department_id"), {}
        )

        course_row = courses_by_id.get(
            info.get("course_id"), {}
        )

        department_name = department_row.get("department_name", "")
        course_name = course_row.get("course_name", "")

        if department_name and course_name:
            dept_course = f"{course_name} - {department_name}"
        else:
            dept_course = course_name or department_name or "-"

        students[student_id_key] = {
            "student_id": student_id,
            "name": full_name or "-",
            "age": calculate_age(info.get("birth_date")),
            "sex": info.get("gender") or "-",
            # "dept" is required by appointment.py's
            # GET /appointments/slots booking join — keep it.
            "dept": department_name or "-",
            "deptCourse": dept_course,
            "year_level": info.get("year_level"),
        }

    return students


def build_reason_lookup():
    return get_lookup("reason", "reason_id")


def build_medicine_lookup():
    return get_lookup("medicines", "medicine_id")


def build_status_lookup():
    return get_lookup("status", "status_id")


def get_medicines_for_log(log_id, log_medicine_rows, medicines_by_id):
    """
    Return a formatted "Medicine x2, Medicine x1" style string
    for a given log_id.
    """

    tags = []

    for row in log_medicine_rows:

        if row.get("log_id") != log_id:
            continue

        medicine = medicines_by_id.get(row.get("medicine_id"), {})
        medicine_name = medicine.get("medicine_name", "Unknown")
        quantity = row.get("quantity", 1)

        tags.append(f"{medicine_name} x{quantity}")

    return ", ".join(tags) if tags else "-"


def format_date_time(created_at):
    """
    Convert a Postgres timestamptz string into MM/DD/YYYY HH:MM.
    """

    if not created_at:
        return ""

    try:
        date_part = created_at[:10]
        time_part = created_at[11:16]
        year, month, day = date_part.split("-")
        return f"{month}/{day}/{year} {time_part}"

    except Exception:
        return created_at


def get_latest_status_for_appointments(appointment_ids):
    """
    Returns a dict keyed by appointment_id, with that
    appointment's most recent status row (or None).
    """

    if not appointment_ids:
        return {}

    response = execute_with_retry(
        supabase
        .table("status")
        .select("*")
        .in_("appointment_id", appointment_ids)
        .order("changed_at", desc=True)
    )

    rows = response.data or []

    latest_by_appointment = {}

    for row in rows:

        appointment_id = row.get("appointment_id")

        # Rows are already ordered newest-first, so the first
        # one we see per appointment_id is the latest.
        if appointment_id not in latest_by_appointment:
            latest_by_appointment[appointment_id] = row

    return latest_by_appointment