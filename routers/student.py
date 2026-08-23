<<<<<<< HEAD
from fastapi import APIRouter, HTTPException
=======
from flask import Blueprint, jsonify, request

>>>>>>> 696e8bd9c0008e77145c0f8b78ece78e35dafe9f
from database import supabase

router = APIRouter()

# ============================================================
# GET STUDENTS
#
# GET /students
#
# Optional:
# GET /students?search=ramos&page=1&page_size=50
#
# Reads from the `student_masterlist` view — the same flattened
# personal_information + name + department + course source the
# masterlist module uses — instead of the raw `student` table,
# so every consumer sees consistent joined fields.
# ============================================================

@router.get("/students")
def get_students():
    try:
        search = request.args.get("search")
        page = request.args.get("page", default=1, type=int)
        page_size = request.args.get(
            "page_size", default=100, type=int
        )
        page_size = max(1, min(page_size, 500))

        query = (
            supabase
            .table("student_masterlist")
            .select("*", count="exact")
        )

        if search:
            like = f"%{search}%"
            query = query.or_(
                f"last_name.ilike.{like},"
                f"first_name.ilike.{like},"
                f"student_id.ilike.{like},"
                f"course_name.ilike.{like}"
            )

        start = (page - 1) * page_size
        end = start + page_size - 1

        response = (
            query
            .order("last_name", desc=False)
            .range(start, end)
            .execute()
        )

        data = response.data or []

        return {
            "success": True,
            "count": len(data),
<<<<<<< HEAD
            "data": data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
=======
            "total": response.count,
            "page": page,
            "page_size": page_size,
            "students": data
        })

    except Exception as e:

        print("List students error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
>>>>>>> 696e8bd9c0008e77145c0f8b78ece78e35dafe9f


# ============================================================
# GET STUDENT
#
# GET /students/<student_id>
#
# Uses a direct indexed .eq() lookup via .maybe_single()
# instead of pulling the whole table and scanning it in
# Python — O(1) at the database rather than O(n).
# ============================================================

@router.get("/students/{student_id}")
def get_student(student_id):

    try:
        response = (
            supabase
            .table("student_masterlist")
            .select("*")
            .eq("student_id", student_id)
            .maybe_single()
            .execute()
        )

        if not response.data:

<<<<<<< HEAD
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
=======
            return jsonify({
                "success": False,
                "error": "Student not found"
            }), 404
>>>>>>> 696e8bd9c0008e77145c0f8b78ece78e35dafe9f

        return {
            "success": True,
<<<<<<< HEAD
            "student": student
        }

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))
=======
            "student": response.data
        })

    except Exception as e:

        print("Get student error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
>>>>>>> 696e8bd9c0008e77145c0f8b78ece78e35dafe9f
