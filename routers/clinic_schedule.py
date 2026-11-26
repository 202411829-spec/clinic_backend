import logging

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta

try:
    from postgrest import APIError as PostgrestAPIError
except Exception:  # pragma: no cover - import shape varies by client version
    PostgrestAPIError = None

from database import supabase
from routers.auth_guard import require_auth, require_admin
from routers.helpers import (
    execute_with_retry,
    handle_errors,
    build_reason_lookup,
    reason_uses_dedicated_schedule,
)

logger = logging.getLogger(__name__)


clinic_schedule_bp = Blueprint("clinic_schedule", __name__)


SETTINGS_TABLE = "clinic_appointment_settings"
SCHEDULE_TABLE = "clinic_schedules"


# Defaults used when the global settings row lacks a value.
DEFAULT_SLOT_INTERVAL_MINUTES = 30
DEFAULT_MAX_STUDENTS_PER_SLOT = 10

SCHEDULE_MIGRATION_MESSAGE = (
    "Clinic schedule schema is missing required reason-scope columns. "
    "Apply migrations/2026-11-26_dental_service_schedule.sql, then reload the schema cache."
)


def _is_missing_reason_scope_column_error(error):
    """True when PostgREST rejects a query because clinic_schedules.reason_id is absent."""
    if PostgrestAPIError is not None and isinstance(error, PostgrestAPIError):
        code = str(getattr(error, "code", "") or "")
        message = str(getattr(error, "message", "") or str(error))
        details = str(getattr(error, "details", "") or "")
        hint = str(getattr(error, "hint", "") or "")
        haystack = " ".join([message, details, hint]).lower()
        if code in {"42703", "PGRST204"} and "reason_id" in haystack:
            return True
        if "reason_id" in haystack and ("does not exist" in haystack or "schema cache" in haystack):
            return True

    # Defensive fallback for wrapped/normalized errors.
    haystack = str(error).lower()
    return "reason_id" in haystack and (
        "42703" in haystack
        or "pgrst204" in haystack
        or "does not exist" in haystack
        or "schema cache" in haystack
    )


def _missing_schedule_migration_response():
    logger.error(
        "Clinic schedule schema mismatch: clinic_schedules.reason_id missing. "
        "Required migration: migrations/2026-11-26_dental_service_schedule.sql"
    )
    return jsonify({
        "success": False,
        "error": SCHEDULE_MIGRATION_MESSAGE,
        "migration_required": "migrations/2026-11-26_dental_service_schedule.sql",
    }), 503


# ============================================================
# HELPERS
# ============================================================

def normalize_time(value):
    """
    Convert database time/datetime values to HH:MM.
    """
    if value is None:
        return None

    value = str(value)

    if "T" in value:
        value = value.split("T")[-1]

    if " " in value:
        value = value.split(" ")[-1]

    return value[:5]


def get_default_settings():
    """
    Fetch the single global settings row.
    """
    response = execute_with_retry(
        supabase
        .table(SETTINGS_TABLE)
        .select("*")
        .limit(1)
    )

    rows = response.data or []

    return rows[0] if rows else None


