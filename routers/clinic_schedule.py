from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta

from database import supabase
from routers.auth_guard import require_auth, require_admin


clinic_schedule_bp = Blueprint("clinic_schedule", __name__)


SETTINGS_TABLE = "clinic_appointment_settings"
SCHEDULE_TABLE = "clinic_schedule"


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
    response = (
        supabase
        .table(SETTINGS_TABLE)
        .select("*")
        .limit(1)
        .execute()
    )

    rows = response.data or []

    return rows[0] if rows else None


def get_schedule_for_date(working_date):
    """
    Fetch a clinic_schedule override row for a specific date,
    if one exists.
    """
    response = (
        supabase
        .table(SCHEDULE_TABLE)
        .select("*")
        .eq("working_date", working_date)
        .limit(1)
        .execute()
    )

    rows = response.data or []

    return rows[0] if rows else None


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
#     "slot_interval": 30,
#     "max_student_per_slot": 10,
#     "work_start": "08:00",
#     "work_end": "17:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "update_by": 1
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
            "slot_interval",
            "max_student_per_slot",
            "work_start",
            "work_end",
            "break_start",
            "break_end",
            "update_by"
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

        response = (
            supabase
            .table(SETTINGS_TABLE)
            .update(update_data)
            .eq("setting_id", existing["setting_id"])
            .execute()
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

        response = (
            query
            .order("working_date", desc=False)
            .execute()
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
#     "slot_start": "08:00",
#     "slot_end": "17:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "is_enabled": false,
#     "reason": "Christmas Day - Clinic Closed"
# }
#
# Use is_enabled: false + reason to mark the clinic closed
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
            "slot_start": slot_start,
            "slot_end": slot_end,
            "break_start": data.get("break_start"),
            "break_end": data.get("break_end"),
            "is_enabled": data.get("is_enabled", True),
            "reason": data.get("reason")
        }

        response = (
            supabase
            .table(SCHEDULE_TABLE)
            .insert(schedule_data)
            .execute()
        )

        if not response.data:

            return jsonify({
                "success": False,
                "error": "Failed to create schedule entry"
            }), 500

        return jsonify({
            "success": True,
            "message": "Schedule entry created",
            "schedule": response.data[0]
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
#     "slot_start": "09:00",
#     "slot_end": "16:00",
#     "break_start": "12:00",
#     "break_end": "13:00",
#     "is_enabled": true,
#     "reason": null
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
            "slot_start",
            "slot_end",
            "break_start",
            "break_end",
            "is_enabled",
            "reason"
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

        response = (
            supabase
            .table(SCHEDULE_TABLE)
            .update(update_data)
            .eq("schedule_id", schedule_id)
            .execute()
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

        response = (
            supabase
            .table(SCHEDULE_TABLE)
            .delete()
            .eq("schedule_id", schedule_id)
            .execute()
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
# using that date's override (clinic_schedule) if one exists,
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
                "reason": override.get("reason"),
                "blocks": []
            })

        # ----------------------------------------------------
        # Determine which config to use: override or default
        # ----------------------------------------------------

        if override:

            work_start = override.get("slot_start")
            work_end = override.get("slot_end")
            break_start = override.get("break_start")
            break_end = override.get("break_end")
            settings = get_default_settings()
            slot_interval = int(
                (settings or {}).get("slot_interval", 30)
            )
            max_students = int(
                (settings or {}).get("max_student_per_slot", 10)
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
            slot_interval = int(settings.get("slot_interval", 30))
            max_students = int(
                settings.get("max_student_per_slot", 10)
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
        # Generate time blocks
        # ----------------------------------------------------

        blocks = []

        current = start

        while current < end:

            block_end = current + timedelta(
                minutes=slot_interval
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
                    "capacity": max_students
                })

            current = block_end

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