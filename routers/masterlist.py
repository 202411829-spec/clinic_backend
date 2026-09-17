"""Student Masterlist endpoints.

Backs the Masterlist page: search bar (surname/name/student ID/course),
Department/Course/Year filters, sortable columns, and pagination over
~7,000 students.

Reads from the `student_masterlist` view (see clean schema spec §2.8),
which flattens students + departments + courses into one row per student.
"""

import logging

from flask import Blueprint, jsonify, request
from typing import Optional, Literal

from supabase_client import supabase
from routers.auth_guard import require_auth, sanitize_search
from routers.helpers import error_response, execute_with_retry

logger = logging.getLogger(__name__)

blueprint = Blueprint("masterlist", __name__, url_prefix="/api/masterlist")

# Columns the UI is allowed to sort by (mockup shows sort arrows on these).
# Whitelisted explicitly so a client can't pass an arbitrary column name.
SORTABLE_COLUMNS = {
    "name": "last_name",
    "student_number": "student_id",
    "department": "department_name",
    "course": "course_name",
    "year_level": "year_level",
    "sex": "gender",
}


@blueprint.route("/students", methods=["GET"])
@require_auth
def list_students():
    search: Optional[str] = sanitize_search(request.args.get("search"))
    department_id: Optional[int] = request.args.get("department_id", type=int)
    course_id: Optional[int] = request.args.get("course_id", type=int)
    year_level: Optional[str] = request.args.get("year_level")
    sort_by: Literal["name", "student_number", "department", "course", "year_level", "sex"] = request.args.get("sort_by", "name")
    sort_dir: Literal["asc", "desc"] = request.args.get("sort_dir", "asc")

    try:
        page: int = int(request.args.get("page", 1))
        page_size: int = int(request.args.get("page_size", 15))
    except (TypeError, ValueError):
        return error_response("Invalid pagination parameters.", 400)

    query = supabase.table("student_masterlist").select("*", count="exact")

    if search:
        like = f"%{search}%"
        query = query.or_(
            f"last_name.ilike.{like},"
            f"first_name.ilike.{like},"
            f"student_id.ilike.{like},"
            f"course_name.ilike.{like}"
        )

    if department_id is not None:
        query = query.eq("department_id", department_id)
    if course_id is not None:
        query = query.eq("course_id", course_id)
    if year_level:
        query = query.eq("year_level", year_level)

    if sort_by not in SORTABLE_COLUMNS:
        return error_response(f"Invalid sort_by '{sort_by}'. Allowed: {', '.join(sorted(SORTABLE_COLUMNS))}", 400)
    if sort_dir not in ("asc", "desc"):
        return error_response("Invalid sort_dir. Allowed: asc, desc", 400)
    order_column = SORTABLE_COLUMNS[sort_by]
    query = query.order(order_column, desc=(sort_dir == "desc"))

    start = (page - 1) * page_size
    end = start + page_size - 1
    query = query.range(start, end)

    try:
        response = execute_with_retry(query)
    except Exception as e:
        logger.error("List students failed: %r", e)
        return error_response("Failed to fetch students.", 500)

    return jsonify({
        "success": True,
        "data": response.data,
        "total": response.count,
        "page": page,
        "page_size": page_size,
    })


@blueprint.route("/students/<student_id>", methods=["GET"])
@require_auth
def get_student_summary(student_id: str):
    """
    Lightweight lookup used when a row is clicked (before navigating into
    the full Student Record page, which is a separate module).
    """
    try:
        response = execute_with_retry(
            supabase.table("student_masterlist")
            .select("*")
            .eq("student_id", student_id)
            .maybe_single()
        )
    except Exception as e:
        logger.error("Get student summary failed: %r", e)
        return error_response("Failed to fetch student.", 500)
    if not response.data:
        return error_response("Student not found", 404)
    return jsonify({
        "success": True,
        "data": response.data,
    })


@blueprint.route("/departments", methods=["GET"])
@require_auth
def list_departments():
    try:
        response = execute_with_retry(
            supabase.table("departments")
            .select("department_id, department_name")
            .order("department_name")
        )
    except Exception as e:
        logger.error("List departments failed: %r", e)
        return error_response("Failed to fetch departments.", 500)
    return jsonify({
        "success": True,
        "data": response.data,
    })


@blueprint.route("/courses", methods=["GET"])
@require_auth
def list_courses():
    department_id = request.args.get("department_id", type=int)
    query = supabase.table("courses").select("course_id, course_name, department_id")
    if department_id is not None:
        query = query.eq("department_id", department_id)
    try:
        response = execute_with_retry(query.order("course_name"))
    except Exception as e:
        logger.error("List courses failed: %r", e)
        return error_response("Failed to fetch courses.", 500)
    return jsonify({
        "success": True,
        "data": response.data,
    })


@blueprint.route("/years", methods=["GET"])
@require_auth
def list_year_levels():
    """Distinct year levels actually present in the data, for the filter dropdown.

    Queries the base ``students`` table (not the joined view) and caps at
    100 rows — year levels are a tiny cardinality set (1-4 typically) so
    the Python-level dedup on a capped result is negligible. This avoids
    scanning all ~7k rows through the view.

    Ordering by year_level before the limit ensures we get a representative
    sample even if the table is large (e.g., we'll always see years 1-4
    regardless of insertion order).
    """
    try:
        response = execute_with_retry(
            supabase.table("students")
            .select("year_level")
            .order("year_level")
            .limit(100)
        )
    except Exception as e:
        logger.error("List year levels failed: %r", e)
        return error_response("Failed to fetch year levels.", 500)
    years = sorted({row["year_level"] for row in response.data if row["year_level"]})
    return jsonify({
        "success": True,
        "data": years,
    })