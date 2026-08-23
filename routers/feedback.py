"""
Feedback endpoints.

Students rate their clinic visit (1-5 stars) with an optional message;
staff-visible history is scoped per student.

Requires the `feedback` table — run supabase_migrations.sql (or the
CREATE TABLE block at the bottom of this file's docstring) once in the
Supabase SQL editor before using these endpoints:

    create table if not exists feedback (
        feedback_id bigint generated always as identity primary key,
        student_id   text        not null,
        rating       int         not null check (rating between 1 and 5),
        message      text,
        created_at   timestamptz not null default now()
    );
"""

from flask import Blueprint, jsonify, request

from database import supabase
from routers.helpers import execute_with_retry
from routers.auth_guard import require_auth

feedback_bp = Blueprint("feedback", __name__)

FEEDBACK_TABLE = "feedback"


def _format_created_at(created_at):
    """'YYYY-MM-DDTHH:MM:SS+00' -> ISO date string for the UI."""
    if not created_at:
        return ""
    return str(created_at)[:10]


# ============================================================
# LIST FEEDBACK FOR A STUDENT
#
# GET /feedback/<student_id>
# ============================================================

@feedback_bp.route(
    "/feedback/<student_id>",
    methods=["GET"]
)
@require_auth
def get_feedback(student_id):

    try:

        response = execute_with_retry(
            supabase
            .table(FEEDBACK_TABLE)
            .select("*")
            .eq("student_id", student_id)
            .order("created_at", desc=True)
        )

        rows = response.data or []

        feedback = [
            {
                "id": row.get("feedback_id"),
                "rating": row.get("rating"),
                "message": row.get("message") or "",
                "date": _format_created_at(row.get("created_at")),
            }
            for row in rows
        ]

        return jsonify({
            "success": True,
            "count": len(feedback),
            "feedback": feedback
        })

    except Exception as e:

        # Most likely cause on a fresh project: the feedback table
        # hasn't been created yet. Return an empty history instead of
        # breaking the page.
        print("List feedback error:", repr(e))

        return jsonify({
            "success": True,
            "count": 0,
            "feedback": [],
            "warning": f"Feedback unavailable: {e}"
        })


# ============================================================
# SUBMIT FEEDBACK
#
# POST /feedback
#
# Body:
# {
#     "student_id": "202411829",
#     "rating": 4,
#     "message": "Nurse was very helpful."
# }
# ============================================================

@feedback_bp.route(
    "/feedback",
    methods=["POST"]
)
@require_auth
def submit_feedback():

    try:

        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "error": "Request body is required"
            }), 400

        student_id = data.get("student_id")
        rating = data.get("rating")
        message = (data.get("message") or "").strip() or None

        missing = [
            field
            for field, value in [
                ("student_id", student_id),
                ("rating", rating),
            ]
            if value in (None, "")
        ]

        if missing:
            return jsonify({
                "success": False,
                "error": f"Missing required fields: {', '.join(missing)}"
            }), 400

        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "rating must be a number between 1 and 5"
            }), 400

        if not 1 <= rating <= 5:
            return jsonify({
                "success": False,
                "error": "rating must be between 1 and 5"
            }), 400

        response = execute_with_retry(
            supabase
            .table(FEEDBACK_TABLE)
            .insert({
                "student_id": student_id,
                "rating": rating,
                "message": message,
            })
        )

        if not response.data:
            return jsonify({
                "success": False,
                "error": "Failed to save feedback"
            }), 500

        row = response.data[0]

        return jsonify({
            "success": True,
            "message": "Feedback submitted",
            "feedback": {
                "id": row.get("feedback_id"),
                "rating": row.get("rating"),
                "message": row.get("message") or "",
                "date": _format_created_at(row.get("created_at")),
            }
        }), 201

    except Exception as e:

        print("Submit feedback error:", repr(e))

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500