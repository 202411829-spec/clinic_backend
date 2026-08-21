import time
import socket

from flask import Blueprint, jsonify, request
from datetime import date

try:
    import httpx
except ImportError:
    httpx = None

from database import supabase


logbook_bp = Blueprint("logbook", __name__)


# ============================================================
# RETRY WRAPPER — the Supabase/httpx client occasionally hits
# transient low-level socket errors on Windows dev machines
# (e.g. WinError 10035 / WSAEWOULDBLOCK) when it reuses a
# pooled connection that isn't quite ready yet. These are not
# real failures, just a stale connection — retrying the exact
# same query a moment later succeeds. Every .execute() call in
# this file should go through here instead of being called
# directly, so a flaky socket doesn't surface as a 500.
#
# NOTE: httpx/postgrest-py wrap the raw OSError in their own
# exception types (httpx.ConnectError, httpx.ReadError, etc.)
# instead of letting it bubble up as a plain OSError, so we have
# to catch those wrapped types too — not just OSError itself.
# ============================================================

# Exception types that mean "transient connection problem, retry me" —
# both raw OS-level socket errors AND httpx's wrapped versions of them.
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
# HELPERS — build lookup dictionaries so we only query each
# reference table once, then join in Python (matches the
# rest of this codebase's style).
# ============================================================

def normalize_student_id(student_id_value):
    """
    Normalize a student_id for matching between the appointment
    table and personal_information table. Without this, a
    student_id that's stored as an int in one table and a string
    in the other (or has stray whitespace/case differences from
    manual entry, e.g. a walk-in form) silently fails to join,
    and the visit shows up with blank name/age/sex/course even
    though the student IS registered.
    """
    if student_id_value is None:
        return None

    return str(student_id_value).strip().upper()


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
    Returns a dict keyed by student_id, with fully joined
    student details: name, age, sex, department & course.
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
            "deptCourse": dept_course,
            "year_level": info.get("year_level"),
        }

    return students


def build_reason_lookup():
    return get_lookup("reason", "reason_id")


def build_medicine_lookup():
    return get_lookup("medicines", "medicine_id")


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


def format_appointment_date_time(appointment):
    """
    Build a MM/DD/YYYY H:MM AM/PM string straight from the
    appointment's own appointment_date + appointment_time —
    i.e. the time the staff actually picked in the walk-in form
    (or the booked slot time for regular appointments) — rather
    than log.created_at, which is just when the database row was
    inserted and (a) doesn't reflect the chosen visit time and
    (b) is stored in UTC with no timezone conversion applied,
    so it was showing up to 8 hours off from Philippines time.
    """

    appointment_date = appointment.get("appointment_date")
    appointment_time = appointment.get("appointment_time")

    if not appointment_date or not appointment_time:
        return None

    try:
        year, month, day = str(appointment_date)[:10].split("-")

        time_str = str(appointment_time)[:5]  # "HH:MM"
        hour_str, minute_str = time_str.split(":")
        hour = int(hour_str)

        period = "AM" if hour < 12 else "PM"
        hour_12 = hour % 12
        if hour_12 == 0:
            hour_12 = 12

        return f"{month}/{day}/{year} {hour_12}:{minute_str} {period}"

    except Exception:
        return None


