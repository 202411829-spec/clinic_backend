import time
import socket
import threading

from datetime import date
from types import SimpleNamespace

try:
    import httpx
except ImportError:
    httpx = None

try:
    from postgrest import APIError as PostgrestAPIError
except ImportError:
    PostgrestAPIError = None

from database import supabase

# Module-level TTL cache for reference-data lookups.
# Keys are (function_name, *args) → (cached_value, fetched_at).
_REFERENCE_CACHE_TTL = 60  # seconds
_reference_cache: dict[tuple, tuple[object, float]] = {}
_reference_cache_lock = threading.Lock()

# Sentinel returned by execute_with_retry when a .maybe_single() query
# finds no matching row.  postgrest-py returns None from .execute() in
# that case, but every caller accesses .data / .error / .count on the
# result — so we wrap None into a lightweight object that has those
# attributes (all None) and is truthy, preventing the systemic
# AttributeError: 'NoneType' object has no attribute 'data' bug.
_EMPTY_RESPONSE = SimpleNamespace(data=None, error=None, count=None)


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
            result = query.execute()
            # postgrest-py returns None (not an APIResponse) when a
            # .maybe_single() chain finds no matching row.  Every caller
            # accesses .data / .error / .count on the returned object, so
            # we swap None for a lightweight sentinel that has those
            # attributes as None and is truthy — preventing the systemic
            # AttributeError: 'NoneType' object has no attribute 'data'.
            if result is None:
                return _EMPTY_RESPONSE
            return result

        except TRANSIENT_ERRORS as e:

            last_error = e
            print(
                f"Supabase query attempt {attempt + 1}/{retries} "
                f"failed with transient error: {repr(e)} — retrying..."
            )
            time.sleep(delay * (attempt + 1))  # small backoff

        except Exception as e:

            # Handle postgrest APIError with code 204 ("Missing response")
            # which is raised when .maybe_single() finds zero rows.
            if PostgrestAPIError is not None and isinstance(e, PostgrestAPIError):
                code = getattr(e, "code", None)
                message = getattr(e, "message", "") or str(e)
                if code == "204" or "Missing response" in message:
                    return _EMPTY_RESPONSE

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
    Normalize a student_id for matching between raw rows (e.g.
    appointments, visit logs) and the student_masterlist join. Without
    this, a student_id that's stored as an int in one source and a string
    in another (or has stray whitespace/case differences from manual
    entry, e.g. a walk-in form) silently fails to join, and the visit
    shows up with blank name/age/sex/course even though the student IS
    registered.

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
    cache_key = ("get_lookup", table, id_column)
    now = time.time()

    with _reference_cache_lock:
        cached = _reference_cache.get(cache_key)
        if cached is not None:
            value, fetched_at = cached
            if now - fetched_at < _REFERENCE_CACHE_TTL:
                return value

    response = execute_with_retry(
        supabase
        .table(table)
        .select("*")
    )

    rows = response.data or []
    result = {row[id_column]: row for row in rows}

    with _reference_cache_lock:
        _reference_cache[cache_key] = (result, time.time())

    return result


def build_student_lookup():
    """
    Returns a dict keyed by NORMALIZED student_id (see
    normalize_student_id), with fully joined student details:
    name, age, sex, department & course.

    Reads the single flattened `student_masterlist` VIEW (which joins
    students + departments + courses once and computes full_name / age),
    replacing the legacy 4-table Python merge across personal_information,
    student_name, department, and course_dept.

    NOTE: keys are normalized, so callers must pass
    normalize_student_id(raw_id) when looking a student up.
    The raw (unmodified) student_id is still preserved in each
    row's "student_id" field for display/response purposes.
    """
    cache_key = ("build_student_lookup",)
    now = time.time()

    with _reference_cache_lock:
        cached = _reference_cache.get(cache_key)
        if cached is not None:
            value, fetched_at = cached
            if now - fetched_at < _REFERENCE_CACHE_TTL:
                return value

    response = execute_with_retry(
        supabase
        .table("student_masterlist")
        .select("*")
    )

    rows = response.data or []

    students = {}

    for row in rows:

        student_id = row.get("student_id")
        student_id_key = normalize_student_id(student_id)

        department_name = row.get("department_name") or ""
        course_name = row.get("course_name") or ""

        # Keep the " - " separator so logbook.py's dept/course parser
        # keeps splitting on it (Blockers G).
        if department_name and course_name:
            dept_course = f"{course_name} - {department_name}"
        else:
            dept_course = course_name or department_name or "-"

        students[student_id_key] = {
            "student_id": student_id,
            "name": row.get("full_name") or "-",
            "age": row.get("age") or calculate_age(row.get("birth_date")),
            "sex": row.get("gender") or "-",
            # "dept" is required by appointment.py's
            # GET /appointments/slots booking join — keep it.
            "dept": department_name or "-",
            "deptCourse": dept_course,
            "year_level": row.get("year_level"),
        }

    with _reference_cache_lock:
        _reference_cache[cache_key] = (students, time.time())

    return students


def build_reason_lookup():
    return get_lookup("appointment_reasons", "reason_id")


def build_medicine_lookup():
    return get_lookup("medicines", "medicine_id")


def get_medicines_for_log(log_id, log_medicine_rows, medicines_by_id):
    """
    Return a formatted "Medicine x2, Medicine x1" style string
    for a given log (visit log) id.
    """

    tags = []

    for row in log_medicine_rows:

        if row.get("visit_log_id") != log_id:
            continue

        medicine = medicines_by_id.get(row.get("medicine_id"), {})
        # Prefer the stored medicine_name SNAPSHOT (Decision F / Blockers L)
        # so historical prescriptions render after medicines-stock edits;
        # fall back to the live lookup, then "Unknown".
        medicine_name = row.get("medicine_name") or medicine.get("medicine_name", "Unknown")
        quantity = row.get("quantity_dispensed", 1)

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
        .table("appointment_status_history")
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