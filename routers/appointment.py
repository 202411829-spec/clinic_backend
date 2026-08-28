from flask import Blueprint, jsonify, request, g
from database import supabase
from routers.helpers import (
    execute_with_retry,
    normalize_student_id,
    build_student_lookup,
    build_reason_lookup,
    format_date_time,
    get_latest_status_for_appointments
)
from routers.auth_guard import require_auth, require_admin, resolve_student_id


appointment_bp = Blueprint("appointment", __name__)


# ============================================================
# HELPERS
# ============================================================

# Appointment status enum values (clean schema, Decision B). There is no
# "Confirmed" and no title-case — the enum is exactly these four lowercase
# values.
_VALID_STATUSES = {"pending", "completed", "no_show", "cancelled"}

# Legacy/UI title-case spellings -> canonical lowercase enum value. Used to
# coerce client input defensively. "Confirmed" is a legacy value remapped to
# "completed" and is never stored as-is.
_TITLE_CASE_TO_ENUM = {
    "Pending": "pending",
    "Completed": "completed",
    "No Show": "no_show",
    "No-Show": "no_show",
    "Cancelled": "cancelled",
    "Canceled": "cancelled",
    "Confirmed": "completed",
}

# Canonical enum value -> display label (mirrors notifications.py).
_STATUS_LABELS = {
    "pending": "Pending",
    "completed": "Completed",
    "no_show": "No Show",
    "cancelled": "Cancelled",
}


