from flask import Blueprint, jsonify, request
from database import supabase
from routers.helpers import (
    execute_with_retry,
    normalize_student_id,
    build_student_lookup,
    build_reason_lookup,
    format_date_time
)
from routers.auth_guard import require_auth, require_admin


appointment_bp = Blueprint("appointment", __name__)


# ============================================================
# HELPERS
# ============================================================

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


def resolve_slot_for_booking(slot_id, appointment_time):
    """
    Resolve the target time_slot row for a booking, mirroring how
    GET /appointments/slots relates bookings to time_slot rows.

    If an explicit slot_id was sent, use it directly. Otherwise
    fall back to matching a slot whose slot_start equals the
    requested appointment_time ("HH:MM"). Returns None when no
    slot matches.
    """
    if slot_id:

        response = execute_with_retry(
            supabase
            .table("time_slot")
            .select("*")
            .eq("slot_id", slot_id)
        )

        rows = response.data or []

        return rows[0] if rows else None

    if not appointment_time:
        return None

    requested_start = str(appointment_time)[:5]  # "HH:MM"

    response = execute_with_retry(
        supabase
        .table("time_slot")
        .select("*")
        .order("slot_start", desc=False)
    )

    for slot in (response.data or []):
        if str(slot.get("slot_start") or "")[:5] == requested_start:
            return slot

    return None


def is_slot_closed_for_date(appointment_date):
    """
    True when a clinic_schedule override marks the given date as
    closed/disabled (is_enabled is False).
    """
    response = execute_with_retry(
        supabase
        .table("clinic_schedule")
        .select("is_enabled, reason")
        .eq("working_date", appointment_date)
        .limit(1)
    )

    rows = response.data or []

    if not rows:
        return False

    return rows[0].get("is_enabled") is False


def get_max_students_per_slot():
    """
    Capacity per slot comes from the global clinic_appointment_settings
    row's max_student_per_slot; falls back to 10 — the value the rest
    of the codebase (clinic_schedule.py's preview endpoint) has always
    hardcoded as the default.
    """
    response = execute_with_retry(
        supabase
        .table("clinic_appointment_settings")
        .select("max_student_per_slot")
        .limit(1)
    )

    rows = response.data or []

    try:
        configured = int(rows[0].get("max_student_per_slot"))
    except (TypeError, ValueError, IndexError):
        configured = 10

    return max(configured, 0) or 10


# ============================================================
# GET ALL APPOINTMENTS
#
# GET /appointments
#
# Optional:
# GET /appointments?date=2026-08-13
# ============================================================

