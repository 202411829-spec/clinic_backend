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

Aggregation is pushed into PostgreSQL via the `report_breakdown` RPC
function (migrations/2026-08-29_report_aggregate_functions.sql), which
runs `select <field>, count(*) group by <field>` for every bucket and
returns the grouped counts as JSON in one round trip. The function is
cached by PostgREST's schema cache, so if it has not been migrated yet
the RPC call fails with PGRST202 — in that case we transparently fall
back to the pre-Sprint-2 behaviour (fetch the matching view rows once
and count them in Python), so the endpoint never 500s on a missing DB
function. Either path produces the same response shape:
labels are relabelled to the human defaults below, buckets that map to
the same label (empty-string and NULL, e.g.) are merged, everything is
sorted by descending count, and percents are count/total*100 rounded to
1 dp — unchanged from the pre-Sprint-2 contract.
"""

from flask import Blueprint, jsonify, request
from collections import Counter
from datetime import date as date_type
from typing import Optional

from supabase_client import supabase
from routers.auth_guard import require_auth
from routers.helpers import execute_with_retry

blueprint = Blueprint("reports", __name__, url_prefix="/api/reports")


def _breakdown(rows: list[dict], field: str, missing_label: str, total: int) -> list[dict]:
    """Shape already-GROUP-BY'd count rows into label/count/percent buckets.

    `rows` comes from the `report_breakdown` RPC: each row is a
    {field: value, count} pair, so the aggregation is done in SQL; this
    only relabels NULL/empty groups, merges any groups that map to the
    same final label (e.g. the `''` empty-string bucket and the NULL
    bucket both land on `missing_label`, which would otherwise produce
    duplicate rows), sorts by descending count, and derives the percent
    (count/total*100, 1 dp) — keeping the exact shape the frontend
    consumes.
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


def _legacy_breakdown(rows: list[dict], field: str, missing_label: str) -> list[dict]:
    """Pre-Sprint-2 shaper: count full-fetch rows in Python.

    Used only by the fallback path (when the `report_breakdown` RPC is
    not available yet). Mirrors the original implementation exactly so
    the response is byte-for-byte identical to the pre-Sprint-2 contract.
    """
    total = len(rows)
    counts = Counter(row.get(field) or missing_label for row in rows)
    return [
        {
            "label": label,
            "count": count,
            "percent": round((count / total) * 100, 1) if total else 0,
        }
        for label, count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ]


def _fetch_breakdowns(report_date, department_id: Optional[int]):
    """Return grouped counts for every report bucket, via the SQL RPC.

    Calls `report_breakdown(p_report_date, p_department_id)` which does
    all the `group by` counting in PostgreSQL (one round trip). Returns
    a dict {view_column: [{<column>: value, count}, ...]}, or None when
    the function cannot be called — either it hasn't been migrated yet
    (PostgREST PGRST202) or the schema cache hasn't reloaded it — so
    the caller can fall back to counting in Python. The endpoint must
    never 500 just because the DB function is missing.
    """
    try:
        response = execute_with_retry(
            supabase.rpc(
                "report_breakdown",
                {
                    "p_report_date": report_date.isoformat(),
                    "p_department_id": department_id,
                },
            )
        )
        data = response.data
        return data if isinstance(data, dict) else None
    except Exception:
        return None


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

    breakdowns = _fetch_breakdowns(report_date, department_id)

    if breakdowns is not None:
        status_rows = breakdowns.get("current_status") or []
        reason_rows = breakdowns.get("visit_reason") or []
        department_rows = breakdowns.get("department_name") or []
        complaint_rows = breakdowns.get("complaint") or []
        sex_rows = breakdowns.get("gender") or []
        age_rows = breakdowns.get("age") or []
        student_rows = breakdowns.get("student_id") or []

        # Every row lands in exactly one status group (NULL included), so
        # the summed bucket counts equal the total appointments.
        total_appointments = sum(row["count"] for row in status_rows)
        # GROUP BY student_id dedups students with multiple visits.
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

    # Fallback: the report_breakdown RPC is not available (function not
    # migrated / schema cache stale). Fetch the matching view rows once
    # and count in Python — the pre-Sprint-2 behaviour, byte-for-byte.
    query = (
        supabase.table("report_appointment_rows")
        .select("*")
        .eq("appointment_date", report_date.isoformat())
    )
    if department_id is not None:
        query = query.eq("department_id", department_id)

    rows = execute_with_retry(query).data or []

    return {
        "date": report_date.isoformat(),
        "department_id": department_id,
        "total_appointments": len(rows),
        "total_students": len({row["student_id"] for row in rows}),
        "status_breakdown": _legacy_breakdown(rows, "current_status", "No status yet"),
        "reason_breakdown": _legacy_breakdown(rows, "visit_reason", "No reason given"),
        "department_breakdown": _legacy_breakdown(rows, "department_name", "Unknown dept"),
        "complaint_breakdown": _legacy_breakdown(rows, "complaint", "No complaint logged"),
        "sex_breakdown": _legacy_breakdown(rows, "gender", "Not set"),
        "age_breakdown": _legacy_breakdown(rows, "age", "Unknown"),
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