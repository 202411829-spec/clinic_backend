import logging

from flask import Blueprint, jsonify, request, g
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from database import supabase
from routers.clinic_schedule import (
    get_schedule_for_date,
    get_default_settings,
    materialize_time_slots,
    generate_time_blocks,
    DEFAULT_SLOT_INTERVAL_MINUTES,
    DEFAULT_MAX_STUDENTS_PER_SLOT,
)
from routers.helpers import (
    execute_with_retry,
    normalize_student_id,
    build_student_lookup,
    build_reason_lookup,
    format_date_time,
    get_latest_status_for_appointments,
    handle_errors,
)
from routers.auth_guard import require_auth, require_admin, resolve_student_id

logger = logging.getLogger(__name__)


def _get_manila_tz():
    """Return Asia/Manila timezone (UTC+8). Falls back to fixed UTC+8 if zoneinfo unavailable."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Asia/Manila")
    except Exception:
        return timezone(timedelta(hours=8))


def _get_tomorrow_date():
    """Compute tomorrow's date in Manila time (server time UTC+8)."""
    tz = _get_manila_tz()
    today_manila = datetime.now(tz).date()
    return today_manila + timedelta(days=1)


def _is_bookable_date(date_str):
    """Return True iff date_str (YYYY-MM-DD) is >= tomorrow in Manila time."""
    try:
        parsed = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError, AttributeError):
        return False
    return parsed >= _get_tomorrow_date()


def _caller_is_admin():
    """Check whether the current caller (g.user) is an admin via app_accounts. Returns False for students/unknown."""
    raw = getattr(g, "user", None) or {}
    # Normalize to dict: g.user is normally {"id": ..., "email": ...} from require_auth (routers/auth_guard.py:234-237),
    # but be defensive if it is an attribute-style object or uses alternative key names.
    if not isinstance(raw, dict):
        try:
            raw = {
                "id": getattr(raw, "id", None),
                "email": getattr(raw, "email", None),
                "account_type": getattr(raw, "account_type", None),
                "role": getattr(raw, "role", None),
            }
        except Exception:
            raw = {}
    user = raw
    # Fast-path: if g.user already carries account_type/role == admin, bypass DB lookup.
    # This covers future auth_guard changes and avoids a DB round-trip for admins.
    acct = str(user.get("account_type") or user.get("role") or user.get("type") or "").strip().lower()
    if acct == "admin":
        return True
    auth_user_id = (
        user.get("id")
        or user.get("auth_user_id")
        or user.get("user_id")
        or user.get("sub")
        or user.get("uid")
    )
    email = (user.get("email") or user.get("user_email") or user.get("mail") or "").strip().lower()
    try:
        if auth_user_id:
            resp = execute_with_retry(
                supabase.table("app_accounts").select("admin_id").eq("auth_user_id", auth_user_id).eq("account_type", "admin").limit(1)
            )
            if resp.data and resp.data[0].get("admin_id"):
                return True
        if email:
            resp = execute_with_retry(
                supabase.table("app_accounts").select("admin_id").eq("email", email).eq("account_type", "admin").limit(1)
            )
            if resp.data and resp.data[0].get("admin_id"):
                return True
    except Exception as e:
        logger.error(
            "_caller_is_admin check failed for %s: %r",
            auth_user_id or email,
            e,
        )
    return False


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

# Default page size for the root /appointments list when the caller omits
# `limit`. The root list call must never read the whole table.
_APPOINTMENTS_DEFAULT_LIMIT = 50


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