def resolve_reason_scope(reason_id, reasons_by_id=None):
    """
    Map a request-supplied appointment reason to a clinic_schedules
    scope. This is THE single place the reason -> schedule-scope rule
    lives (slots endpoint, booking, schedule CRUD, preview).

    Returns:
      None  -> legacy GENERAL schedule scope (clinic_schedules.reason_id
               IS NULL). Used when no reason was supplied, when the
               supplied value is blank, or when the supplied reason is
               NOT dedicated (Consultation / Medical Certificate) —
               preserving the original date-wide schedule behaviour.
       int   -> that dedicated reason's scope: callers must use ONLY
                clinic_schedules rows with this reason_id and must never
                fall back to the general schedule or default availability.
                The database flag is authoritative; the Dental Service
                description is also recognized on partially migrated
                schemas where that flag is absent.

    Raises ValueError when the supplied reason_id is malformed or not a
    known appointment reason; callers surface that as HTTP 400.
    """
    if reason_id is None:
        return None

    if isinstance(reason_id, str) and not reason_id.strip():
        return None

    try:
        parsed = int(str(reason_id).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid reason_id: {reason_id!r}")

    if parsed <= 0:
        raise ValueError(f"Invalid reason_id: {reason_id!r}")

    lookup = reasons_by_id if reasons_by_id is not None else build_reason_lookup()

    row = lookup.get(parsed)
    if row is None:
        row = lookup.get(str(parsed))
    if row is None:
        raise ValueError(f"Unknown reason_id: {parsed}")

    if reason_uses_dedicated_schedule(row):
        return parsed

    return None


def resolve_schedule_admin_scope(reason_id, reasons_by_id=None):
    """
    Resolve the REASON FILTER used by the admin Clinic Schedule panel.

    This deliberately differs from resolve_reason_scope(): the admin panel
    must be able to configure any appointment reason's own
    clinic_schedules.reason_id rows, even when that reason is not marked
    dedicated for student booking. Student slots/bookings keep the legacy
    dedicated-only rule; only schedule administration uses this literal
    scope.

      None / blank -> legacy GENERAL schedule (reason_id IS NULL).
      int          -> that exact reason_id, after verifying the reason exists.

    Raises ValueError for malformed or unknown reason ids so callers can
    return 400.
    """
    if reason_id is None:
        return None

    if isinstance(reason_id, str) and not reason_id.strip():
        return None

    try:
        parsed = int(str(reason_id).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid reason_id: {reason_id!r}")

    if parsed <= 0:
        raise ValueError(f"Invalid reason_id: {reason_id!r}")

    lookup = reasons_by_id if reasons_by_id is not None else build_reason_lookup()
    row = lookup.get(parsed)
    if row is None:
        row = lookup.get(str(parsed))
    if row is None:
        raise ValueError(f"Unknown reason_id: {parsed}")

    return parsed


def schedule_row_matches_reason_scope(row, reason_scope):
    """
    Match a clinic_schedules row against a resolved reason scope WITHOUT
    asking PostgREST to filter on clinic_schedules.reason_id.

    The reason-scoped schedule migration is additive and has not necessarily
    been applied in every environment yet. A live 42703 probe confirmed the
    current production table has no reason_id column, so putting that column
    in the PostgREST query makes /appointments/slots fail with a 500. Reading
    the row with select('*') and filtering here gives the same semantics:

      * column absent  -> every row is the legacy GENERAL schedule, so a
                          dedicated scope simply has no availability;
      * column present -> normal general/dedicated isolation as before.
    """
    value = row.get("reason_id")
    if reason_scope is None:
        return value is None or value == "" or value == "null"
    return value is not None and str(value) == str(reason_scope)


def get_schedule_for_date(working_date, reason_id=None):
    """
    Fetch a clinic_schedule override row for a specific date,
    if one exists.

    reason_id is a RESOLVED scope (see resolve_reason_scope):
      None  -> the legacy GENERAL schedule (reason_id IS NULL when the
               column exists) — this is what get_schedule_for_date(date)
               has always meant, so existing callers keep their behaviour.
      int   -> ONLY that dedicated reason's schedule row for the date
               (never the general row).

    The scope filter is applied in Python, not in the PostgREST query, so
    this also works against databases where the additive reason_id column
    has not been applied yet. See schedule_row_matches_reason_scope().
    """
    response = execute_with_retry(
        supabase
        .table(SCHEDULE_TABLE)
        .select("*")
        .eq("working_date", working_date)
    )

    rows = [
        row for row in (response.data or [])
        if schedule_row_matches_reason_scope(row, reason_id)
    ]

    return rows[0] if rows else None


def resolve_day_config(override):
    """
    Decide which hours/capacity config governs a date.

    When an override (clinic_schedules row) is passed, its work hours
    and break window win; the global clinic_appointment_settings row
    still supplies slot_interval_minutes / max_students_per_slot
    (defaults 30 minutes and 10 students). With no override,
    everything comes from the settings row.

    Returns a config dict:
        {
            "work_start": "HH:MM",
            "work_end": "HH:MM",
            "break_start": "HH:MM" | None,
            "break_end": "HH:MM" | None,
            "slot_interval": int,
            "max_students": int,
        }
    or None when no override was passed AND no settings row exists
    (the caller decides how to surface that — preview returns 404).
    """

    settings = get_default_settings()

    if override:

        work_start = override.get("work_start")
        work_end = override.get("work_end")
        break_start = override.get("break_start")
        break_end = override.get("break_end")

    else:

        if not settings:
            return None

        work_start = settings.get("work_start")
        work_end = settings.get("work_end")
        break_start = settings.get("break_start")
        break_end = settings.get("break_end")

    try:
        slot_interval = int(
            (settings or {}).get(
                "slot_interval_minutes", DEFAULT_SLOT_INTERVAL_MINUTES
            )
        )
    except (TypeError, ValueError):
        slot_interval = DEFAULT_SLOT_INTERVAL_MINUTES

    if slot_interval <= 0:
        slot_interval = DEFAULT_SLOT_INTERVAL_MINUTES

    try:
        max_students = int(
            (settings or {}).get(
                "max_students_per_slot", DEFAULT_MAX_STUDENTS_PER_SLOT
            )
        )
    except (TypeError, ValueError):
        max_students = DEFAULT_MAX_STUDENTS_PER_SLOT

    return {
        "work_start": work_start,
        "work_end": work_end,
        "break_start": break_start,
        "break_end": break_end,
        "slot_interval": slot_interval,
        "max_students": max_students,
    }


def generate_time_blocks(config):
    """
    The SINGLE CANONICAL block-math used by BOTH the preview endpoint
    AND time_slots materialization. Walks work_start -> work_end in
    slot_interval steps, dropping any block that overlaps the break
    window, and returns:

        [{"start": "08:00", "end": "08:30", "capacity": 10}, ...]
    """

    start = datetime.strptime(
        normalize_time(config["work_start"]),
        "%H:%M"
    )

    end = datetime.strptime(
        normalize_time(config["work_end"]),
        "%H:%M"
    )

    break_start_dt = None
    break_end_dt = None

    if config["break_start"] and config["break_end"]:

        break_start_dt = datetime.strptime(
            normalize_time(config["break_start"]),
            "%H:%M"
        )

        break_end_dt = datetime.strptime(
            normalize_time(config["break_end"]),
            "%H:%M"
        )

    blocks = []

    current = start

    while current < end:

        block_end = current + timedelta(
            minutes=config["slot_interval"]
        )

        if block_end > end:
            break

        is_break = (
            break_start_dt is not None
            and break_end_dt is not None
            and current < break_end_dt
            and block_end > break_start_dt
        )

        if not is_break:

            blocks.append({
                "start": current.strftime("%H:%M"),
                "end": block_end.strftime("%H:%M"),
                "capacity": config["max_students"]
            })

        current = block_end

    return blocks


def delete_time_slot_children(schedule_id):
    """
    Remove every time_slots child of a clinic_schedules row. Called
    before regenerating children (so stale slots never linger) and
    before deleting/disabling an override itself.

    Appointments hold an FK into time_slots (fk_appointment_time_slot),
    so any appointment ever booked into one of these slots — including
    CANCELLED ones — would make the bulk child delete fail with a
    23503 violation (and surface as a 500). Before deleting, detach
    those appointments by nulling appointments.time_slot_id; the rows
    keep appointment_date/appointment_time, so booking history survives.
    """
    child_rows = (
        execute_with_retry(
            supabase
            .table("time_slots")
            .select("slot_id")
            .eq("schedule_id", schedule_id)
        ).data
        or []
    )

    if child_rows:

        execute_with_retry(
            supabase
            .table("appointments")
            .update({"time_slot_id": None})
            .in_(
                "time_slot_id",
                [row["slot_id"] for row in child_rows]
            )
        )

    execute_with_retry(
        supabase
        .table("time_slots")
        .delete()
        .eq("schedule_id", schedule_id)
    )


def materialize_time_slots(schedule_row):
    """
    Regenerate the time_slots CHILDREN of a clinic_schedules row.

    This fixes the reported bug where POST/PUT /clinic-schedule wrote
    a parent row with zero time_slots children, so
    GET /appointments/slots?date=... resolved that override as
    applicable and returned [] (admin adjusts schedule -> student
    slots disappear).

    Semantics:
      - ALWAYS deletes the row's existing time_slots children first so
        stale slots (old hours, old capacity) never linger.
      - If the row is enabled, generates fresh children from the row's
        work_start -> work_end using the shared block math (same as
        GET /clinic-schedule/preview), one time_slot per block with
        max_capacity from clinic_appointment_settings.
      - If the row is disabled (clinic closed), no children are
        created — matching the preview/closed-day behaviour.

    Returns the number of children created.
    """

    schedule_id = schedule_row.get("schedule_id")

    # Clear stale children first — even for disabled rows, so a
    # re-enabled/re-hours override never leaves orphaned slots behind.
    delete_time_slot_children(schedule_id)

    if schedule_row.get("is_enabled") is False:
        return 0

    config = resolve_day_config(schedule_row)

    if not config:
        return 0

    blocks = generate_time_blocks(config)

    if not blocks:
        return 0

    payload = [
        {
            "schedule_id": schedule_id,
            "slot_start": block["start"],
            "slot_end": block["end"],
            "max_capacity": block["capacity"]
        }
        for block in blocks
    ]

    response = execute_with_retry(
        supabase
        .table("time_slots")
        .insert(payload)
    )

    return len(response.data or [])


# ============================================================
# GET CLINIC SETTINGS
#
# GET /clinic-settings
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-settings",
    methods=["GET"]
)
@require_auth
@handle_errors("Get settings error")
def get_clinic_settings():

    settings = get_default_settings()

    if not settings:

        return jsonify({
            "success": False,
            "error": "Clinic settings not found"
        }), 404

    return jsonify({
        "success": True,
        "settings": settings
    })


# ============================================================
# UPDATE CLINIC SETTINGS
#
# PUT /clinic-settings
#
# Body (any subset of):
# {
#     "slot_interval_minutes": 30,
#     "max_students_per_slot": 10,
#     "work_start": "08:00",
#     "work_end": "17:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "updated_by_admin_id": 1
# }
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-settings",
    methods=["PUT"]
)
@require_admin
@handle_errors("Update settings error")
def update_clinic_settings():

    data = request.get_json()

    if not data:

        return jsonify({
            "success": False,
            "error": "Request body is required"
        }), 400

    existing = get_default_settings()

    if not existing:

        return jsonify({
            "success": False,
            "error": "Clinic settings not found"
        }), 404

    allowed_fields = [
        "slot_interval_minutes",
        "max_students_per_slot",
        "work_start",
        "work_end",
        "break_start",
        "break_end",
        "updated_by_admin_id"
    ]

    update_data = {
        field: data[field]
        for field in allowed_fields
        if field in data
    }

    if not update_data:

        return jsonify({
            "success": False,
            "error": "No valid fields provided to update"
        }), 400

    response = execute_with_retry(
        supabase
        .table(SETTINGS_TABLE)
        .update(update_data)
        .eq("setting_id", existing["setting_id"])
    )

    return jsonify({
        "success": True,
        "message": "Clinic settings updated",
        "settings": response.data[0] if response.data else None
    })


