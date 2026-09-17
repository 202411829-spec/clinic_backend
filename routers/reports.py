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
returns the grouped counts as JSON in one round trip.

FAST-PATH GUARANTEE: The endpoint now requires the RPC to be present.
If the function is missing or the schema cache is stale, the endpoint
returns a 500 with a clear migration message instead of silently
falling back to a full-table-scan Python counter. This prevents the
accidental O(n) regression that occurs when the RPC is absent.

Labels are relabelled to the human defaults below, buckets that map to
the same label (empty-string and NULL, e.g.) are merged, everything is
sorted by descending count, and percents are count/total*100 rounded to
1 dp — unchanged from the pre-Sprint-2 contract.
"""

import logging

from flask import Blueprint, jsonify, request
from datetime import date as date_type
from typing import Optional

from supabase_client import supabase
from routers.auth_guard import require_auth
from routers.helpers import execute_with_retry, handle_errors
from cache import get_cache, set_cache

logger = logging.getLogger(__name__)

# The RPC function the fast path calls.  If this is missing from
# the database (migration not run / schema cache stale), the
# endpoint MUST fail fast with a clear error instead of silently
# falling back to a full-table-scan Python counter.
REPORT_BREAKDOWN_RPC = "report_breakdown"

# Cache TTLs for report breakdown results.
# Historical dates: 60s — data is immutable once the day passes, so a
#   longer TTL reduces DB round trips without risk of stale reads.
# Today's date: 30s — appointments are created/cancelled throughout the
#   day, so we refresh more often to keep counts reasonably current.
_HISTORICAL_TTL = 60
_TODAY_TTL = 30

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


def _fetch_breakdowns(report_date, department_id: Optional[int]):
    """Return grouped counts for every report bucket, via the SQL RPC.

    Calls `report_breakdown(p_report_date, p_department_id)` which does
    all the `group by` counting in PostgreSQL (one round trip). Returns
    a dict {view_column: [{<column>: value, count}, ...]}.

    Raises an exception if the RPC is unavailable (function not
    migrated / schema cache stale) — the caller MUST fail fast with
    a 500 and a clear migration message instead of silently falling
    back to a full-table-scan Python counter.
    """
    response = execute_with_retry(
        supabase.rpc(
            REPORT_BREAKDOWN_RPC,
            {
                "p_report_date": report_date.isoformat(),
                "p_department_id": department_id,
            },
        )
    )
    data = response.data
    if not isinstance(data, dict):
        raise ValueError(
            f"{REPORT_BREAKDOWN_RPC} returned unexpected shape: {type(data).__name__}"
        )
    return data


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
        report_date = date_type.today()

    department_id: Optional[int] = request.args.get("department_id", type=int)

    # Build a cache key from date + department.  Use a short TTL for
    # today (data changes as appointments come in) and a longer one for
    # historical dates (immutable once the day closes).
    _is_today = report_date == date_type.today()
    _ttl = _TODAY_TTL if _is_today else _HISTORICAL_TTL
    _cache_key = f"report:{report_date.isoformat()}:{department_id or 'all'}"

    cached = get_cache(_cache_key)
    if cached is not None:
        return cached

    try:
        breakdowns = _fetch_breakdowns(report_date, department_id)
    except Exception as exc:
        logger.error(
            "report_breakdown RPC unavailable (date=%s, dept=%s): %r",
            report_date.isoformat(), department_id, exc,
        )
        return jsonify({
            "error": (
                f"report_breakdown RPC unavailable — "
                f"run migrations in Supabase. Detail: {exc}"
            )
        }), 500

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

    result = {
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

    set_cache(_cache_key, result, _ttl)
    return result


@blueprint.route("/departments", methods=["GET"])
@require_auth
@handle_errors("List departments error")
def list_departments_for_filter():
    """Reuses the same department list as the Masterlist filter dropdown."""
    response = execute_with_retry(
        supabase.table("departments")
        .select("department_id, department_name")
        .order("department_name")
    )
    return response.data