def format_log_entry(log, appointments_by_id, students_by_id,
                      reasons_by_id, log_medicine_rows, medicines_by_id):
    """
    Take a raw appointment_log row and return the fully joined
    shape the frontend (LogbookPanel.jsx) expects.
    """

    appointment_id = log.get("appointment_id")
    appointment = appointments_by_id.get(appointment_id, {})

    student_id = appointment.get("student_id")
    student_id_key = normalize_student_id(student_id)
    student = students_by_id.get(student_id_key, {})
    is_registered = bool(student)

    reason_id = appointment.get("reason_id")
    reason_row = reasons_by_id.get(reason_id, {})
    reason_text = reason_row.get("description") or "-"

    # Prefer the actual appointment date/time (what was picked in the
    # walk-in form, or the booked slot) over created_at, which is just
    # the row's insert timestamp and doesn't reflect the visit time.
    date_time = format_appointment_date_time(appointment)

    if date_time is None:

        created_at = log.get("created_at") or ""
        date_time = created_at

        if created_at:

            try:
                date_part = created_at[:10]
                time_part = created_at[11:16]
                year, month, day = date_part.split("-")
                date_time = f"{month}/{day}/{year} {time_part}"

            except Exception:
                date_time = created_at

    medicine_string = get_medicines_for_log(
        log.get("log_id"),
        log_medicine_rows,
        medicines_by_id
    )

    # For unregistered walk-ins there's no personal_information row to
    # pull from, so fall back to whatever was manually typed into the
    # walk-in form (stored directly on the log row) when present.
    display_name = student.get("name") or log.get("walk_in_name") or "-"
    display_age = student.get("age")
    if display_age is None:
        display_age = log.get("walk_in_age")
    display_age = display_age if display_age is not None else "-"
    display_dept_course = (
        student.get("deptCourse")
        or log.get("walk_in_dept_course")
        or "-"
    )
    display_sex = student.get("sex") or log.get("walk_in_sex") or "-"

    return {
        "id": log.get("log_id"),
        "log_id": log.get("log_id"),
        "appointment_id": appointment_id,
        "student_id": student_id,
        "dateTime": date_time,
        "name": display_name,
        "age": display_age,
        "deptCourse": display_dept_course,
        "sex": display_sex,
        "reason": reason_text,
        "complaint": log.get("complaint") or "-",
        "medicine": medicine_string,
        "status_id": log.get("status_id"),
        "admin_id": log.get("admin_id"),
        "is_registered": is_registered
    }


def get_all_reference_data():
    """
    Fetch every table needed to build fully joined log entries,
    once, so repeated calls don't re-query per row.
    """

    appointments_response = execute_with_retry(
        supabase
        .table("appointment")
        .select("*")
    )

    appointments_by_id = {
        row["appointment_id"]: row
        for row in (appointments_response.data or [])
    }

    students_by_id = build_student_lookup()
    reasons_by_id = build_reason_lookup()
    medicines_by_id = build_medicine_lookup()

    log_medicine_response = execute_with_retry(
        supabase
        .table("appointment_log_medicine")
        .select("*")
    )

    log_medicine_rows = log_medicine_response.data or []

    return (
        appointments_by_id,
        students_by_id,
        reasons_by_id,
        log_medicine_rows,
        medicines_by_id
    )


# ============================================================
# GET ALL LOGBOOK ENTRIES (VISIT HISTORY)
#
# GET /logbook
# ============================================================

