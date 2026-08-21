from flask import Blueprint, jsonify, request
from database import supabase

student_bp = Blueprint(
    "student",
    __name__
)

# ============================================================
# GET STUDENTS
#
# GET /students
# ============================================================

@student_bp.route(
    "/students",
    methods=["GET"]
)
def get_students():

    try:
        response = (
            supabase
            .table("student")
            .select("*")
            .execute()
        )

        data = response.data or []

        return jsonify({
            "success": True,
            "count": len(data),
            "students": data
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# GET STUDENT
#
# GET /students/<id>
# ============================================================

@student_bp.route(
    "/students/<student_id>",
    methods=["GET"]
)
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
            return jsonify({
                "success": False,
                "error": "Student not found"
            }), 404

        return jsonify({
            "success": True,
            "student": student
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500