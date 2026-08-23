from fastapi import APIRouter, HTTPException
from database import supabase

router = APIRouter()

# ============================================================
# GET STUDENTS
#
# GET /students
# ============================================================

@router.get("/students")
def get_students():
    try:
        response = (
            supabase
            .table("student")
            .select("*")
            .execute()
        )

        data = response.data or []

        return {
            "success": True,
            "count": len(data),
            "data": data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# GET STUDENT
#
# GET /students/<id>
# ============================================================

@router.get("/students/{student_id}")
def get_student(student_id):

    try:
        response = (
            supabase
            .table("student")
            .select("*")
            .execute()
        )

        students = response.data or []
        student = None

        for item in students:
            item_id = (
                item.get("student_id")
                or item.get("id")
            )
            if str(item_id) == str(student_id):
                student = item
                break

        if student is None:
            raise HTTPException(status_code=404, detail="Student not found")

        return {
            "success": True,
            "student": student
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))