# ============================================================
# GET CALENDAR (LIST SCHEDULE OVERRIDES)
#
# GET /clinic-schedule
#
# Optional:
# GET /clinic-schedule?start=2026-08-01&end=2026-08-31
# GET /clinic-schedule?reason_id=<id>   (null/omitted = general)
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule",
    methods=["GET"]
)
@require_auth
@handle_errors("Get schedule error")
def get_clinic_schedule():

    start_date = request.args.get("start")
    end_date = request.args.get("end")

    # Admin schedule filter: omitted/null -> legacy general schedules;
    # any known reason id -> ONLY that reason's schedule rows. This is
    # intentionally literal so the Clinic Schedule panel can configure
    # every reason. Student availability still uses resolve_reason_scope().
    try:
        reason_scope = resolve_schedule_admin_scope(request.args.get("reason_id"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid reason_id"
        }), 400

    query = (
        supabase
        .table(SCHEDULE_TABLE)
        .select("*")
    )

    if start_date:
        query = query.gte("working_date", start_date)

    if end_date:
        query = query.lte("working_date", end_date)

    response = execute_with_retry(
        query
        .order("working_date", desc=False)
    )

    # Scope in Python so this read still works when the additive reason_id
    # column has not been applied to clinic_schedules yet.
    schedule = [
        row for row in (response.data or [])
        if schedule_row_matches_reason_scope(row, reason_scope)
    ]

    return jsonify({
        "success": True,
        "count": len(schedule),
        "schedule": schedule
    })


