import time
import socket

from flask import Blueprint, jsonify, request
from database import supabase

try:
    import httpx
except ImportError:
    httpx = None

from routers.helpers import (
    build_student_lookup,
    build_reason_lookup,
    format_date_time
)


appointment_bp = Blueprint("appointment", __name__)


# ============================================================
# RETRY WRAPPER — same fix as logbook.py. The Supabase/httpx
# client occasionally hits transient low-level socket errors on
# Windows dev machines (e.g. WinError 10035 / WSAEWOULDBLOCK)
# when it reuses a pooled connection that isn't quite ready yet.
# These are not real failures, just a stale connection —
# retrying the exact same query a moment later succeeds. Every
# .execute() call in this file should go through here instead
# of being called directly, so a flaky socket doesn't surface
# as a 500.
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


# ============================================================
# GET ALL APPOINTMENTS
#
# GET /appointments
#
# Optional:
# GET /appointments?date=2026-08-13
# ============================================================

@appointment_bp.route("/appointments", methods=["GET"])
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

            student = students_by_id.get(
                appointment.get("student_id"), {}
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
# ============================================================

@appointment_bp.route("/appointments", methods=["POST"])
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

        appointment_data = {
            "student_id": student_id,
            "slot_id": data.get("slot_id"),
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