@appointment_bp.route("/appointments", methods=["GET"])
@require_auth
def get_appointments():

    try:
        requested_date = request.args.get("date")

        query = (
            supabase
            .table("appointment")
            .select("*")
        )

        if requested_date:
            query = query.eq(
                "appointment_date",
                requested_date
            )

        response = execute_with_retry(
            query
            .order("appointment_date", desc=False)
            .order("appointment_time", desc=False)
        )

        appointments = response.data or []

        return jsonify({
            "success": True,
            "count": len(appointments),
            "appointments": appointments
        })

    except Exception as e:

        print("Appointment error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET SINGLE APPOINTMENT
#
# GET /appointments/<appointment_id>
# ============================================================

@appointment_bp.route(
    "/appointments/<int:appointment_id>",
    methods=["GET"]
)
@require_auth
def get_appointment(appointment_id):

    try:

        response = execute_with_retry(
            supabase
            .table("appointment")
            .select("*")
            .eq(
                "appointment_id",
                appointment_id
            )
        )

        appointments = response.data or []

        if not appointments:

            return jsonify({
                "success": False,
                "error": "Appointment not found"
            }), 404

        return jsonify({
            "success": True,
            "appointment": appointments[0]
        })

    except Exception as e:

        print("Get appointment error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET TIME SLOTS (WITH BOOKINGS, FULLY JOINED)
#
# GET /appointments/slots
#
# Optional:
# GET /appointments/slots?schedule_id=1
# GET /appointments/slots?date=2026-08-17
#
# Returns each time slot with a "bookings" array of the
# students booked into it, matching what AppointmentsPanel.jsx
# expects: name, age, dept, sex, reason, status.
# ============================================================

@appointment_bp.route(
    "/appointments/slots",
    methods=["GET"]
)
@require_auth
def get_time_slots():

    try:

        schedule_id = request.args.get("schedule_id")
        requested_date = request.args.get("date")

        # ----------------------------------------------------
        # Fetch time slots
        # ----------------------------------------------------

        slot_query = (
            supabase
            .table("time_slot")
            .select("*")
        )

        if schedule_id:
            slot_query = slot_query.eq(
                "schedule_id",
                schedule_id
            )

        slot_response = execute_with_retry(
            slot_query
            .order("slot_start", desc=False)
        )

        slots = slot_response.data or []

        # ----------------------------------------------------
        # Fetch appointments (optionally filtered by date),
        # since bookings are grouped by slot_id
        # ----------------------------------------------------

        appointment_query = (
            supabase
            .table("appointment")
            .select("*")
        )

        if requested_date:
            appointment_query = appointment_query.eq(
                "appointment_date",
                requested_date
            )

        appointment_response = execute_with_retry(
            appointment_query
        )

        appointments = appointment_response.data or []

        appointment_ids = [
            a["appointment_id"] for a in appointments
        ]

        # ----------------------------------------------------
        # Build lookups for joining
        # ----------------------------------------------------

        students_by_id = build_student_lookup()
        reasons_by_id = build_reason_lookup()
        latest_status_by_appointment = (
            get_latest_status_for_appointments(appointment_ids)
        )

        # ----------------------------------------------------
        # Group appointments (as bookings) by slot_id
        # ----------------------------------------------------

        bookings_by_slot = {}

        for appointment in appointments:

            slot_id = appointment.get("slot_id")

            # build_student_lookup() keys students by
            # normalize_student_id(), so normalize the raw id here too.
            student = students_by_id.get(
                normalize_student_id(appointment.get("student_id")), {}
            )

            reason_row = reasons_by_id.get(
                appointment.get("reason_id"), {}
            )

            status_row = latest_status_by_appointment.get(
                appointment.get("appointment_id"), {}
            )

            booking = {
                "id": appointment.get("appointment_id"),
                "appointment_id": appointment.get("appointment_id"),
                "student_id": appointment.get("student_id"),
                "name": student.get("name", "-"),
                "age": (
                    student.get("age")
                    if student.get("age") is not None
                    else "-"
                ),
                "dept": student.get("dept", "-"),
                "sex": student.get("sex", "-"),
                "reason": reason_row.get("description") or "-",
                "status": status_row.get("new_status") or "Pending",
                "bookedAt": format_date_time(
                    appointment.get("booked_at")
                )
            }

            bookings_by_slot.setdefault(slot_id, []).append(booking)

        # ----------------------------------------------------
        # Build formatted slot list
        # ----------------------------------------------------

        formatted_slots = []

        for slot in slots:

            slot_id = slot.get("slot_id")

            max_capacity = slot.get("max_capacity") or 0
            bookings = bookings_by_slot.get(slot_id, [])
            booked_count = len(bookings)
            remaining = max(0, max_capacity - booked_count)

            formatted_slots.append({
                "id": slot_id,
                "slot_id": slot_id,
                "schedule_id": slot.get("schedule_id"),
                "time": (
                    f"{(slot.get('slot_start') or '')[:5]} - "
                    f"{(slot.get('slot_end') or '')[:5]}"
                ),
                "slot_start": slot.get("slot_start"),
                "slot_end": slot.get("slot_end"),
                "capacity": max_capacity,
                "booked": booked_count,
                "slotsLeft": remaining,
                "full": booked_count >= max_capacity,
                "available": booked_count < max_capacity,
                "bookings": bookings
            })

        return jsonify({
            "success": True,
            "count": len(formatted_slots),
            "slots": formatted_slots
        })

    except Exception as e:

        print("Time slot error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET CURRENT STATUS
#
# GET /appointments/<appointment_id>/status
# ============================================================

@appointment_bp.route(
    "/appointments/<int:appointment_id>/status",
    methods=["GET"]
)
@require_auth
def get_appointment_status(appointment_id):

    try:

        response = execute_with_retry(
            supabase
            .table("status")
            .select("*")
            .eq(
                "appointment_id",
                appointment_id
            )
            .order(
                "changed_at",
                desc=True
            )
            .limit(1)
        )

        statuses = response.data or []

        if not statuses:

            return jsonify({
                "success": True,
                "appointment_id": appointment_id,
                "status": None
            })

        latest = statuses[0]

        return jsonify({
            "success": True,
            "appointment_id": appointment_id,
            "status": latest.get("new_status"),
            "status_record": latest
        })

    except Exception as e:

        print("Status error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# UPDATE APPOINTMENT STATUS
#
# PATCH /appointments/<appointment_id>/status
#
# Body:
# {
#     "new_status": "Confirmed",
#     "remarks": "Appointment confirmed",
#     "changed_by": 1
# }
# ============================================================

@appointment_bp.route(
    "/appointments/<int:appointment_id>/status",
    methods=["PATCH"]
)
@require_admin
def update_appointment_status(appointment_id):

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "success": False,
                "error": "Request body is required"
            }), 400

        new_status = data.get("new_status")
        remarks = data.get("remarks")
        changed_by = data.get("changed_by")

        if not new_status:

            return jsonify({
                "success": False,
                "error": "new_status is required"
            }), 400

        appointment_response = execute_with_retry(
            supabase
            .table("appointment")
            .select("appointment_id")
            .eq(
                "appointment_id",
                appointment_id
            )
        )

        if not appointment_response.data:

            return jsonify({
                "success": False,
                "error": "Appointment not found"
            }), 404

        previous_response = execute_with_retry(
            supabase
            .table("status")
            .select("new_status")
            .eq(
                "appointment_id",
                appointment_id
            )
            .order(
                "changed_at",
                desc=True
            )
            .limit(1)
        )

        previous_status = None

        if previous_response.data:

            previous_status = (
                previous_response.data[0]
                .get("new_status")
            )

        status_data = {
            "appointment_id": appointment_id,
            "old_status": previous_status,
            "new_status": new_status,
            "remarks": remarks,
            "changed_by": changed_by
        }

        response = execute_with_retry(
            supabase
            .table("status")
            .insert(status_data)
        )

        return jsonify({
            "success": True,
            "message": "Appointment status updated",
            "status": response.data
        })

    except Exception as e:

        print(
            "Update status error:",
            repr(e)
        )

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# CREATE APPOINTMENT (student booking)
#
# POST /appointments
#
# Body:
# {
#     "student_id": "202411829",
#     "slot_id": 3,
#     "appointment_date": "2026-08-25",
#     "appointment_time": "09:00",
#     "reason_id": 1
# }
#
# Creates the appointment row and seeds an initial
# "Pending" status entry so the admin panel sees it.
#
# Server-side validations (all return the standard
# {"success": false, "error": ...} envelope):
#   - 400 when no matching time_slot exists for slot_id /
#     appointment_time
#   - 400 when a clinic_schedule override marks the date
#     closed (is_enabled = false)
#   - 409 when the slot is at capacity
#     (clinic_appointment_settings.max_student_per_slot)
#   - 409 when the same student already holds an ACTIVE
#     appointment in that same slot/date
# ============================================================

@appointment_bp.route("/appointments", methods=["POST"])
@require_auth
def create_appointment():

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
        # SERVER-SIDE SLOT VALIDATION
        #
        # GET /appointments/slots already computes full/slotsLeft,
        # but POST used to insert blindly. Validate before writing:
        #   1. slot exists (by slot_id, or matched by time)
        #   2. date isn't closed via a clinic_schedule override
        #   3. slot not at capacity (clinic_appointment_settings
        #      .max_student_per_slot)
        #   4. no duplicate active booking for this student+slot
        #
        # NOTE: Supabase gives us no transaction here, so the
        # count-check + insert is not atomic — two simultaneous
        # bookings could both pass the check and slightly overrun
        # capacity. The window is tiny and acceptable for this app;
        # a DB-level constraint/exclusion would be the real fix.
        # ----------------------------------------------------

        slot = resolve_slot_for_booking(
            data.get("slot_id"),
            appointment_time
        )

        if not slot:
            return jsonify({
                "success": False,
                "error": "Time slot not found for the requested date/time"
            }), 400

        if is_slot_closed_for_date(appointment_date):
            return jsonify({
                "success": False,
                "error": "Clinic is closed on the requested date"
            }), 400

        slot_id = slot.get("slot_id")

        existing_response = execute_with_retry(
            supabase
            .table("appointment")
            .select("appointment_id, student_id")
            .eq("slot_id", slot_id)
            .eq("appointment_date", appointment_date)
        )

        existing_appointments = existing_response.data or []

        # An appointment still occupies capacity unless its LATEST
        # status row says it was Cancelled — same "latest status wins"
        # rule the slots endpoint uses for display.
        latest_status_by_appointment = get_latest_status_for_appointments([
            row.get("appointment_id") for row in existing_appointments
        ])

        def _is_active(row):
            status_row = latest_status_by_appointment.get(
                row.get("appointment_id")
            )
            latest_status = (status_row or {}).get("new_status") or ""
            return str(latest_status).strip().lower() != "cancelled"

        active_appointments = [
            row for row in existing_appointments if _is_active(row)
        ]

        normalized_student_id = normalize_student_id(student_id)

        duplicate = any(
            normalize_student_id(row.get("student_id"))
            == normalized_student_id
            for row in active_appointments
        )

        if duplicate:
            return jsonify({
                "success": False,
                "error": "You already have an appointment in this time slot"
            }), 409

        capacity = get_max_students_per_slot()

        if len(active_appointments) >= capacity:
            return jsonify({
                "success": False,
                "error": "This time slot is fully booked"
            }), 409

        # Use the resolved slot's id so bookings always line up with
        # the time_slot rows the slots endpoint reports on.
        appointment_data = {
            "student_id": student_id,
            "slot_id": slot_id,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "reason_id": data.get("reason_id"),
            "purpose": data.get("purpose")
        }

        response = execute_with_retry(
            supabase
            .table("appointment")
            .insert(appointment_data)
        )

        if not response.data:

            return jsonify({
                "success": False,
                "error": "Failed to create appointment"
            }), 500

        new_appointment = response.data[0]

        # Seed the initial status so it shows up as "Pending" for staff.
        execute_with_retry(
            supabase
            .table("status")
            .insert({
                "appointment_id": new_appointment.get("appointment_id"),
                "old_status": None,
                "new_status": "Pending",
                "remarks": "Booked by student",
                "changed_by": data.get("changed_by")
            })
        )

        return jsonify({
            "success": True,
            "message": "Appointment booked",
            "appointment": new_appointment
        }), 201

    except Exception as e:

        print("Create appointment error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500