@logbook_bp.route("/logbook", methods=["GET"])
def get_logbook():

    try:

        response = execute_with_retry(
            supabase
            .table("appointment_log")
            .select("*")
            .order("created_at", desc=True)
        )

        logs = response.data or []

        (
            appointments_by_id,
            students_by_id,
            reasons_by_id,
            log_medicine_rows,
            medicines_by_id
        ) = get_all_reference_data()

        formatted = [
            format_log_entry(
                log,
                appointments_by_id,
                students_by_id,
                reasons_by_id,
                log_medicine_rows,
                medicines_by_id
            )
            for log in logs
        ]

        return jsonify({
            "success": True,
            "count": len(formatted),
            "logbook": formatted
        })

    except Exception as e:

        print("Logbook error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET LOGBOOK ENTRIES FOR A SPECIFIC STUDENT
#
# GET /logbook/student/<student_id>
# ============================================================

@logbook_bp.route(
    "/logbook/student/<student_id>",
    methods=["GET"]
)
def get_logbook_by_student(student_id):

    try:

        appointment_response = execute_with_retry(
            supabase
            .table("appointment")
            .select("appointment_id")
            .eq("student_id", student_id)
        )

        appointments = appointment_response.data or []

        appointment_ids = [
            appointment["appointment_id"]
            for appointment in appointments
        ]

        if not appointment_ids:

            return jsonify({
                "success": True,
                "student_id": student_id,
                "count": 0,
                "logbook": []
            })

        logs_response = execute_with_retry(
            supabase
            .table("appointment_log")
            .select("*")
            .in_("appointment_id", appointment_ids)
            .order("created_at", desc=True)
        )

        logs = logs_response.data or []

        (
            appointments_by_id,
            students_by_id,
            reasons_by_id,
            log_medicine_rows,
            medicines_by_id
        ) = get_all_reference_data()

        formatted = [
            format_log_entry(
                log,
                appointments_by_id,
                students_by_id,
                reasons_by_id,
                log_medicine_rows,
                medicines_by_id
            )
            for log in logs
        ]

        return jsonify({
            "success": True,
            "student_id": student_id,
            "count": len(formatted),
            "logbook": formatted
        })

    except Exception as e:

        print("Logbook student error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET A SINGLE LOGBOOK ENTRY
#
# GET /logbook/<log_id>
# ============================================================

@logbook_bp.route(
    "/logbook/<int:log_id>",
    methods=["GET"]
)
def get_logbook_entry(log_id):

    try:

        response = execute_with_retry(
            supabase
            .table("appointment_log")
            .select("*")
            .eq("log_id", log_id)
        )

        logs = response.data or []

        if not logs:

            return jsonify({
                "success": False,
                "error": "Logbook entry not found"
            }), 404

        (
            appointments_by_id,
            students_by_id,
            reasons_by_id,
            log_medicine_rows,
            medicines_by_id
        ) = get_all_reference_data()

        formatted = format_log_entry(
            logs[0],
            appointments_by_id,
            students_by_id,
            reasons_by_id,
            log_medicine_rows,
            medicines_by_id
        )

        return jsonify({
            "success": True,
            "log": formatted
        })

    except Exception as e:

        print("Logbook entry error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# CREATE A WALK-IN VISIT
#
# POST /logbook/walk-in
#
# Body:
# {
#     "student_id": "TEST001",
#     "slot_id": 1,
#     "appointment_date": "2026-08-17",
#     "appointment_time": "09:30:00",
#     "reason_id": 2,
#     "purpose": "Walk-in checkup",
#     "complaint": "Headache",
#     "admin_id": 1,
#     "status_id": 1,
#     "medicines": [
#         {"medicine_id": 1, "quantity": 2}
#     ]
# }
#
# A walk-in has no pre-existing appointment, so this endpoint
# first creates the appointment record, then the matching
# appointment_log record, then any medicine rows given.
# ============================================================

@logbook_bp.route(
    "/logbook/walk-in",
    methods=["POST"]
)
def create_walk_in():

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "success": False,
                "error": "Request body is required"
            }), 400

        student_id = data.get("student_id")
        appointment_date = data.get("appointment_date")
        appointment_time = data.get("appointment_time")
        # slot_id is optional now — the walk-in form lets staff type any
        # time, which won't always line up with a pre-defined time_slot
        # row. When the frontend does find a matching slot it still sends
        # slot_id, and we use it; otherwise we log the visit without one.
        slot_id = data.get("slot_id")

        missing = [
            field
            for field, value in [
                ("student_id", student_id),
                ("appointment_date", appointment_date),
                ("appointment_time", appointment_time)
            ]
            if not value
        ]

        if missing:

            return jsonify({
                "success": False,
                "error": f"Missing required fields: {', '.join(missing)}"
            }), 400

        # ----------------------------------------------------
        # Step 1: Create the appointment record
        # ----------------------------------------------------

        appointment_data = {
            "student_id": student_id,
            "slot_id": slot_id,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "reason_id": data.get("reason_id"),
            "purpose": data.get("purpose")
        }

        appointment_response = execute_with_retry(
            supabase
            .table("appointment")
            .insert(appointment_data)
        )

        if not appointment_response.data:

            return jsonify({
                "success": False,
                "error": "Failed to create walk-in appointment"
            }), 500

        new_appointment = appointment_response.data[0]
        new_appointment_id = new_appointment.get("appointment_id")

        # ----------------------------------------------------
        # Step 2: Create the matching logbook entry
        # ----------------------------------------------------

        log_data = {
            "appointment_id": new_appointment_id,
            "status_id": data.get("status_id"),
            "complaint": data.get("complaint"),
            "admin_id": data.get("admin_id"),
            # Manual fallback fields — only meaningful when the typed
            # student_id has no matching personal_information record.
            # Left as None for registered students; the frontend can
            # send them regardless and this just won't be used for
            # display when a real profile match exists.
            "walk_in_name": data.get("walk_in_name") or None,
            "walk_in_age": data.get("walk_in_age") or None,
            "walk_in_sex": data.get("walk_in_sex") or None,
            "walk_in_dept_course": data.get("walk_in_dept_course") or None,
        }

        log_response = execute_with_retry(
            supabase
            .table("appointment_log")
            .insert(log_data)
        )

        if not log_response.data:

            return jsonify({
                "success": False,
                "error": "Appointment created, but failed to create logbook entry",
                "appointment": new_appointment
            }), 500

        new_log = log_response.data[0]
        new_log_id = new_log.get("log_id")

        # ----------------------------------------------------
        # Step 3: Create medicine rows, if any were given
        # ----------------------------------------------------

        medicines = data.get("medicines") or []
        created_medicines = []

        for medicine_entry in medicines:

            medicine_id = medicine_entry.get("medicine_id")
            quantity = medicine_entry.get("quantity", 1)

            if not medicine_id:
                continue

            medicine_row = execute_with_retry(
                supabase
                .table("appointment_log_medicine")
                .insert({
                    "log_id": new_log_id,
                    "medicine_id": medicine_id,
                    "quantity": quantity
                })
            )

            if medicine_row.data:
                created_medicines.extend(medicine_row.data)

        return jsonify({
            "success": True,
            "message": "Walk-in visit created",
            "appointment": new_appointment,
            "log": new_log, 
            "medicines": created_medicines
        }), 201

    except Exception as e:

        print("Walk-in error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# ADD MEDICINE TO AN EXISTING LOGBOOK ENTRY
#
# POST /logbook/<log_id>/medicine
#
# Body:
# {
#     "medicines": [
#         {"medicine_id": 1, "quantity": 2},
#         {"medicine_id": 3, "quantity": 1}
#     ]
# }
#
# This is separate from the walk-in flow: it attaches medicine
# rows to a logbook entry that already exists, instead of
# creating a brand-new appointment + log. Used by the standalone
# "+ Add Medicine" action in LogbookPanel.jsx.
# ============================================================

@logbook_bp.route(
    "/logbook/<int:log_id>/medicine",
    methods=["POST"]
)
def add_medicine_to_log(log_id):

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "success": False,
                "error": "Request body is required"
            }), 400

        medicines = data.get("medicines") or []

        if not medicines:

            return jsonify({
                "success": False,
                "error": "At least one medicine is required"
            }), 400

        # Make sure the logbook entry actually exists first,
        # so we don't silently create orphaned medicine rows.
        log_response = execute_with_retry(
            supabase
            .table("appointment_log")
            .select("log_id")
            .eq("log_id", log_id)
        )

        if not log_response.data:

            return jsonify({
                "success": False,
                "error": "Logbook entry not found"
            }), 404

        created_medicines = []

        for medicine_entry in medicines:

            medicine_id = medicine_entry.get("medicine_id")
            quantity = medicine_entry.get("quantity", 1)

            if not medicine_id:
                continue

            medicine_row = execute_with_retry(
                supabase
                .table("appointment_log_medicine")
                .insert({
                    "log_id": log_id,
                    "medicine_id": medicine_id,
                    "quantity": quantity
                })
            )

            if medicine_row.data:
                created_medicines.extend(medicine_row.data)

        if not created_medicines:

            return jsonify({
                "success": False,
                "error": "No valid medicines were provided"
            }), 400

        return jsonify({
            "success": True,
            "message": "Medicine added to logbook entry",
            "log_id": log_id,
            "medicines": created_medicines
        }), 201

    except Exception as e:

        print("Add medicine error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500