# ============================================================
# GET SINGLE SCHEDULE ENTRY (BY DATE)
#
# GET /clinic-schedule/<date>
#
# Example: GET /clinic-schedule/2026-08-17
# Optional: GET /clinic-schedule/2026-08-17?reason_id=<id>
#           (null/omitted = general schedule for that date)
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/<working_date>",
    methods=["GET"]
)
@require_auth
@handle_errors("Get schedule by date error")
def get_clinic_schedule_by_date(working_date):

    try:
        reason_scope = resolve_schedule_admin_scope(request.args.get("reason_id"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid reason_id"
        }), 400

    schedule = get_schedule_for_date(working_date, reason_id=reason_scope)

    if not schedule:

        return jsonify({
            "success": False,
            "error": "No schedule override found for this date"
        }), 404

    return jsonify({
        "success": True,
        "schedule": schedule
    })


# ============================================================
# CREATE A SCHEDULE OVERRIDE (CALENDAR ENTRY)
#
# POST /clinic-schedule
#
# Body:
# {
#     "working_date": "2026-12-25",
#     "work_start": "08:00",
#     "work_end": "17:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "is_enabled": false,
#     "closure_reason": "Christmas Day - Clinic Closed",
#     "reason_id": 3            // optional; null/omitted = general
# }
#
# Use is_enabled: false + closure_reason to mark the clinic closed
# for that date (holiday, event, etc).
#
# reason_id scopes BOTH the duplicate collapse and the created row:
# rows for different reasons never collapse into each other, and a
# reason-scoped schedule never collapses into the general one for the
# same date.
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule",
    methods=["POST"]
)
@require_admin
@handle_errors("Create schedule error")
def create_clinic_schedule():

    data = request.get_json()

    if not data:

        return jsonify({
            "success": False,
            "error": "Request body is required"
        }), 400

    working_date = data.get("working_date")
    slot_start = data.get("slot_start")
    slot_end = data.get("slot_end")

    missing = [
        field
        for field, value in [
            ("working_date", working_date),
            ("slot_start", slot_start),
            ("slot_end", slot_end)
        ]
        if not value
    ]

    if missing:

        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing)}"
        }), 400

    # Admin schedule scope (null/omitted = general). Any known reason id
    # is stored literally; malformed/unknown reason_id -> 400.
    try:
        reason_scope = resolve_schedule_admin_scope(data.get("reason_id"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid reason_id"
        }), 400

    schedule_data = {
        "working_date": working_date,
        "work_start": slot_start,
        "work_end": slot_end,
        "break_start": data.get("break_start"),
        "break_end": data.get("break_end"),
        "is_enabled": data.get("is_enabled", True),
        "closure_reason": data.get("closure_reason"),
        "reason_id": reason_scope
    }

    # ----------------------------------------------------
    # UPSERT within the SAME reason scope: if clinic_schedule
    # rows already exist for this date AND scope, UPDATE the
    # oldest and COLLAPSE any duplicates (legacy saves stacked
    # multiple childless overrides per date; resolution then
    # picked a childless one and students saw zero slots).
    # Children of removed duplicates are purged too. Rows from
    # the OTHER scope (general vs dedicated) are never touched.
    # ----------------------------------------------------

    try:
        existing_query = (
            supabase
            .table(SCHEDULE_TABLE)
            .select("schedule_id")
            .eq("working_date", working_date)
            .order("schedule_id", desc=False)
        )

        if reason_scope is None:
            existing_query = existing_query.is_("reason_id", None)
        else:
            existing_query = existing_query.eq("reason_id", reason_scope)

        existing_rows = (
            execute_with_retry(existing_query).data
            or []
        )

        if existing_rows:

            target = existing_rows[0]

            response = execute_with_retry(
                supabase
                .table(SCHEDULE_TABLE)
                .update(schedule_data)
                .eq("schedule_id", target["schedule_id"])
            )

            for duplicate in existing_rows[1:]:
                delete_time_slot_children(duplicate["schedule_id"])

                execute_with_retry(
                    supabase.table(SCHEDULE_TABLE).delete().eq(
                        "schedule_id", duplicate["schedule_id"]
                    )
                )

        else:
            response = execute_with_retry(
                supabase
                .table(SCHEDULE_TABLE)
                .insert(schedule_data)
            )
    except Exception as e:
        if _is_missing_reason_scope_column_error(e):
            return _missing_schedule_migration_response()
        raise

    if not response.data:

        return jsonify({
            "success": False,
            "error": "Failed to create schedule entry"
        }), 500

    schedule_row = response.data[0]

    # Materialize the time_slot children so students actually see
    # bookable slots for this date. Deletes stale children first,
    # then regenerates when the row is enabled (no-op children-wise
    # for disabled/closed days).
    materialize_time_slots(schedule_row)

    return jsonify({
        "success": True,
        "message": "Schedule entry created",
        "schedule": schedule_row
    }), 201


