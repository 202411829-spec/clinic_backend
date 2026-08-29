"""Reports endpoint.

Backs the Reports page: totals + breakdowns by status, reason, department,
complaint, sex, and age for a given date.

Reads from the `report_appointment_rows` view (clean schema spec §2.8).
`current_status` is the four-value appointment-status enum
(pending/completed/no_show/cancelled) sourced from
`appointment_status_history.new_status` — values are constrained, not
free-text. `visit_reason` comes from `appointment_reasons.description`
(canned reasons, not free-text categories). Every breakdown is computed
generically from whatever distinct values actually exist for the given
date.

Performance sprint: all counting/grouping happens in SQL. Each breakdown
is a PostgREST grouped aggregate (`select=<field>,count()`), which GROUP
BYs the view in PostgreSQL — the view already does the join +
latest-status/latest-complaint laterals, and we count on top of that
instead of shipping every matching row to Python. `total_students` is the
number of distinct `student_id` groups (GROUP BY dedups a student with
multiple visits). Percentages are still derived in Python from the grouped
counts so the response shape and rounding are identical to the old
full-fetch behaviour.
"""

from flask import Blueprint, jsonify, request
from datetime import date as date_type
from typing import Optional

from supabase_client import supabase
from routers.auth_guard import require_auth
from routers.helpers import execute_with_retry

blueprint = Blueprint("reports", __name__, url_prefix="/api/reports")


def _breakdown(rows: list[dict], field: str, missing_label: str, total: int) -> list[dict]:
    """Shape already-GROUP-BY'd count rows into label/count/percent buckets.

    `rows` comes straight from PostgREST's `select=<field>,count()`, so the
    aggregation is done in SQL; this only relabels NULL groups, sums up any
    groups that map to the same final label (e.g. the `''` empty-string
    bucket and the NULL bucket both land on `missing_label`, which would
    otherwise produce duplicate rows), sorts by descending count, and
    derives the percent (count/total*100, 1 dp) — keeping the exact shape
    the frontend consumes.
    """
    merged = {}
    for row in rows:
        label = row.get(field) or missing_label
        merged[label] = merged.get(label, 0) + row["count"]
    return [
        {
            "label": label,
            "count": count,
            "percent": round((count / total) * 100, 1) if total else 0,
        }
        for label, count in sorted(merged.items(), key=lambda kv: kv[1], reverse=True)
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

    def _grouped_count(field: str) -> list[dict]:
        """Return `SELECT <field>, count(*) ... GROUP BY <field>` rows for
        the report's date (and optional department) filter."""
        query = (
            supabase.table("report_appointment_rows")
            .select(f"{field},count()")
            .eq("appointment_date", report_date.isoformat())
        )
        if department_id is not None:
            query = query.eq("department_id", department_id)
        return execute_with_retry(query).data or []

    status_rows = _grouped_count("current_status")
    reason_rows = _grouped_count("visit_reason")
    department_rows = _grouped_count("department_name")
    complaint_rows = _grouped_count("complaint")
    sex_rows = _grouped_count("gender")
    age_rows = _grouped_count("age")
    student_rows = _grouped_count("student_id")

    # Every row lands in exactly one status group (NULL included), so the
    # summed bucket counts equal the old len(rows) — the total appointments.
    total_appointments = sum(row["count"] for row in status_rows)
    # GROUP BY student_id in SQL dedups students with multiple visits.
    total_students = len(student_rows)

    return {
        "date": report_date.isoformat(),
        "department_id": department_id,
        "total_appointments": total_appointments,
        "total_students": total_students,
        "status_breakdown": _breakdown(status_rows, "current_status", "No status yet", total_appointments),
        "reason_breakdown": _breakdown(reason_rows, "visit_reason", "No reason given", total_appointments),
        "department_breakdown": _breakdown(department_rows, "department_name", "Unknown dept", total_appointments),
        "complaint_breakdown": _breakdown(complaint_rows, "complaint", "No complaint logged", total_appointments),
        "sex_breakdown": _breakdown(sex_rows, "gender", "Not set", total_appointments),
        "age_breakdown": _breakdown(age_rows, "age", "Unknown", total_appointments),
    }


@blueprint.route("/departments", methods=["GET"])
@require_auth
def list_departments_for_filter():
    """Reuses the same department list as the Masterlist filter dropdown."""
    response = execute_with_retry(
        supabase.table("departments")
        .select("department_id, department_name")
        .order("department_name")
    )
    return response.data