from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta

from database import supabase
from routers.auth_guard import require_auth, require_admin
from routers.helpers import execute_with_retry


clinic_schedule_bp = Blueprint("clinic_schedule", __name__)


SETTINGS_TABLE = "clinic_appointment_settings"
SCHEDULE_TABLE = "clinic_schedules"


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


def get_schedule_for_date(working_date):
    """
    Fetch a clinic_schedule override row for a specific date,
    if one exists.
    """
    response = execute_with_retry(
        supabase
        .table(SCHEDULE_TABLE)
        .select("*")
        .eq("working_date", working_date)
        .limit(1)
    )

    rows = response.data or []

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
            (settings or {}).get("slot_interval_minutes", 30)
        )
    except (TypeError, ValueError):
        slot_interval = 30

    if slot_interval <= 0:
        slot_interval = 30

    try:
        max_students = int(
            (settings or {}).get("max_students_per_slot", 10)
        )
    except (TypeError, ValueError):
        max_students = 10

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
def get_clinic_settings():

    try:

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

    except Exception as e:

        print("Get settings error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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
def update_clinic_settings():

    try:

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

    except Exception as e:

        print("Update settings error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET CALENDAR (LIST SCHEDULE OVERRIDES)
#
# GET /clinic-schedule
#
# Optional:
# GET /clinic-schedule?start=2026-08-01&end=2026-08-31
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule",
    methods=["GET"]
)
@require_auth
def get_clinic_schedule():

    try:

        start_date = request.args.get("start")
        end_date = request.args.get("end")

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

        schedule = response.data or []

        return jsonify({
            "success": True,
            "count": len(schedule),
            "schedule": schedule
        })

    except Exception as e:

        print("Get schedule error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET SINGLE SCHEDULE ENTRY (BY DATE)
#
# GET /clinic-schedule/<date>
#
# Example: GET /clinic-schedule/2026-08-17
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/<working_date>",
    methods=["GET"]
)
@require_auth
def get_clinic_schedule_by_date(working_date):

    try:

        schedule = get_schedule_for_date(working_date)

        if not schedule:

            return jsonify({
                "success": False,
                "error": "No schedule override found for this date"
            }), 404

        return jsonify({
            "success": True,
            "schedule": schedule
        })

    except Exception as e:

        print("Get schedule by date error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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
#     "closure_reason": "Christmas Day - Clinic Closed"
# }
#
# Use is_enabled: false + closure_reason to mark the clinic closed
# for that date (holiday, event, etc).
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule",
    methods=["POST"]
)
@require_admin
def create_clinic_schedule():

    try:

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

        schedule_data = {
            "working_date": working_date,
            "work_start": slot_start,
            "work_end": slot_end,
            "break_start": data.get("break_start"),
            "break_end": data.get("break_end"),
            "is_enabled": data.get("is_enabled", True),
            "closure_reason": data.get("closure_reason")
        }

        # ----------------------------------------------------
        # UPSERT by working_date: if clinic_schedule rows already
        # exist for this date, UPDATE the oldest and COLLAPSE any
        # duplicates (legacy saves stacked multiple childless
        # overrides per date; resolution then picked a childless
        # one and students saw zero slots). Children of removed
        # duplicates are purged too.
        # ----------------------------------------------------

        existing_rows = (
            execute_with_retry(
                supabase
                .table(SCHEDULE_TABLE)
                .select("schedule_id")
                .eq("working_date", working_date)
                .order("schedule_id", desc=False)
            ).data
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

    except Exception as e:

        print("Create schedule error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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
#     "closure_reason": null
# }
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/id/<int:schedule_id>",
    methods=["PUT"]
)
@require_admin
def update_clinic_schedule(schedule_id):

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "success": False,
                "error": "Request body is required"
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

        response = execute_with_retry(
            supabase
            .table(SCHEDULE_TABLE)
            .update(update_data)
            .eq("schedule_id", schedule_id)
        )

        if not response.data:

            return jsonify({
                "success": False,
                "error": "Schedule entry not found"
            }), 404

        return jsonify({
            "success": True,
            "message": "Schedule entry updated",
            "schedule": response.data[0]
        })

    except Exception as e:

        print("Update schedule error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


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
def delete_clinic_schedule(schedule_id):

    try:

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

    except Exception as e:

        print("Delete schedule error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# TIME-BLOCK PREVIEW LIST
#
# GET /clinic-schedule/preview?date=2026-08-17
#
# Generates the actual list of time blocks for a given date,
# using that date's override (clinic_schedules) if one exists,
# otherwise falling back to the global default settings.
# ============================================================

@clinic_schedule_bp.route(
    "/clinic-schedule/preview",
    methods=["GET"]
)
@require_auth
def preview_time_blocks():

    try:

        requested_date = request.args.get("date")

        if not requested_date:

            return jsonify({
                "success": False,
                "error": "date parameter is required"
            }), 400

        override = get_schedule_for_date(requested_date)

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
        # Determine which config to use: override or default
        # ----------------------------------------------------

        if override:

            work_start = override.get("work_start")
            work_end = override.get("work_end")
            break_start = override.get("break_start")
            break_end = override.get("break_end")
            settings = get_default_settings()
            slot_interval = int(
                (settings or {}).get("slot_interval_minutes", 30)
            )
            max_students = int(
                (settings or {}).get("max_students_per_slot", 10)
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
            slot_interval = int(settings.get("slot_interval_minutes", 30))
            max_students = int(
                settings.get("max_students_per_slot", 10)
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

    except Exception as e:

        print("Preview error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500