# ============================================================
# UPDATE A SCHEDULE OVERRIDE
#
# PUT /clinic-schedule/id/<schedule_id>
#
# Body (any subset of):
# {
#     "work_start": "09:00",
#     "work_end": "16:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "is_enabled": true,
#     "closure_reason": null,
#     "reason_id": 3          // optional scope guard; null/omitted = general
# }
#
# The optional reason_id scopes WHICH row may be updated: omitted/null
# may only update general schedules (reason_id IS NULL); a supplied
# reason may only update that reason's schedules. Editing a schedule
# therefore never crosses scopes (a stale general-panel edit cannot
# overwrite a reason-specific row and vice versa).
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/id/<int:schedule_id>",
    methods=["PUT"]
)
@require_admin
@handle_errors("Update schedule error")
def update_clinic_schedule(schedule_id):

    data = request.get_json()

    if not data:

        return jsonify({
            "success": False,
            "error": "Request body is required"
        }), 400

    try:
        reason_scope = resolve_schedule_admin_scope(data.get("reason_id"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid reason_id"
        }), 400

    allowed_fields = [
        "working_date",
        "work_start",
        "work_end",
        "break_start",
        "break_end",
        "is_enabled",
        "closure_reason"
    ]

    update_data = {
        field: data[field]
        for field in allowed_fields
        if field in data
    }

    if not update_data:

        return jsonify({
            "success": False,
            "error": "No valid fields provided to update"
        }), 400

    try:
        update_query = (
            supabase
            .table(SCHEDULE_TABLE)
            .update(update_data)
            .eq("schedule_id", schedule_id)
        )

        # Scope guard: only rows in the supplied (or default general)
        # reason scope are updatable; a mismatch yields no matched row
        # and surfaces as the existing 404 below.
        if reason_scope is None:
            update_query = update_query.is_("reason_id", None)
        else:
            update_query = update_query.eq("reason_id", reason_scope)

        response = execute_with_retry(update_query)
    except Exception as e:
        if _is_missing_reason_scope_column_error(e):
            return _missing_schedule_migration_response()
        raise

    if not response.data:

        return jsonify({
            "success": False,
            "error": "Schedule entry not found"
        }), 404

    schedule_row = response.data[0]

    # Keep bookable slots in sync with the edited hours/enabled state.
    # Without this, an override can report new times while students still
    # see the old time_slot children (or none at all).
    materialize_time_slots(schedule_row)

    return jsonify({
        "success": True,
        "message": "Schedule entry updated",
        "schedule": schedule_row
    })