def _normalize_status(status):
    """
    Coerce a client-supplied status to the canonical lowercase enum value.

    Accepts the four valid values in any case plus the legacy title-case
    spellings. Returns None (rejected) when the value is not a valid
    appointment status, so callers never write an invalid value into the
    enum column.
    """
    if status is None:
        return None
    raw = str(status).strip()
    if not raw:
        return None
    if raw in _VALID_STATUSES:
        return raw
    lowered = raw.lower()
    if lowered in _VALID_STATUSES:
        return lowered
    return _TITLE_CASE_TO_ENUM.get(raw) or _TITLE_CASE_TO_ENUM.get(lowered)


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
            .table("time_slots")
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
        .table("time_slots")
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
        .table("clinic_schedules")
        .select("is_enabled, closure_reason")
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
    row's max_students_per_slot; falls back to 10 — the value the rest
    of the codebase (clinic_schedule.py's preview endpoint) has always
    hardcoded as the default.
    """
    response = execute_with_retry(
        supabase
        .table("clinic_appointment_settings")
        .select("max_students_per_slot")
        .limit(1)
    )

    rows = response.data or []

    try:
        configured = int(rows[0].get("max_students_per_slot"))
    except (TypeError, ValueError, IndexError):
        configured = 10

    return max(configured, 0) or 10


def resolve_changed_by_admin_id(user):
    """
    Resolve the admin_id to record on a status change from the
    authenticated user (g.user). Tries, in order:
      1. exact email match against admin.email
      2. username match (local part of the email)
      3. any admin row (system-level fallback)
    Returns None when no admin can be resolved.

    Mirrors the changed_by auto-resolution in
    update_appointment_status, plus an "any admin" fallback for
    self-service actions like student cancellations where the
    caller is not an admin.
    """
    email = (user or {}).get("email")

    if not email:
        return None

    email = str(email).strip().lower()

    # 1. Try to find admin by email
    admin_response = execute_with_retry(
        supabase
        .table("admin_accounts")
        .select("admin_id")
        .eq("email", email)
        .limit(1)
    )

    rows = admin_response.data or []

    if rows:
        return rows[0].get("admin_id")

    # 2. Fallback: match by username (local part of email)
    local_part = email.split("@")[0] if "@" in email else email

    admin_response = execute_with_retry(
        supabase
        .table("admin_accounts")
        .select("admin_id")
        .eq("username", local_part)
        .limit(1)
    )

    rows = admin_response.data or []

    if rows:
        return rows[0].get("admin_id")

    # 3. Fallback: any admin row
    admin_response = execute_with_retry(
        supabase
        .table("admin_accounts")
        .select("admin_id")
        .limit(1)
    )

    rows = admin_response.data or []

    return rows[0].get("admin_id") if rows else None


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
            .table("appointments")
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

        # Join latest status for each appointment
        appointment_ids = [a["appointment_id"] for a in appointments]
        latest_status_map = get_latest_status_for_appointments(appointment_ids)

        for appt in appointments:
            status_row = latest_status_map.get(appt["appointment_id"])
            appt["current_status"] = status_row.get("new_status") if status_row else None

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
            .table("appointments")
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
            .table("time_slots")
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
            .table("appointments")
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
        # Group appointments (as bookings) by time_slot_id
        # ----------------------------------------------------

        bookings_by_slot = {}

        for appointment in appointments:

            slot_id = appointment.get("time_slot_id")

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
                # Display label from the lowercase enum ("pending" -> "Pending").
                # "Pending" here is a display-only default — it is never written
                # to the DB (the enum stores lowercase "pending").
                "status": (_STATUS_LABELS.get(status_row.get("new_status"))
                           or "Pending"),
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
            .table("appointment_status_history")
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

        # Canonicalize the stored enum value to lowercase (pending/completed/
        # no_show/cancelled) for the response contract.
        canonical_status = _normalize_status(latest.get("new_status"))

        return jsonify({
            "success": True,
            "appointment_id": appointment_id,
            "status": canonical_status,
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
#     "new_status": "completed",
#     "remarks": "Appointment completed",
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

        if not new_status:

            return jsonify({
                "success": False,
                "error": "new_status is required"
            }), 400

        # Validate/coerce the status against the 4-value enum. Never let an
        # invalid value (e.g. the removed "Confirmed") reach the enum column,
        # which would surface as a PGRST 500.
        new_status = _normalize_status(new_status)
        if new_status not in _VALID_STATUSES:
            return jsonify({
                "success": False,
                "error": f"Invalid status '{data.get('new_status') or ''}'. "
                         f"Must be one of: {', '.join(sorted(_VALID_STATUSES))}"
            }), 400

        # Auto-resolve changed_by from authenticated admin user
        # g.user.email is set by require_admin (via require_auth)
        changed_by = None
        if g.user and g.user.get("email"):
            admin_email = g.user.get("email")
            # Try to find admin by email
            admin_response = execute_with_retry(
                supabase
                .table("admin_accounts")
                .select("admin_id")
                .eq("email", admin_email)
                .maybe_single()
            )
            if admin_response.data:
                changed_by = admin_response.data.get("admin_id")
            else:
                # Fallback: try to match by username (local part of email)
                local_part = admin_email.split("@")[0] if "@" in admin_email else admin_email
                admin_response = execute_with_retry(
                    supabase
                    .table("admin_accounts")
                    .select("admin_id")
                    .eq("username", local_part)
                    .maybe_single()
                )
                if admin_response.data:
                    changed_by = admin_response.data.get("admin_id")

        # Fallback to provided changed_by if auto-resolve failed
        if changed_by is None:
            changed_by = data.get("changed_by")

        if changed_by is None:
            return jsonify({
                "success": False,
                "error": "Unable to determine admin identity (changed_by)"
            }), 400

        appointment_response = execute_with_retry(
            supabase
            .table("appointments")
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
            .table("appointment_status_history")
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
            "previous_status": previous_status,
            "new_status": new_status,
            "remarks": remarks,
            "changed_by_admin_id": changed_by
        }

        response = execute_with_retry(
            supabase
            .table("appointment_status_history")
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
# "pending" status entry so the admin panel sees it.
#
# Server-side validations (all return the standard
# {"success": false, "error": ...} envelope):
#   - 400 when no matching time_slot exists for slot_id /
#     appointment_time
#   - 400 when a clinic_schedule override marks the date
#     closed (is_enabled = false)
#   - 409 when the slot is at capacity
#     (clinic_appointment_settings.max_students_per_slot)
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
        #      .max_students_per_slot)
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
            .table("appointments")
            .select("appointment_id, student_id")
            .eq("time_slot_id", slot_id)
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
        # Normalize student_id for FK matching (Supabase lowercases emails)
        normalized_student_id = normalize_student_id(student_id)
        appointment_data = {
            "student_id": normalized_student_id,
            "time_slot_id": slot_id,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "reason_id": data.get("reason_id"),
            "appointment_purpose": data.get("purpose")
        }

        response = execute_with_retry(
            supabase
            .table("appointments")
            .insert(appointment_data)
        )

        if not response.data:

            return jsonify({
                "success": False,
                "error": "Failed to create appointment"
            }), 500

        new_appointment = response.data[0]

        # Seed the initial status so it shows up for staff. The db stores the
        # lowercase enum value "pending" — never title-case "Pending".
        execute_with_retry(
            supabase
            .table("appointment_status_history")
            .insert({
                "appointment_id": new_appointment.get("appointment_id"),
                "previous_status": None,  # NULL on first insert
                "new_status": "pending",
                "remarks": "Booked by student",
                "changed_by_admin_id": data.get("changed_by")
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


# ============================================================
# STUDENT SELF-CANCEL APPOINTMENT
#
# DELETE /appointments/<appointment_id>
#
# Allows a student to cancel their own appointment.
# Requires authentication; the student can only cancel
# their own appointments (verified by student_id match).
# Updates the status to "cancelled" with a remark.
# ============================================================

@appointment_bp.route(
    "/appointments/<int:appointment_id>",
    methods=["DELETE"]
)
@require_auth
def cancel_appointment(appointment_id):

    try:

        # Get the appointment to check ownership
        appointment_response = execute_with_retry(
            supabase
            .table("appointments")
            .select("appointment_id, student_id")
            .eq("appointment_id", appointment_id)
            .maybe_single()
        )

        if not appointment_response.data:
            return jsonify({
                "success": False,
                "error": "Appointment not found"
            }), 404

        appointment = appointment_response.data

        # Verify ownership: normalize both IDs for comparison.
        # Resolve the caller's student_id authoritatively from `app_accounts`
        # (via the verified g.user). Fall back to the email local-part guess
        # only if resolution failed (Blockers C).
        student_email = g.user.get("email")
        if not student_email:
            return jsonify({
                "success": False,
                "error": "Unable to verify student identity"
            }), 403

        # Primary: authoritative student_id from app_accounts.
        token_student_id = resolve_student_id(g.user)
        # Last-resort fallback: email local part.
        if not token_student_id and "@" in student_email:
            token_student_id = student_email.split("@")[0]

        if normalize_student_id(token_student_id) != normalize_student_id(appointment.get("student_id")):
            return jsonify({
                "success": False,
                "error": "You can only cancel your own appointments"
            }), 403

        # Check if already cancelled
        status_response = execute_with_retry(
            supabase
            .table("appointment_status_history")
            .select("new_status")
            .eq("appointment_id", appointment_id)
            .order("changed_at", desc=True)
            .limit(1)
        )

        statuses = status_response.data or []
        if statuses and str(statuses[0].get("new_status", "")).strip().lower() == "cancelled":
            return jsonify({
                "success": False,
                "error": "Appointment is already cancelled"
            }), 400

        # Capture the true previous status (the latest row before this cancel),
        # so previous_status is accurate rather than a hardcoded default.
        previous_status = statuses[0].get("new_status") if statuses else None

        # Insert cancelled status, resolving the admin who processed
        # the cancellation from the authenticated user (email ->
        # username -> any admin), so changed_by_admin_id is always a valid
        # admin_id FK to admin_accounts.
        changed_by = resolve_changed_by_admin_id(g.user)

        if changed_by is None:
            return jsonify({
                "success": False,
                "error": "Unable to determine admin identity (changed_by)"
            }), 400

        # The enum stores the lowercase value "cancelled" — never title-case.
        execute_with_retry(
            supabase
            .table("appointment_status_history")
            .insert({
                "appointment_id": appointment_id,
                "previous_status": previous_status,
                "new_status": "cancelled",
                "remarks": "Cancelled by student",
                "changed_by_admin_id": changed_by
            })
        )

        return jsonify({
            "success": True,
            "message": "Appointment cancelled"
        })

    except Exception as e:
        print("Cancel appointment error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500