import logging

from flask import Blueprint, jsonify
from datetime import date

from database import supabase
from routers.auth_guard import require_auth
from routers.helpers import (
    execute_with_retry,
    get_latest_status_for_appointments,
    handle_errors,
)

logger = logging.getLogger(__name__)


dashboard_bp = Blueprint("dashboard", __name__)


APPOINTMENT_TABLE = "appointments"
LOGBOOK_TABLE = "visit_logs"


# ============================================================
# DASHBOARD
# GET /dashboard
# ============================================================

@dashboard_bp.route("/dashboard", methods=["GET"])
@require_auth
@handle_errors("Dashboard error")
def get_dashboard():

    today = date.today().isoformat()

    # ----------------------------------------------------
    # Today's appointments (filtered by date in DB)
    # ----------------------------------------------------

    appointments_response = execute_with_retry(
        supabase
        .table(APPOINTMENT_TABLE)
        .select("*")
        .eq("appointment_date", today)
        .order("appointment_time", desc=False)
    )

    todays_appointments = appointments_response.data or []

    # Join latest status for each appointment
    appointment_ids = [a["appointment_id"] for a in todays_appointments]
    latest_status_map = get_latest_status_for_appointments(appointment_ids)

    for appt in todays_appointments:
        status_row = latest_status_map.get(appt["appointment_id"])
        appt["current_status"] = status_row.get("new_status") if status_row else None

    # ----------------------------------------------------
    # Latest logbook
    # ----------------------------------------------------

    logbook_response = execute_with_retry(
        supabase
        .table(LOGBOOK_TABLE)
        .select("*")
        .order(
            "created_at",
            desc=True
        )
        .limit(10)
    )

    latest_logbook = (
        logbook_response.data or []
    )

    return jsonify({

        "success": True,

        "date": today,

        "latest_logbook": latest_logbook,

        "todays_appointments": todays_appointments,

        "counts": {
            "latest_logbook":
                len(latest_logbook),

            "todays_appointments":
                len(todays_appointments)
        }
    })