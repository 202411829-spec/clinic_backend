from flask import Blueprint, jsonify
from datetime import date

from database import supabase


dashboard_bp = Blueprint("dashboard", __name__)


APPOINTMENT_TABLE = "appointment"
LOGBOOK_TABLE = "appointment_log"


def normalize_date(value):

    if value is None:
        return None

    value = str(value)

    if "T" in value:
        return value.split("T")[0]

    if " " in value:
        return value.split(" ")[0]

    return value[:10]


def get_date_value(row):

    for column in [
        "appointment_date",
        "date",
        "scheduled_date"
    ]:

        if column in row:
            return row[column]

    return None


# ============================================================
# DASHBOARD
# GET /dashboard
# ============================================================

@dashboard_bp.route("/dashboard", methods=["GET"])
def get_dashboard():

    try:

        today = date.today().isoformat()

        # ----------------------------------------------------
        # Today's appointments
        # ----------------------------------------------------

        appointments_response = (
            supabase
            .table(APPOINTMENT_TABLE)
            .select("*")
            .execute()
        )

        all_appointments = (
            appointments_response.data or []
        )

        todays_appointments = [
            appointment
            for appointment in all_appointments
            if normalize_date(
                get_date_value(appointment)
            ) == today
        ]

        # ----------------------------------------------------
        # Latest logbook
        # ----------------------------------------------------

        logbook_response = (
            supabase
            .table(LOGBOOK_TABLE)
            .select("*")
            .order(
                "created_at",
                desc=True
            )
            .limit(10)
            .execute()
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

    except Exception as e:

        print("Dashboard error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500