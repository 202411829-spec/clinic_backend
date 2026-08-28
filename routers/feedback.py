"""
Feedback endpoints.

Students rate their clinic visit (1-5 stars) with an optional message;
staff-visible history is scoped per student.

Requires the clean-schema `feedback` table (spec §2.7):

    CREATE TABLE "feedback" (
        "feedback_id"  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "student_id"   character varying(32) NOT NULL REFERENCES "students"("student_id")
                       ON UPDATE CASCADE ON DELETE CASCADE,
        "rating"       integer NOT NULL,
        "message"      text,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_feedback_rating" CHECK ("rating" BETWEEN 1 AND 5)
    );

`feedback.student_id` is a NOT NULL FK to `students(student_id)`, so the
submitter's student_id always comes from the authenticated identity
(`app_accounts` via `resolve_student_id(g.user)`) — never from a
free-form request body value, which would violate the FK.
"""

from types import SimpleNamespace

from flask import Blueprint, g, jsonify, request

from database import supabase
from routers.helpers import execute_with_retry
from routers.auth_guard import require_auth, resolve_student_id

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
#     "rating": 4,
#     "message": "Nurse was very helpful."
# }
#
# The submitter's student_id is resolved from the authenticated
# identity (g.user -> app_accounts.student_id), NOT from the body,
# because clean feedback.student_id is a NOT NULL FK to students.
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

        # Resolve the authenticated student identity (app_accounts).
        auth_user = SimpleNamespace(
            id=g.user.get("id"),
            email=g.user.get("email"),
        )
        student_id = resolve_student_id(auth_user)

        if not student_id:
            return jsonify({
                "success": False,
                "error": "Unable to verify student identity"
            }), 403

        rating = data.get("rating")
        message = (data.get("message") or "").strip() or None

        missing = [
            field
            for field, value in [
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