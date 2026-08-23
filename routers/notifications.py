"""
Notifications endpoints.

Derives a student's notification history from existing schema tables —
no dedicated notifications table required. Every status change recorded
in the `status` table for one of the student's appointments becomes a
notification ("Your appointment on ... is now Confirmed"), newest first.
"""

from flask import Blueprint, jsonify

from database import supabase
from routers.helpers import execute_with_retry
from routers.auth_guard import require_auth

notifications_bp = Blueprint("notifications", __name__)


def _format_changed_at(changed_at):
    """'YYYY-MM-DDTHH:MM:SS+00' -> 'MM/DD/YYYY HH:MM' (UTC as stored)."""
    if not changed_at:
        return ""
    try:
        date_part = str(changed_at)[:10]
        time_part = str(changed_at)[11:16]
        year, month, day = date_part.split("-")
        return f"{month}/{day}/{year} {time_part}"
    except Exception:
        return str(changed_at)


# ============================================================
# GET NOTIFICATIONS FOR A STUDENT
#
# GET /notifications/<student_id>
#
# Returns status-change history across all of the student's
# appointments, newest first, shaped as {id, message, time}.
# ============================================================

@notifications_bp.route(
    "/notifications/<student_id>",
    methods=["GET"]
)
@require_auth
def get_notifications(student_id):

    try:

        # Step 1: this student's appointments.
        appt_response = execute_with_retry(
            supabase
            .table("appointment")
            .select("appointment_id, appointment_date, appointment_time")
            .eq("student_id", student_id)
        )

        appointments = appt_response.data or []

        if not appointments:
            return jsonify({
                "success": True,
                "count": 0,
                "notifications": []
            })

        appointment_ids = [
            a["appointment_id"] for a in appointments
        ]

        by_id = {
            a["appointment_id"]: a for a in appointments
        }

        # Step 2: every status change on those appointments.
        status_response = execute_with_retry(
            supabase
            .table("status")
            .select("*")
            .in_("appointment_id", appointment_ids)
            .order("changed_at", desc=True)
        )

        statuses = status_response.data or []

        notifications = []

        for row in statuses:

            appt = by_id.get(row.get("appointment_id"), {})
            new_status = row.get("new_status") or "updated"
            remarks = row.get("remarks")

            date_part = str(appt.get("appointment_date") or "")[:10]

            message = (
                f"Your appointment on {date_part} "
                f"is now {new_status}."
            )

            if remarks:
                message += f" ({remarks})"

            notifications.append({
                "id": row.get("status_id"),
                "appointment_id": row.get("appointment_id"),
                "status": new_status,
                "message": message,
                "time": _format_changed_at(row.get("changed_at")),
            })

        return jsonify({
            "success": True,
            "count": len(notifications),
            "notifications": notifications
        })

    except Exception as e:

        print("Notifications error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500