def resolve_slot_for_booking(slot_id, appointment_time, appointment_date=None):
    """
    Resolve the target time_slot row for a booking, mirroring how
    GET /appointments/slots relates bookings to time_slot rows.

    Date-aware: for dates without a clinic_schedules override the GET
    endpoint returns VIRTUAL slots (negative slot_id). This resolver
    auto-materializes a real schedule + time_slots for that date so
    virtual bookings can succeed.

    Logic:
      1) If slot_id > 0, lookup by slot_id as before. If found return it
         (don't 400 just for schedule/date mismatch).
      2) If slot_id is negative/virtual or not found, and appointment_date
         is provided: look up clinic_schedules for that date. If no row
         exists, CREATE one on-demand from get_default_settings() and
         materialize_time_slots(), then find slot by appointment_time.
         If override exists but has no time_slots, materialize if enabled
         else return None (clinic closed).
      3) Fallback to matching by appointment_time across all slots.
         Returns None when no slot matches.
    """
    # 1) Real slot_id path
    if slot_id is not None:
        try:
            sid_int = int(slot_id)
        except (TypeError, ValueError):
            sid_int = None
        if sid_int is not None and sid_int > 0:
            response = execute_with_retry(
                supabase
                .table("time_slots")
                .select("*")
                .eq("slot_id", sid_int)
            )
            rows = response.data or []
            if rows:
                return rows[0]
            # not found -> fall through to date-aware handling
        elif sid_int is not None and sid_int < 0:
            # virtual slot -> must resolve via date
            pass
        else:
            # slot_id is 0 or unparseable -> treat as not provided
            pass
        # if sid_int is None (e.g. slot_id is string non-int) still fall through

    # 2) Date-aware virtual / missing slot handling
    if appointment_date:
        override = get_schedule_for_date(appointment_date)

        # Clinic explicitly closed -> let caller surface "Clinic is closed"
        if override and override.get("is_enabled") is False:
            return None

        requested_start = str(appointment_time or "")[:5] if appointment_time else None

        if override:
            schedule_id = override.get("schedule_id")
            # Try to find matching slot in this schedule
            if requested_start:
                resp = execute_with_retry(
                    supabase
                    .table("time_slots")
                    .select("*")
                    .eq("schedule_id", schedule_id)
                )
                rows = resp.data or []
                for slot in rows:
                    if str(slot.get("slot_start") or "")[:5] == requested_start:
                        return slot
                # No match but schedule exists and is enabled -> maybe
                # materialization missing (legacy row with zero children)
                if not rows:
                    try:
                        materialize_time_slots(override)
                    except Exception:
                        pass
                    resp2 = execute_with_retry(
                        supabase
                        .table("time_slots")
                        .select("*")
                        .eq("schedule_id", schedule_id)
                    )
                    rows2 = resp2.data or []
                    for slot in rows2:
                        if str(slot.get("slot_start") or "")[:5] == requested_start:
                            return slot
            # still not found -> will fall through to generic search / None
        else:
            # No override -> auto-materialize a real schedule for this date
            settings = get_default_settings()
            if settings:
                new_row_data = {
                    "working_date": appointment_date,
                    "work_start": settings.get("work_start"),
                    "work_end": settings.get("work_end"),
                    "break_start": settings.get("break_start"),
                    "break_end": settings.get("break_end"),
                    "is_enabled": True,
                }
                try:
                    insert_resp = execute_with_retry(
                        supabase
                        .table("clinic_schedules")
                        .insert(new_row_data)
                    )
                    new_rows = insert_resp.data or []
                except Exception:
                    new_rows = []
                # Race: another request may have created it concurrently
                if not new_rows:
                    override_retry = get_schedule_for_date(appointment_date)
                    if override_retry:
                        new_rows = [override_retry]
                if new_rows:
                    new_schedule = new_rows[0]
                    try:
                        materialize_time_slots(new_schedule)
                    except Exception:
                        pass
                    schedule_id = new_schedule.get("schedule_id")
                    if requested_start and schedule_id:
                        resp = execute_with_retry(
                            supabase
                            .table("time_slots")
                            .select("*")
                            .eq("schedule_id", schedule_id)
                        )
                        for slot in (resp.data or []):
                            if str(slot.get("slot_start") or "")[:5] == requested_start:
                                return slot
            # if settings missing, cannot materialize -> fall through

    # 3) Fallback: match by appointment_time across all slots (legacy behavior)
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
    row's max_students_per_slot; falls back to the shared default used by
    clinic_schedule.py.
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
        configured = DEFAULT_MAX_STUDENTS_PER_SLOT

    return max(configured, 0) or DEFAULT_MAX_STUDENTS_PER_SLOT


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


