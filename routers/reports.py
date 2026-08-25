"""Reports endpoint.

Backs the Reports page: totals + breakdowns by status, reason, department,
complaint, sex, and age for a given date.

IMPORTANT: status.new_status and reason.description are free-text columns
in this schema (no enum, no CHECK constraint) — whoever's building the
Appointments/Logbook module controls what strings actually get written
there. Rather than hardcode assumed category names (e.g. "Completed" /
"Medical Certificate") that might not match what's really in the DB, every
breakdown here is computed generically from whatever distinct values
actually exist for the given date. If a category comes back oddly named,
that's a signal to sync with whoever owns Appointments/Logbook on their
naming convention — not something to patch around here.
"""

from flask import Blueprint, jsonify, request
from collections import Counter
from datetime import date as date_type
from typing import Optional

from supabase_client import supabase
from routers.auth_guard import require_auth
from routers.helpers import execute_with_retry

blueprint = Blueprint("reports", __name__, url_prefix="/api/reports")


def _breakdown(rows: list[dict], field: str, missing_label: str = "Not set") -> list[dict]:
    total = len(rows)
    counts = Counter(row.get(field) or missing_label for row in rows)
    return [
        {
            "label": label,
            "count": count,
            "percent": round((count / total) * 100, 1) if total else 0,
        }
        for label, count in sorted(counts.items(), key=lambda kv: -kv[1])
    ]


@blueprint.route("/", methods=["GET"])
@require_auth
def get_report():
    date_str = request.args.get("date")
    if date_str:
        try:
            report_date = date_type.fromisoformat(date_str)
        except Exception:
            return jsonify({"error": "Invalid date format, expected YYYY-MM-DD"}), 400
    else:
        from datetime import datetime
        report_date = datetime.now().date()

    department_id: Optional[int] = request.args.get("department_id", type=int)

    query = (
        supabase.table("report_appointment_rows")
        .select("*")
        .eq("appointment_date", report_date.isoformat())
    )
    if department_id is not None:
        query = query.eq("department_id", department_id)

    rows = execute_with_retry(query).data

    total_students = len({row["student_id"] for row in rows})

    return {
        "date": report_date.isoformat(),
        "department_id": department_id,
        "total_appointments": len(rows),
        "total_students": total_students,
        "status_breakdown": _breakdown(rows, "current_status", missing_label="No status yet"),
        "reason_breakdown": _breakdown(rows, "reason", missing_label="No reason given"),
        "department_breakdown": _breakdown(rows, "department_name", missing_label="Unknown dept"),
        "complaint_breakdown": _breakdown(rows, "complaint", missing_label="No complaint logged"),
        "sex_breakdown": _breakdown(rows, "gender", missing_label="Not set"),
        "age_breakdown": _breakdown(rows, "age", missing_label="Unknown"),
    }


@blueprint.route("/departments", methods=["GET"])
@require_auth
def list_departments_for_filter():
    """Reuses the same department list as the Masterlist filter dropdown."""
    response = execute_with_retry(
        supabase.table("department")
        .select("department_id, department_name")
        .order("department_name")
    )
    return response.data