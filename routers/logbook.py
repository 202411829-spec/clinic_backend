from flask import Blueprint, jsonify, request

from database import supabase
# Shared helpers live in routers/helpers.py — this module used to
# carry its own near-identical copies of the retry wrapper and
# lookup builders, which had diverged (normalized student-id
# keys). They are consolidated there now; nothing outside this
# file relied on the module-local names.
from routers.helpers import (
    execute_with_retry,
    normalize_student_id,
    build_student_lookup,
    build_reason_lookup,
    build_medicine_lookup,
    get_medicines_for_log
)
from routers.auth_guard import require_auth, require_admin


logbook_bp = Blueprint("logbook", __name__)


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
    Take a raw visit_logs row and return the fully joined
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
        log.get("visit_log_id"),
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

    # Separate dept and course (student lookup provides both;
    # walk-in form stores combined "Course - Department")
    if is_registered:
        display_dept = student.get("dept") or "-"
        # student lookup has deptCourse as "Course - Department"
        # extract course from it - handle different dash types
        dept_course = student.get("deptCourse") or "-"
        # Try multiple separators: " - ", " — ", " -", "- "
        display_course = dept_course
        for sep in [" - ", " — ", " – ", " -", "- "]:
            if sep in dept_course:
                parts = dept_course.split(sep)
                display_course = parts[0].strip()
                display_dept = parts[1].strip() if len(parts) > 1 else display_dept
                break
    else:
        # walk-in: walk_in_department_course is "Course - Department"
        walk_in_department_course = log.get("walk_in_department_course") or "-"
        display_course = walk_in_department_course
        display_dept = "-"
        for sep in [" - ", " — ", " – ", " -", "- "]:
            if sep in walk_in_department_course:
                parts = walk_in_department_course.split(sep)
                display_course = parts[0].strip()
                display_dept = parts[1].strip() if len(parts) > 1 else "-"
                break

    display_sex = student.get("sex") or log.get("walk_in_sex") or "-"

    return {
        "id": log.get("visit_log_id"),
        "log_id": log.get("visit_log_id"),
        "appointment_id": appointment_id,
        "student_id": student_id,
        "dateTime": date_time,
        "name": display_name,
        "age": display_age,
        "dept": display_dept,
        "course": display_course,
        "deptCourse": f"{display_course} - {display_dept}" if display_course != "-" and display_dept != "-" else (display_course if display_course != "-" else display_dept),
        "sex": display_sex,
        "reason": reason_text,
        "complaint": log.get("complaint") or "-",
        "medicine": medicine_string,
        "admin_id": log.get("attending_admin_id"),
        "is_registered": is_registered
    }