# ============================================================
# DELETE A SCHEDULE OVERRIDE
#
# DELETE /clinic-schedule/id/<schedule_id>
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/id/<int:schedule_id>",
    methods=["DELETE"]
)
@require_admin
@handle_errors("Delete schedule error")
def delete_clinic_schedule(schedule_id):

    response = execute_with_retry(
        supabase
        .table(SCHEDULE_TABLE)
        .delete()
        .eq("schedule_id", schedule_id)
    )

    if not response.data:

        return jsonify({
            "success": False,
            "error": "Schedule entry not found"
        }), 404

    return jsonify({
        "success": True,
        "message": "Schedule entry deleted"
    })


# ============================================================
# TIME-BLOCK PREVIEW LIST
#
# GET /clinic-schedule/preview?date=2026-08-17
# GET /clinic-schedule/preview?date=2026-08-17&reason_id=3
#
# Generates the actual list of time blocks for a given date,
# using that date's override (clinic_schedules) if one exists,
# otherwise falling back to the global default settings.
#
# reason_id scopes which override is used (null/omitted = the
# legacy general schedule). For a dedicated reason with NO
# configured schedule the preview returns empty blocks — it never
# falls back to the general schedule or the default availability.
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/preview",
    methods=["GET"]
)
@require_auth
@handle_errors("Preview error")
def preview_time_blocks():

    requested_date = request.args.get("date")

    if not requested_date:

        return jsonify({
            "success": False,
            "error": "date parameter is required"
        }), 400

    try:
        reason_scope = resolve_reason_scope(request.args.get("reason_id"))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid reason_id"
        }), 400

    override = get_schedule_for_date(requested_date, reason_id=reason_scope)

    # ----------------------------------------------------
    # If clinic is explicitly disabled for this date
    # ----------------------------------------------------

    if override and override.get("is_enabled") is False:

        return jsonify({
            "success": True,
            "date": requested_date,
            "is_enabled": False,
            "reason": override.get("closure_reason"),
            "blocks": []
        })

    # ----------------------------------------------------
    # Dedicated reason with no configured schedule: empty
    # preview — no fallback to the general schedule or the
    # default settings (availability must be configured per
    # reason first).
    # ----------------------------------------------------

    if reason_scope is not None and not override:

        return jsonify({
            "success": True,
            "date": requested_date,
            "is_enabled": True,
            "reason_id": reason_scope,
            "blocks": []
        })

    # ----------------------------------------------------
    # Determine which config to use: override or default
    # ----------------------------------------------------

    if override:

        work_start = override.get("work_start")
        work_end = override.get("work_end")
        break_start = override.get("break_start")
        break_end = override.get("break_end")
        settings = get_default_settings()
        slot_interval = int(
            (settings or {}).get(
                "slot_interval_minutes", DEFAULT_SLOT_INTERVAL_MINUTES
            )
        )
        max_students = int(
            (settings or {}).get(
                "max_students_per_slot", DEFAULT_MAX_STUDENTS_PER_SLOT
            )
        )

    else:

        settings = get_default_settings()

        if not settings:

            return jsonify({
                "success": False,
                "error": "Clinic settings not found"
            }), 404

        work_start = settings.get("work_start")
        work_end = settings.get("work_end")
        break_start = settings.get("break_start")
        break_end = settings.get("break_end")
        slot_interval = int(
            settings.get(
                "slot_interval_minutes", DEFAULT_SLOT_INTERVAL_MINUTES
            )
        )
        max_students = int(
            settings.get(
                "max_students_per_slot", DEFAULT_MAX_STUDENTS_PER_SLOT
            )
        )

    # ----------------------------------------------------
    # Convert times
    # ----------------------------------------------------

    start = datetime.strptime(
        normalize_time(work_start),
        "%H:%M"
    )

    end = datetime.strptime(
        normalize_time(work_end),
        "%H:%M"
    )

    break_start_dt = None
    break_end_dt = None

    if break_start and break_end:

        break_start_dt = datetime.strptime(
            normalize_time(break_start),
            "%H:%M"
        )

        break_end_dt = datetime.strptime(
            normalize_time(break_end),
            "%H:%M"
        )

    # ----------------------------------------------------
    # Generate time blocks using the single canonical function
    # ----------------------------------------------------

    config = {
        "work_start": work_start,
        "work_end": work_end,
        "break_start": break_start,
        "break_end": break_end,
        "slot_interval": slot_interval,
        "max_students": max_students,
    }

    blocks = generate_time_blocks(config)

    return jsonify({
        "success": True,
        "date": requested_date,
        "is_enabled": True,
        "slot_interval": slot_interval,
        "capacity": max_students,
        "blocks": blocks
    })