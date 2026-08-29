"""
Authentication endpoints for student signup flow.

POST /api/auth/check-email  - validate email format + domain, check availability
POST /api/auth/send-code    - generate & store a 6-digit verification code
POST /api/auth/signup       - create Supabase auth user + students + app_accounts rows
"""

import logging
import random
import re
import time

from flask import Blueprint, jsonify, request

from database import supabase
from routers.helpers import error_response, execute_with_retry, handle_errors

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# ============================================================
# CONSTANTS
# ============================================================

ALLOWED_DOMAIN = "gordoncollege.edu.ph"
EMAIL_RE = re.compile(
    r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
)
CODE_LENGTH = 6
CODE_TTL_SECONDS = 5 * 60  # 5 minutes
MIN_PASSWORD_LENGTH = 8

# In-memory verification codes: {email: (code, created_at)}
_verification_codes: dict[str, tuple[str, float]] = {}


# ============================================================
# HELPERS
# ============================================================

def _generate_code() -> str:
    """Return a random zero-padded 6-digit code."""
    return str(random.randint(0, 10**CODE_LENGTH - 1)).zfill(CODE_LENGTH)


def _is_code_valid(email: str, code: str) -> bool:
    """Check that *code* matches the stored code for *email* and hasn't expired."""
    stored = _verification_codes.get(email)
    if stored is None:
        return False
    stored_code, created_at = stored
    if time.time() - created_at > CODE_TTL_SECONDS:
        _verification_codes.pop(email, None)
        return False
    return stored_code == code


def _purge_expired_codes() -> None:
    """Remove codes older than CODE_TTL_SECONDS (called lazily)."""
    now = time.time()
    expired = [
        email for email, (_, created_at) in _verification_codes.items()
        if now - created_at > CODE_TTL_SECONDS
    ]
    for email in expired:
        _verification_codes.pop(email, None)


def _validate_email(email: str) -> tuple[str | None, int]:
    """Validate email format and domain. Returns (error_message, status_code) or (None, 0) on success."""
    if not email:
        return "Email is required.", 400

    if not EMAIL_RE.match(email):
        return "Invalid email format.", 400

    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        return f"Only @{ALLOWED_DOMAIN} email addresses are allowed.", 400

    return None, 0


def _extract_student_id(email: str) -> str:
    """Extract the student_id (username) portion from a school email address."""
    return email.split("@")[0]


# ============================================================
# POST /api/auth/check-email
#
# Request:  { "email": "202411829@gordoncollege.edu.ph" }
# Response: { "success": true, "available": true|false, "message": "..." }
# ============================================================

@auth_bp.route("/check-email", methods=["POST"])
@handle_errors("check-email error")
def check_email():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # --- check if an app_account already exists for this email ---
    response = execute_with_retry(
        supabase
        .table("app_accounts")
        .select("account_id")
        .eq("email", email)
        .limit(1)
    )

    exists = bool(response.data)
    available = not exists

    if exists:
        message = "An account with this email already exists."
    else:
        message = "Email is available for registration."

    return jsonify({
        "success": True,
        "available": available,
        "message": message,
    }), 200


# ============================================================
# POST /api/auth/send-code
#
# Request:  { "email": "202411829@gordoncollege.edu.ph" }
# Response: { "success": true, "message": "Verification code sent" }
#
# The 6-digit code is stored in-memory and logged to console.
# ============================================================

@auth_bp.route("/send-code", methods=["POST"])
@handle_errors("send-code error")
def send_code():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # --- generate & store code ---
    _purge_expired_codes()

    code = _generate_code()
    _verification_codes[email] = (code, time.time())

    logger.info("Verification code for %s: %s", email, code)

    return jsonify({"success": True, "message": "Verification code sent"}), 200


# ============================================================
# POST /api/auth/signup
#
# Request: {
#   "email":    "202411829@gordoncollege.edu.ph",
#   "code":     "482916",
#   "password": "s3cretP@ss",
#   "confirmPassword": "s3cretP@ss"
# }
#
# Response: { "success": true, "message": "Account created successfully" }
# ============================================================

@auth_bp.route("/signup", methods=["POST"])
@handle_errors("signup error")
def signup():
    body = request.get_json(silent=True) or {}

    # --- extract & validate required fields ---
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    password = body.get("password") or ""
    confirm_password = body.get("confirmPassword") or ""

    # --- field presence checks ---
    if not email:
        return error_response("Email is required.", 400)
    if not code:
        return error_response("Verification code is required.", 400)
    if not password:
        return error_response("Password is required.", 400)
    if not confirm_password:
        return error_response("Password confirmation is required.", 400)

    # --- email validation ---
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # --- password validation ---
    if len(password) < MIN_PASSWORD_LENGTH:
        return error_response(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", 400
        )

    if password != confirm_password:
        return error_response("Passwords do not match.", 400)

    # --- verify code ---
    if not _is_code_valid(email, code):
        return error_response("Invalid or expired verification code.", 400)

    # --- idempotency: check if an app_account already exists for this email ---
    existing_account = execute_with_retry(
        supabase
        .table("app_accounts")
        .select("account_id")
        .eq("email", email)
        .limit(1)
    )

    if existing_account.data:
        return error_response("An account with this email already exists.", 409)

    # --- create Supabase auth user ---
    auth_result = supabase.auth.sign_up({"email": email, "password": password})

    if auth_result.user is None:
        error_msg = "Failed to create auth user."
        if auth_result.session is None and hasattr(auth_result, "error") and auth_result.error:
            error_msg = str(auth_result.error)
        return error_response(error_msg, 500)

    auth_user_id = auth_result.user.id
    student_id = _extract_student_id(email)

    # --- insert minimal students row (if not already present) ---
    existing_student = execute_with_retry(
        supabase
        .table("students")
        .select("student_id")
        .eq("student_id", student_id)
        .limit(1)
    )

    if not existing_student.data:
        execute_with_retry(
            supabase
            .table("students")
            .insert({
                "student_id": student_id,
                "first_name": student_id,   # placeholder until profile is completed
                "last_name": student_id,    # placeholder until profile is completed
                "email": email,
            })
        )
    else:
        # Update email on existing student row if not already set
        execute_with_retry(
            supabase
            .table("students")
            .update({"email": email})
            .eq("student_id", student_id)
        )

    # --- insert app_accounts row ---
    execute_with_retry(
        supabase
        .table("app_accounts")
        .insert({
            "auth_user_id": auth_user_id,
            "email": email,
            "account_type": "student",
            "student_id": student_id,
        })
    )

    # --- consume verification code ---
    _verification_codes.pop(email, None)

    logger.info("Signup completed for %s (auth_user_id=%s)", email, auth_user_id)

    return jsonify({"success": True, "message": "Account created successfully"}), 201