def get_all_reference_data():
    """
    Fetch every table needed to build fully joined log entries,
    once, so repeated calls don't re-query per row.
    """

    appointments_response = execute_with_retry(
        supabase
        .table("appointments")
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
        .table("visit_log_medicines")
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
#
# Query params:
#   search          - text search across name, student_id, dept, course, complaint, medicine
#   date_from       - filter logs on/after this date (YYYY-MM-DD)
#   date_to         - filter logs on/before this date (YYYY-MM-DD)
#   reason_id       - filter by reason ID
#   page            - page number (default 1)
#   page_size       - items per page (default 20, max 100)
# ============================================================

@logbook_bp.route("/logbook", methods=["GET"])
@require_auth
def get_logbook():

    try:
        # --- Parse query params ---
        search = request.args.get("search", "").strip()
        date_from = request.args.get("date_from")
        date_to = request.args.get("date_to")
        reason_id = request.args.get("reason_id", type=int)
        page = max(1, request.args.get("page", default=1, type=int))
        page_size = min(100, max(1, request.args.get("page_size", default=20, type=int)))

        # --- Fetch all logs first (we filter in Python after joining) ---
        response = execute_with_retry(
            supabase
            .table("visit_logs")
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

        # --- Format all logs first ---
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

        # --- Apply filters ---
        def matches_search(entry):
            if not search:
                return True
            s = search.lower()
            return (
                s in (entry.get("name") or "").lower()
                or s in (entry.get("student_id") or "").lower()
                or s in (entry.get("dept") or "").lower()
                or s in (entry.get("course") or "").lower()
                or s in (entry.get("complaint") or "").lower()
                or s in (entry.get("medicine") or "").lower()
            )

        def matches_date(entry):
            if not date_from and not date_to:
                return True
            # dateTime is in format "MM/DD/YYYY HH:MM"
            dt_str = entry.get("dateTime") or ""
            try:
                if "/" in dt_str:
                    date_part = dt_str.split(" ")[0]
                    month, day, year = date_part.split("/")
                    entry_date = f"{year}-{month}-{day}"
                else:
                    entry_date = dt_str[:10]
            except Exception:
                return False

            if date_from and entry_date < date_from:
                return False
            if date_to and entry_date > date_to:
                return False
            return True

        def matches_reason(entry):
            if not reason_id:
                return True
            appt = appointments_by_id.get(entry.get("appointment_id"), {})
            return appt.get("reason_id") == reason_id

        filtered = [
            e for e in formatted
            if matches_search(e) and matches_date(e) and matches_reason(e)
        ]

        # --- Pagination ---
        total = len(filtered)
        start = (page - 1) * page_size
        end = start + page_size
        paginated = filtered[start:end]

        return jsonify({
            "success": True,
            "count": len(paginated),
            "total": total,
            "page": page,
            "page_size": page_size,
            "logbook": paginated
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
@require_auth
def get_logbook_by_student(student_id):

    try:

        appointment_response = execute_with_retry(
            supabase
            .table("appointments")
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
            .table("visit_logs")
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
@require_auth
def get_logbook_entry(log_id):

    try:

        response = execute_with_retry(
            supabase
            .table("visit_logs")
            .select("*")
            .eq("visit_log_id", log_id)
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
#     "student_id": "TEST001",       # optional (walk-ins may omit it)
#     "slot_id": 1,                  # optional
#     "appointment_date": "2026-08-17",
#     "appointment_time": "09:30:00",
#     "reason_id": 2,
#     "purpose": "Walk-in checkup",
#     "complaint": "Headache",
#     "admin_id": 1,
#     "walk_in_name": "...",         # for unregistered walk-ins
#     "walk_in_age": 18,
#     "walk_in_sex": "M",
#     "walk_in_department_course": "Course - Department",
#     "medicines": [
#         {"medicine_id": 1, "quantity": 2}
#     ]
# }
#
# A walk-in has no pre-existing appointment, so this endpoint
# first creates the appointment record, then the matching
# visit_logs record, then any visit_log_medicines rows given.
# ============================================================

@logbook_bp.route(
    "/logbook/walk-in",
    methods=["POST"]
)
@require_admin
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

        # student_id is OPTIONAL for walk-ins — an unregistered patient
        # may provide only walk_in_* fields (Decision D). appointment_date
        # and appointment_time remain required (Decision E).
        missing = [
            field
            for field, value in [
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
            "time_slot_id": slot_id,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "reason_id": data.get("reason_id"),
            "appointment_purpose": data.get("purpose"),
            "is_walk_in": True
        }

        appointment_response = execute_with_retry(
            supabase
            .table("appointments")
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
            "complaint": data.get("complaint"),
            "attending_admin_id": data.get("admin_id"),
            "is_walk_in": True,
            # Manual fallback fields — only meaningful when the typed
            # student_id has no matching student_masterlist record.
            # Left as None for registered students; the frontend can
            # send them regardless and this just won't be used for
            # display when a real profile match exists.
            "walk_in_name": data.get("walk_in_name") or None,
            "walk_in_age": data.get("walk_in_age") or None,
            "walk_in_sex": data.get("walk_in_sex") or None,
            "walk_in_department_course": data.get("walk_in_department_course") or None,
            "walk_in_contact": data.get("walk_in_contact") or None,
        }

        log_response = execute_with_retry(
            supabase
            .table("visit_logs")
            .insert(log_data)
        )

        if not log_response.data:

            return jsonify({
                "success": False,
                "error": "Appointment created, but failed to create logbook entry",
                "appointment": new_appointment
            }), 500

        new_log = log_response.data[0]
        new_log_id = new_log.get("visit_log_id")

        # ----------------------------------------------------
        # Step 3: Create medicine rows, if any were given
        # ----------------------------------------------------

        # Look up medicine names so each row stores its own
        # medicine_name SNAPSHOT (Decision F / Blockers L) —
        # historical prescriptions survive later medicines edits.
        medicines_by_id = build_medicine_lookup()

        medicines = data.get("medicines") or []
        created_medicines = []

        for medicine_entry in medicines:

            medicine_id = medicine_entry.get("medicine_id")
            quantity = medicine_entry.get("quantity", 1)

            if not medicine_id:
                continue

            medicine = medicines_by_id.get(medicine_id, {})

            medicine_row = execute_with_retry(
                supabase
                .table("visit_log_medicines")
                .insert({
                    "visit_log_id": new_log_id,
                    "medicine_id": medicine_id,
                    "medicine_name": medicine.get("medicine_name") or "Unknown",
                    "quantity_dispensed": quantity
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
@require_admin
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
            .table("visit_logs")
            .select("visit_log_id")
            .eq("visit_log_id", log_id)
        )

        if not log_response.data:

            return jsonify({
                "success": False,
                "error": "Logbook entry not found"
            }), 404

        # Look up medicine names so each row stores its own
        # medicine_name SNAPSHOT (Decision F / Blockers L).
        medicines_by_id = build_medicine_lookup()

        created_medicines = []

        for medicine_entry in medicines:

            medicine_id = medicine_entry.get("medicine_id")
            quantity = medicine_entry.get("quantity", 1)

            if not medicine_id:
                continue

            medicine = medicines_by_id.get(medicine_id, {})

            medicine_row = execute_with_retry(
                supabase
                .table("visit_log_medicines")
                .insert({
                    "visit_log_id": log_id,
                    "medicine_id": medicine_id,
                    "medicine_name": medicine.get("medicine_name") or "Unknown",
                    "quantity_dispensed": quantity
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


# ============================================================
# LIST REASONS (for the walk-in form dropdown)
#
# GET /reasons
# ============================================================

@logbook_bp.route("/reasons", methods=["GET"])
@require_auth
def get_reasons():

    try:

        reasons_by_id = build_reason_lookup()

        reasons = [
            {
                "reason_id": reason_id,
                "description": row.get("description") or "-",
            }
            for reason_id, row in sorted(
                reasons_by_id.items(),
                key=lambda kv: str(kv[1].get("description") or "")
            )
        ]

        return jsonify({
            "success": True,
            "count": len(reasons),
            "reasons": reasons
        })

    except Exception as e:

        print("Reasons error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# LIST MEDICINES (for walk-in / add-medicine forms)
#
# GET /medicines
# ============================================================

@logbook_bp.route("/medicines", methods=["GET"])
@require_auth
def get_medicines():

    try:

        medicines_by_id = build_medicine_lookup()

        medicines = [
            {
                "medicine_id": medicine_id,
                "medicine_name": row.get("medicine_name") or "-",
            }
            for medicine_id, row in sorted(
                medicines_by_id.items(),
                key=lambda kv: str(kv[1].get("medicine_name") or "")
            )
        ]

        return jsonify({
            "success": True,
            "count": len(medicines),
            "medicines": medicines
        })

    except Exception as e:

        print("Medicines error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500