def _write_status(appointment_id, previous_status, new_status, remarks, changed_by):
    """Record a status change: insert the history row and keep the
    denormalized appointments.current_status column in sync (perf
    migration source of truth for status reads)."""
    response = execute_with_retry(
        supabase
        .table("appointment_status_history")
        .insert({
            "appointment_id": appointment_id,
            "previous_status": previous_status,
            "new_status": new_status,
            "remarks": remarks,
            "changed_by_admin_id": changed_by
        })
    )

    execute_with_retry(
        supabase
        .table("appointments")
        .update({"current_status": new_status})
        .eq("appointment_id", appointment_id)
    )

    return response


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
@handle_errors("Appointment error")
def get_appointments():

    requested_date = request.args.get("date")
    student_id = request.args.get("student_id")
    date_from = request.args.get("date_from")

    # Optional pagination. Semantics:
    #  - An explicit `limit` is always honored (paginated Admin/other
    #    callers control their page size directly).
    #  - A SCOPED call (student_id and/or date_from, or a literal
    #    `date`) is naturally page-sized — the future/upcoming set for
    #    one student (or one day) — so it is returned unbounded and is
    #    NOT capped. This is what the student UpcomingAppointmentPanel
    #    and Book pending-guard rely on after migrating to student_id +
    #    date_from below.
    #  - ONLY a truly bare call (no student_id, no date_from, no
    #    `date`, no explicit limit) falls back to a bounded default page
    #    so it can never read the whole table. No production caller
    #    hits this bare path anymore.
    limit_arg = request.args.get("limit")
    has_explicit_limit = limit_arg is not None and str(limit_arg).strip() != ""
    try:
        limit = int(limit_arg) if has_explicit_limit else 0
    except (TypeError, ValueError):
        limit = 0
    if limit < 0:
        limit = 0
    is_scoped = bool(student_id) or bool(date_from) or bool(requested_date)
    if limit == 0 and not is_scoped:
        limit = _APPOINTMENTS_DEFAULT_LIMIT

    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    if page < 1:
        page = 1

    query = (
        supabase
        .table("appointments")
        .select("*", count="exact")
    )

    if requested_date:
        query = query.eq(
            "appointment_date",
            requested_date
        )

    if student_id:
        query = query.eq("student_id", student_id)
    if date_from:
        query = query.gte("appointment_date", date_from)

    query = (
        query
        .order("appointment_date", desc=False)
        .order("appointment_time", desc=False)
        .order("appointment_id", desc=False)
    )

    if limit:
        start = (page - 1) * limit
        query = query.range(start, start + limit - 1)

    response = execute_with_retry(query)

    appointments = response.data or []
    total = response.count if limit else len(appointments)

    # Join latest status for each appointment
    appointment_ids = [a["appointment_id"] for a in appointments]
    latest_status_map = get_latest_status_for_appointments(appointment_ids)

    for appt in appointments:
        status_row = latest_status_map.get(appt["appointment_id"])
        appt["current_status"] = status_row.get("new_status") if status_row else None

    payload = {
        "success": True,
        "count": len(appointments),
        "appointments": appointments
    }
    if limit:
        payload["total"] = total

    return jsonify(payload)


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
@handle_errors("Get appointment error")
def get_appointment(appointment_id):

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
@handle_errors("Time slot error")
def get_time_slots():
    formatted_slots = []
    schedule_id = request.args.get("schedule_id")
    requested_date = request.args.get("date")

    # No schedule and no date -> nothing to scope the response to.
    # Without either we would have to read every slot and every
    # appointment in the system, so reject the open-ended call.
    if not schedule_id and not requested_date:
        return jsonify({
            "success": False,
            "error": "Either 'schedule_id' or 'date' is required."
        }), 400

    # ----------------------------------------------------
    # Booking window defense-in-depth: students may only query
    # slots starting tomorrow (>= tomorrow). Today and past are
    # blocked; any future date >= tomorrow is allowed. Admins are
    # unrestricted so the admin AppointmentsPanel can inspect any
    # date. Direct API calls with a non-bookable date are rejected
    # with the same 400 message as the booking endpoint.
    # ----------------------------------------------------
    if requested_date and not _caller_is_admin():
        if not _is_bookable_date(requested_date):
            return jsonify({
                "success": False,
                "error": "Booking is allowed starting tomorrow."
            }), 400

    # ----------------------------------------------------
    # Date-filtered handling: dedup by filtering to
    # requested_date's schedule (prevents returning all
    # schedules' slots with duplicate times).
    # ----------------------------------------------------
    if requested_date:
        override = get_schedule_for_date(requested_date)

        # Closed day → empty
        if override and override.get("is_enabled") is False:
            return jsonify({
                "success": True,
                "count": 0,
                "slots": []
            })

        # No override and no explicit schedule_id → generate
        # virtual default slots (do NOT return all schedules'
        # time_slots). Keep schedule_id param handling: if
        # caller passed schedule_id, honour that filter instead
        # of generating virtual slots.
        if not override and not schedule_id:
            settings = get_default_settings()
            if not settings:
                return jsonify({
                    "success": True,
                    "count": 0,
                    "slots": []
                })
            # Build config like clinic_schedule preview
            try:
                slot_interval = int(
                    settings.get(
                        "slot_interval_minutes", DEFAULT_SLOT_INTERVAL_MINUTES
                    )
                )
            except (TypeError, ValueError):
                slot_interval = DEFAULT_SLOT_INTERVAL_MINUTES
            if slot_interval <= 0:
                slot_interval = DEFAULT_SLOT_INTERVAL_MINUTES
            try:
                max_students = int(
                    settings.get(
                        "max_students_per_slot", DEFAULT_MAX_STUDENTS_PER_SLOT
                    )
                )
            except (TypeError, ValueError):
                max_students = DEFAULT_MAX_STUDENTS_PER_SLOT
            config = {
                "work_start": settings.get("work_start"),
                "work_end": settings.get("work_end"),
                "break_start": settings.get("break_start"),
                "break_end": settings.get("break_end"),
                "slot_interval": slot_interval,
                "max_students": max_students,
            }
            blocks = generate_time_blocks(config)

            # Fetch appointments for date to compute booked counts
            appointment_query = (
                supabase
                .table("appointments")
                .select("*")
                .eq("appointment_date", requested_date)
            )
            with ThreadPoolExecutor(max_workers=2) as executor:
                appointment_fut = executor.submit(
                    execute_with_retry, appointment_query
                )
                reasons_fut = executor.submit(build_reason_lookup)

                appointment_response = appointment_fut.result()
                reasons_by_id = reasons_fut.result()
            appointments = appointment_response.data or []
            appointment_ids = [a["appointment_id"] for a in appointments]
            # Scope the student lookup to this date's appointment
            # student ids instead of the old whole-table TTL dict
            # (perf migration).
            students_by_id = build_student_lookup(
                [a.get("student_id") for a in appointments]
            )
            latest_status_by_appointment = (
                get_latest_status_for_appointments(appointment_ids)
            )

            # Build bookings grouped by time (HH:MM)
            # For virtual slots we match appointments by appointment_time
            # rather than time_slot_id (virtual slots have no real slot_id).
            bookings_by_time = {}
            for appointment in appointments:
                status_row = latest_status_by_appointment.get(
                    appointment.get("appointment_id"), {}
                )
                # Hide cancelled bookings from display and booked counts
                if str((status_row or {}).get("new_status") or "").strip().lower() == "cancelled":
                    continue
                time_key = str(appointment.get("appointment_time") or "")[:5]
                student = students_by_id.get(
                    normalize_student_id(appointment.get("student_id")), {}
                )
                reason_row = reasons_by_id.get(
                    appointment.get("reason_id"), {}
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
                    "status": (_STATUS_LABELS.get(status_row.get("new_status"))
                               or "Pending"),
                    "bookedAt": format_date_time(
                        appointment.get("booked_at")
                    )
                }
                bookings_by_time.setdefault(time_key, []).append(booking)

            formatted_slots = []
            for idx, block in enumerate(blocks):
                time_key = block["start"]
                bookings = bookings_by_time.get(time_key, [])
                booked_count = len(bookings)
                remaining = max(0, max_students - booked_count)
                # Virtual slot identifiers: schedule_id None, slot_id negative/index
                virtual_slot_id = -(idx + 1)
                formatted_slots.append({
                    "id": virtual_slot_id,
                    "slot_id": virtual_slot_id,
                    "schedule_id": None,
                    "time": f"{block['start']} - {block['end']}",
                    "slot_start": block["start"],
                    "slot_end": block["end"],
                    "capacity": max_students,
                    "booked": booked_count,
                    "slotsLeft": remaining,
                    "full": booked_count >= max_students,
                    "available": booked_count < max_students,
                    "bookings": bookings
                })

            return jsonify({
                "success": True,
                "count": len(formatted_slots),
                "slots": formatted_slots
            })

    # ----------------------------------------------------
    # Fetch time slots (filtered by schedule_id / date's schedule)
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
    elif requested_date:
        # requested_date provided without schedule_id: filter to that date's schedule
        # (already handled closed/virtual cases above; if override exists, filter)
        override = get_schedule_for_date(requested_date)
        if override:
            slot_query = slot_query.eq(
                "schedule_id",
                override.get("schedule_id")
            )

    # Fetch time slots plus the student/reason lookups concurrently.
    # The appointments query is NOT submitted here when no date is
    # given — a schedule_id-only call scopes it to the schedule's
    # resolved time_slot_ids (below), so it depends on slot_response.
    with ThreadPoolExecutor(max_workers=2) as executor:
        slot_fut = executor.submit(
            execute_with_retry,
            slot_query.order("slot_start", desc=False),
        )
        reasons_fut = executor.submit(build_reason_lookup)

        slot_response = slot_fut.result()
        reasons_by_id = reasons_fut.result()

    slots = slot_response.data or []

    # ----------------------------------------------------
    # Fetch appointments for the scoped set of time slots,
    # since bookings are grouped by slot_id.
    #
    # Date calls filter appointments by appointment_date (indexed,
    # naturally page-sized). Schedule_id-only calls resolve the
    # schedule's slot_ids first and scope appointments with a bounded
    # IN lookup — previously this was an unconditional read of the
    # ENTIRE appointments table. A schedule with no slots short-circuits
    # with an impossible equality so the query returns zero rows
    # instead of scanning the table.
    # ----------------------------------------------------

    if requested_date:
        appointment_query = (
            supabase
            .table("appointments")
            .select("*")
            .eq("appointment_date", requested_date)
        )
    else:
        slot_ids = [
            s.get("slot_id")
            for s in slots
            if s.get("slot_id") is not None
        ]
        appointment_query = (
            supabase
            .table("appointments")
            .select("*")
        )
        if slot_ids:
            appointment_query = appointment_query.in_(
                "time_slot_id", slot_ids
            )
        else:
            appointment_query = appointment_query.eq(
                "appointment_id", -1
            )

    appointment_response = execute_with_retry(appointment_query)

    appointments = appointment_response.data or []

    appointment_ids = [
        a["appointment_id"] for a in appointments
    ]

    # ----------------------------------------------------
    # Build lookups for joining
    # ----------------------------------------------------

    latest_status_by_appointment = (
        get_latest_status_for_appointments(appointment_ids)
    )

    # Scope the student lookup to this slot set's appointment student
    # ids instead of the old whole-table TTL dict (perf migration).
    students_by_id = build_student_lookup(
        [a.get("student_id") for a in appointments]
    )

    # ----------------------------------------------------
    # Group appointments (as bookings) by time_slot_id
    # Legacy NULL time_slot_id fallback: appointments with
    # time_slot_id=None (pre-materialize / walk-in) are
    # resolved by appointment_time -> slot_start matching
    # so they appear under the correct slot in the admin panel.
    # ----------------------------------------------------

    # Build time -> slot_id lookup for NULL resolution (schedule-aware)
    resolved_override = None
    resolved_schedule_id = None
    if requested_date:
        resolved_override = get_schedule_for_date(requested_date)
        if resolved_override:
            resolved_schedule_id = resolved_override.get("schedule_id")
    slot_time_to_id = {}
    for slot in slots:
        if resolved_schedule_id is not None and slot.get("schedule_id") != resolved_schedule_id:
            continue
        start_time = str(slot.get("slot_start") or "")[:5]
        if start_time and start_time not in slot_time_to_id:
            slot_time_to_id[start_time] = slot.get("slot_id")

    bookings_by_slot = {}

    for appointment in appointments:

        slot_id = appointment.get("time_slot_id")
        # Resolve NULL slot_id via appointment_time when date matches requested_date
        if slot_id is None and requested_date:
            appt_date = str(appointment.get("appointment_date") or "")[:10]
            if appt_date == str(requested_date)[:10]:
                appt_time_key = str(appointment.get("appointment_time") or "")[:5]
                resolved = slot_time_to_id.get(appt_time_key)
                if resolved is not None:
                    slot_id = resolved
                else:
                    logger.warning(
                        "get_time_slots: no matching slot for null time_slot_id "
                        "appointment %s time %s date %s",
                        appointment.get("appointment_id"),
                        appt_time_key,
                        appt_date,
                    )

        # build_student_lookup() keys students by
        # normalize_student_id(), so normalize the raw id here too.
        status_row = latest_status_by_appointment.get(
            appointment.get("appointment_id"), {}
        )
            # Hide cancelled bookings from display and booked counts
        if str((status_row or {}).get("new_status") or "").strip().lower() == "cancelled":
            continue
        student = students_by_id.get(
            normalize_student_id(appointment.get("student_id")), {}
        )

        reason_row = reasons_by_id.get(
            appointment.get("reason_id"), {}
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
    # Build formatted slot list (deduplicate by time)
    # ----------------------------------------------------

    # Deduplicate slots that share the same time string
    # within the same schedule (legacy double-insert left two
    # rows per block). Keep different schedule_ids distinct
    # when no date filter is applied.
    deduped = {}
    time_to_ids = {}
    for slot in slots:
        time_key = f"{(slot.get('slot_start') or '')[:5]} - {(slot.get('slot_end') or '')[:5]}"
        dedup_key = (slot.get("schedule_id"), time_key)
        slot_id = slot.get("slot_id")
        time_to_ids.setdefault(dedup_key, []).append(slot_id)
        if dedup_key not in deduped:
            deduped[dedup_key] = slot

    formatted_slots = []

    for dedup_key, slot in deduped.items():
        time_key = dedup_key[1]
        slot_id = slot.get("slot_id")
        max_capacity = slot.get("max_capacity") or 0
        # Merge bookings from all duplicate ids for this time+schedule
        ids_for_time = time_to_ids.get(dedup_key, [slot_id])
        merged_bookings = []
        for dup_id in ids_for_time:
            merged_bookings.extend(bookings_by_slot.get(dup_id, []))
        bookings = merged_bookings
        booked_count = len(bookings)
        remaining = max(0, max_capacity - booked_count)

        formatted_slots.append({
            "id": slot_id,
            "slot_id": slot_id,
            "schedule_id": slot.get("schedule_id"),
            "time": time_key,
            "slot_start": slot.get("slot_start"),
            "slot_end": slot.get("slot_end"),
            "capacity": max_capacity,
            "booked": booked_count,
            "slotsLeft": remaining,
            "full": booked_count >= max_capacity,
            "available": booked_count < max_capacity,
            "bookings": bookings
        })

    # Keep chronological order
    formatted_slots.sort(key=lambda s: (s.get("slot_start") or ""))

    return jsonify({
        "success": True,
        "count": len(formatted_slots),
        "slots": formatted_slots
    })


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
@handle_errors("Status error")
def get_appointment_status(appointment_id):

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
@handle_errors("Update status error")
def update_appointment_status(appointment_id):

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

    is_completed = new_status == "completed"

    # Auto-resolve changed_by from authenticated admin user
    # g.user.email is set by require_admin (via require_auth).
    # Use the shared resolver (email → username → any admin fallback).
    changed_by = resolve_changed_by_admin_id(g.user)

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

    response = _write_status(
        appointment_id,
        previous_status,
        new_status,
        remarks,
        changed_by,
    )

    # Auto-create logbook entry when appointment is completed
    logbook_entry = None
    logbook_created = False
    if is_completed:
        try:
            existing_log = execute_with_retry(
                supabase
                .table("visit_logs")
                .select("visit_log_id")
                .eq("appointment_id", appointment_id)
                .limit(1)
            )
            if not existing_log.data:
                log_data = {
                    "appointment_id": appointment_id,
                    "attending_admin_id": changed_by,
                    "is_walk_in": False,
                    "complaint": remarks or None,
                }
                log_resp = execute_with_retry(
                    supabase.table("visit_logs").insert(log_data)
                )
                if log_resp.data:
                    logbook_entry = log_resp.data[0]
                    logbook_created = True
        except Exception as log_err:
            logger.error("Auto-create visit_logs failed: %r", log_err)

    result = {
        "success": True,
        "message": "Appointment status updated",
        "status": response.data,
    }
    if logbook_entry is not None:
        result["logbook"] = logbook_entry
        result["logbook_created"] = logbook_created
    elif is_completed:
        result["logbook_created"] = logbook_created

    return jsonify(result)


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
@handle_errors("Create appointment error")
def create_appointment():

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

    # ----------------------------------------------------
    # Server-side booking window (Manila/UTC+8): student can book
    # for any date >= tomorrow (starting tomorrow onwards). Today
    # and past are blocked. Admins bypass this check (admin has
    # separate walk-in path via /logbook/walk-in for today;
    # student booking endpoint must remain strict).
    # ----------------------------------------------------
    if not _caller_is_admin():
        if not _is_bookable_date(appointment_date):
            return jsonify({
                "success": False,
                "error": "Booking is allowed starting tomorrow."
            }), 400

    if is_slot_closed_for_date(appointment_date):
        return jsonify({
            "success": False,
            "error": "Clinic is closed on the requested date"
        }), 400

    slot = resolve_slot_for_booking(
        data.get("slot_id"),
        appointment_time,
        appointment_date
    )

    if not slot:
        return jsonify({
            "success": False,
            "error": "Time slot not found for the requested date/time"
        }), 400

    slot_id = slot.get("slot_id")

    # Existing appointments for this slot and the slot capacity
    # setting are independent lookups — fetch them concurrently.
    with ThreadPoolExecutor(max_workers=2) as executor:
        existing_fut = executor.submit(
            execute_with_retry,
            supabase
            .table("appointments")
            .select("appointment_id, student_id")
            .eq("time_slot_id", slot_id)
            .eq("appointment_date", appointment_date),
        )
        capacity_fut = executor.submit(get_max_students_per_slot)

        existing_response = existing_fut.result()
        capacity = capacity_fut.result()

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

    if len(active_appointments) >= capacity:
        return jsonify({
            "success": False,
            "error": "This time slot is fully booked"
        }), 409

    # ----------------------------------------------------
    # Enforce single active (pending) appointment per student
    # Non-admin (student) callers may only have one appointment
    # whose latest status is 'pending'. Admin bookings bypass.
    # Reschedule support: if the frontend is replacing an
    # existing pending appointment in one action, it may pass
    # the old appointment_id via `rescheduled_id`
    # (also accepts rescheduled_appointment_id /
    # reschedule_from_id / previous_appointment_id) — that id
    # is excluded from the pending check. Otherwise the
    # recommended frontend flow is cancel-first-then-book,
    # during which there is no pending row and the check passes.
    # Race note: SELECT-then-INSERT is not atomic. Two
    # simultaneous requests could both pass the check. A
    # partial unique index / DB constraint would be the
    # proper fix if strict atomicity is required.
    # ----------------------------------------------------
    if not _caller_is_admin():
        # Resolve the requesting student's id authoritatively from JWT
        token_sid = resolve_student_id(g.user)
        effective_sid = normalize_student_id(token_sid) if token_sid else None
        # Fallback to the payload's student_id when JWT resolution fails
        if not effective_sid:
            effective_sid = normalized_student_id
        if effective_sid:
            # Support reschedule replacement: exclude the old appointment
            rescheduled_raw = (
                data.get("rescheduled_id")
                or data.get("rescheduled_appointment_id")
                or data.get("reschedule_from_id")
                or data.get("previous_appointment_id")
            )
            parsed_rescheduled_id = None
            if rescheduled_raw is not None:
                try:
                    parsed_rescheduled_id = int(rescheduled_raw)
                except (TypeError, ValueError):
                    parsed_rescheduled_id = None
            try:
                pending_q = supabase.table("appointments").select("appointment_id, student_id").eq("student_id", effective_sid)
                pending_resp = execute_with_retry(pending_q)
                candidate_rows = pending_resp.data or []
                # Normalize filter in Python for legacy case differences
                candidate_rows = [
                    r for r in candidate_rows
                    if normalize_student_id(r.get("student_id")) == effective_sid
                ]
                if parsed_rescheduled_id is not None:
                    candidate_rows = [
                        r for r in candidate_rows
                        if r.get("appointment_id") != parsed_rescheduled_id
                    ]
                if candidate_rows:
                    cand_ids = [r.get("appointment_id") for r in candidate_rows]
                    latest_map = get_latest_status_for_appointments(cand_ids)
                    has_pending = False
                    for aid in cand_ids:
                        row = latest_map.get(aid)
                        if row is None:
                            # No history yet — treat as active pending (new row seeds pending)
                            has_pending = True
                            break
                        latest = str((row.get("new_status") or "")).strip().lower()
                        if latest == "pending":
                            has_pending = True
                            break
                    if has_pending:
                        return jsonify({
                            "success": False,
                            "error": "You already have an active appointment (pending). Please wait until it is completed, cancelled, or marked as no-show before booking again."
                        }), 400
            except Exception as pending_check_err:
                # Log and re-raise so DB errors surface as 500 instead of
                # silently allowing double-booking.
                logger.error("Pending check error: %r", pending_check_err)
                raise

    # Use the resolved slot's id so bookings always line up with
    # the time_slot rows the slots endpoint reports on.
    # Normalize student_id for FK matching (Supabase lowercases emails)
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

    new_appointment = dict(response.data[0])

    # Seed the initial status so it shows up for staff. The db stores the
    # lowercase enum value "pending" — never title-case "Pending".
    _write_status(
        new_appointment.get("appointment_id"),
        None,  # NULL on first insert
        "pending",
        "Booked by student",
        data.get("changed_by"),
    )

    # The row captured from the INSERT predates the sync update, so it
    # still holds current_status = NULL. Reflect the just-seeded status
    # in the response payload as well.
    new_appointment["current_status"] = "pending"

    return jsonify({
        "success": True,
        "message": "Appointment booked",
        "appointment": new_appointment
    }), 201


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
@handle_errors("Cancel appointment error")
def cancel_appointment(appointment_id):

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
    # (via the verified g.user).
    student_email = g.user.get("email")
    if not student_email:
        return jsonify({
            "success": False,
            "error": "Unable to verify student identity"
        }), 403

    token_student_id = resolve_student_id(g.user)

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

    # Resolve the admin who processed the cancellation from the
    # authenticated user (email -> username -> any admin), so
    # changed_by_admin_id is always a valid admin_id FK to admin_accounts.
    changed_by = resolve_changed_by_admin_id(g.user)

    if changed_by is None:
        return jsonify({
            "success": False,
            "error": "Unable to determine admin identity (changed_by)"
        }), 400

    # The enum stores the lowercase value "cancelled" — never title-case.
    _write_status(
        appointment_id,
        previous_status,
        "cancelled",
        "Cancelled by student",
        changed_by,
    )

    return jsonify({
        "success": True,
        "message": "Appointment cancelled"
    })