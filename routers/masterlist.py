"""
Student Masterlist endpoints.

Backs the Masterlist page: search bar (surname/name/student ID/course),
Department/Course/Year filters, sortable columns, and pagination over
~7,000 students.

Reads from the `student_masterlist` view (see Supabase migration
`student_masterlist_view`), which flattens personal_information +
student_name + department + course_dept into one row per student.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Literal, Optional

from supabase_client import supabase

router = APIRouter(prefix="/api/masterlist", tags=["masterlist"])

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


@router.get("/students")
def list_students(
    search: Optional[str] = Query(None, description="Matches surname, first name, student ID, or course"),
    department_id: Optional[int] = Query(None),
    course_id: Optional[int] = Query(None),
    year_level: Optional[str] = Query(None),
    sort_by: Literal["name", "student_number", "department", "course", "year_level", "sex"] = "name",
    sort_dir: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    query = supabase.table("student_masterlist").select("*", count="exact")

    if search:
        # Matches the mockup's "search by surname, name, student ID, or course"
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

    order_column = SORTABLE_COLUMNS[sort_by]
    query = query.order(order_column, desc=(sort_dir == "desc"))

    start = (page - 1) * page_size
    end = start + page_size - 1
    query = query.range(start, end)

    response = query.execute()

    return {
        "data": response.data,
        "total": response.count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/students/{student_id}")
def get_student_summary(student_id: str):
    """
    Lightweight lookup used when a row is clicked (before navigating into
    the full Student Record page, which is a separate module).
    """
    response = (
        supabase.table("student_masterlist")
        .select("*")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Student not found")
    return response.data


@router.get("/departments")
def list_departments():
    response = (
        supabase.table("department")
        .select("department_id, department_name")
        .order("department_name")
        .execute()
    )
    return response.data


@router.get("/courses")
def list_courses(department_id: Optional[int] = Query(None)):
    query = supabase.table("course_dept").select("course_id, course_name, department_id")
    if department_id is not None:
        query = query.eq("department_id", department_id)
    response = query.order("course_name").execute()
    return response.data


@router.get("/years")
def list_year_levels():
    """Distinct year levels actually present in the data, for the filter dropdown."""
    response = supabase.table("student_masterlist").select("year_level").execute()
    years = sorted({row["year_level"] for row in response.data if row["year_level"]})
    return years
