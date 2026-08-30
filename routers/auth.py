"""
Authentication endpoints for student signup and password reset flows.

POST /api/auth/check-email        - validate email format + domain, check availability
POST /api/auth/send-code          - generate & store a 6-digit verification code
POST /api/auth/signup             - create Supabase auth user + students + app_accounts rows

POST /api/auth/forgot/check-email - check if an account exists for password reset
POST /api/auth/forgot/send-code   - send a 6-digit code for password reset
POST /api/auth/forgot/reset       - reset password using the verification code
"""

import logging
import os
import random
import re
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import Blueprint, jsonify, request

from database import supabase
from routers.helpers import error_response, execute_with_retry, handle_errors

try:
    import resend
except ImportError:
    resend = None

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

# In-memory forgot-password codes: {email: (code, created_at)}
_forgot_codes: dict[str, tuple[str, float]] = {}

# Isolated admin signup code store: email -> {code, expires_at, send_count, window_start}
_admin_signup_codes: dict[str, dict] = {}
ADMIN_CODE_TTL_SECONDS = 5 * 60
ADMIN_SEND_LIMIT = 3
ADMIN_SEND_WINDOW_SECONDS = 15 * 60


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


def _find_auth_user_by_email(email: str):
    """
    Search Supabase auth.users for a user with the given email.

    The installed supabase-py (gotrue 2.7.4) has no get_user_by_email
    admin method, so we paginate through list_users().  For a small
    clinic system this is acceptable — it only runs on the duplicate-
    email edge case, not on every signup.

    Returns the gotrue User object if found, else None.
    """
    page = 1
    per_page = 50

    while True:
        try:
            users = supabase.auth.admin.list_users(page=page, per_page=per_page)
        except Exception as exc:
            logger.warning("list_users page %s failed: %r", page, exc)
            return None

        if not users:
            break

        for user in users:
            if (user.email or "").lower() == email.lower():
                return user

        # Fewer results than page size → we've reached the end.
        if len(users) < per_page:
            break

        page += 1

    return None


def _send_email_via_smtp(to_email: str, code: str) -> bool:
    """Send verification code email via Gmail SMTP. Returns True on success."""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not configured — skipping SMTP send")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg["Subject"] = "Your Gordon College Clinic verification code"

    html_body = (
        f"<p>Your verification code is: <strong>{code}</strong></p>"
        f"<p>This code expires in 5 minutes.</p>"
    )
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to_email, msg.as_string())
        logger.info("SMTP email sent to %s", to_email)
        return True
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP authentication failed: %r", exc)
        return False
    except Exception as exc:
        logger.warning("SMTP send failed for %s: %r", to_email, exc)
        return False


def _purge_admin_codes() -> None:
    now = time.time()
    expired = [e for e, v in _admin_signup_codes.items() if now > v["expires_at"]]
    for e in expired:
        _admin_signup_codes.pop(e, None)


def _is_admin_code_valid(email: str, code: str) -> bool:
    entry = _admin_signup_codes.get(email)
    if not entry:
        return False
    if time.time() > entry["expires_at"]:
        _admin_signup_codes.pop(email, None)
        return False
    return entry["code"] == code


def _check_admin_rate_limit(email: str) -> bool:
    """Return True if allowed, False if rate-limited. Updates counters."""
    now = time.time()
    entry = _admin_signup_codes.get(email)
    if entry and now - entry.get("window_start", now) < ADMIN_SEND_WINDOW_SECONDS:
        if entry.get("send_count", 0) >= ADMIN_SEND_LIMIT:
            return False
    return True


def _record_admin_send(email: str, code: str) -> None:
    now = time.time()
    entry = _admin_signup_codes.get(email)
    if entry and now - entry.get("window_start", now) < ADMIN_SEND_WINDOW_SECONDS:
        entry["code"] = code
        entry["expires_at"] = now + ADMIN_CODE_TTL_SECONDS
        entry["send_count"] = entry.get("send_count", 0) + 1
    else:
        _admin_signup_codes[email] = {
            "code": code,
            "expires_at": now + ADMIN_CODE_TTL_SECONDS,
            "send_count": 1,
            "window_start": now,
        }


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
        message = "An account with this email already exists. Please log in instead."
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
    logger.info("DEBUG verification code for %s: %s", email, code)

    # --- send email: try SMTP first, then fallback to Resend ---
    smtp_ok = _send_email_via_smtp(email, code)

    if not smtp_ok:
        # Fallback: try Resend if configured
        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if api_key and resend is not None:
            try:
                resend.api_key = api_key
                resend.Emails.send({
                    "from": "Clinic Appointment System <onboarding@resend.dev>",
                    "to": [email],
                    "subject": "Your Verification Code",
                    "html": (
                        f"<p>Your verification code is: <strong>{code}</strong></p>"
                        f"<p>This code expires in 5 minutes.</p>"
                    ),
                })
                logger.info("Resend email sent to %s", email)
            except Exception as exc:
                logger.warning("Resend email failed for %s: %r", email, exc)
        else:
            logger.warning(
                "No email provider available — code for %s logged only: %s",
                email, code,
            )
    else:
        logger.info("Verification code sent to %s via SMTP", email)

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
        return error_response(
            "An account with this email already exists. Please log in instead.",
            409,
        )

    # --- create Supabase auth user (admin API, auto-confirm) ---
    # Using admin.create_user with email_confirm=True bypasses
    # Supabase's built-in email confirmation flow.  We already verified
    # the email with our own 6-digit code, so the double-confirmation
    # would just block login with "Email not confirmed".
    auth_user_id = None  # will be set below

    try:
        auth_result = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        if auth_result.user is None:
            return error_response("Failed to create auth user.", 500)
        auth_user_id = auth_result.user.id
    except Exception as exc:
        exc_str = str(exc).lower()
        if "already" in exc_str or "exists" in exc_str:
            # An auth user with this email exists in Supabase.  Determine
            # whether this is a true duplicate (auth user + app_accounts
            # both present) or an orphaned auth user (app_accounts row was
            # deleted, e.g. during testing).
            existing_auth_user = _find_auth_user_by_email(email)

            if existing_auth_user is None:
                # create_user said "already exists" but we can't find the
                # auth user via list_users — actionable message regardless.
                return error_response(
                    "An account with this email already exists. "
                    "Please log in instead.",
                    409,
                )

            auth_user_id = existing_auth_user.id

            # Check whether a corresponding app_accounts row exists.
            orphan_check = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("account_id")
                .eq("email", email)
                .limit(1)
            )

            if orphan_check.data:
                # Both auth user AND app_accounts exist → true duplicate.
                return error_response(
                    "An account with this email already exists. "
                    "Please log in instead.",
                    409,
                )

            # Orphaned auth user: app_accounts row is missing, so the
            # tester deleted DB rows while the auth user remained.
            # Ensure email is confirmed, then fall through to create the
            # missing students + app_accounts rows.
            if existing_auth_user.email_confirmed_at is None:
                try:
                    supabase.auth.admin.update_user_by_id(
                        auth_user_id,
                        {"email_confirm": True},
                    )
                    logger.info(
                        "Auto-confirmed previously unconfirmed auth user "
                        "%s (%s)",
                        email, auth_user_id,
                    )
                except Exception as update_exc:
                    logger.error(
                        "Failed to auto-confirm auth user %s: %r",
                        email, update_exc,
                    )
                    return error_response(
                        "Account exists but could not be confirmed. "
                        "Please contact support.", 500,
                    )
            # Fall through to students/app_accounts creation below.
        else:
            logger.error("Admin create_user failed: %r", exc)
            return error_response(f"Failed to create auth user: {exc}", 500)

    if auth_user_id is None:
        return error_response("Failed to create auth user.", 500)
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
                "first_name": "",   # empty until user completes their profile
                "last_name": "",    # empty until user completes their profile
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


# ============================================================
# FORGOT PASSWORD FLOW
# ============================================================

def _is_forgot_code_valid(email: str, code: str) -> bool:
    """Check that *code* matches the stored forgot-password code for *email* and hasn't expired."""
    stored = _forgot_codes.get(email)
    if stored is None:
        return False
    stored_code, created_at = stored
    if time.time() - created_at > CODE_TTL_SECONDS:
        _forgot_codes.pop(email, None)
        return False
    return stored_code == code


# ============================================================
# POST /api/auth/forgot/check-email
#
# Request:  { "email": "202411829@gordoncollege.edu.ph" }
# Response: { "success": true, "exists": true|false, "message": "..." }
#
# Checks whether an account exists for the given email.
# ============================================================

@auth_bp.route("/forgot/check-email", methods=["POST"])
@handle_errors("forgot check-email error")
def forgot_check_email():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # --- check if an app_account exists for this email ---
    response = execute_with_retry(
        supabase
        .table("app_accounts")
        .select("account_id")
        .eq("email", email)
        .limit(1)
    )

    exists = bool(response.data)

    if not exists:
        return error_response(
            "No account found for this email. Please sign up.",
            404,
        )

    return jsonify({
        "success": True,
        "exists": True,
        "message": "Account found.",
    }), 200


# ============================================================
# POST /api/auth/forgot/send-code
#
# Request:  { "email": "202411829@gordoncollege.edu.ph" }
# Response: { "success": true, "message": "Verification code sent" }
#
# Generates a 6-digit code, stores it in _forgot_codes, and
# sends it via email (SMTP → Resend fallback).
# ============================================================

@auth_bp.route("/forgot/send-code", methods=["POST"])
@handle_errors("forgot send-code error")
def forgot_send_code():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # --- check account exists ---
    account_check = execute_with_retry(
        supabase
        .table("app_accounts")
        .select("account_id")
        .eq("email", email)
        .limit(1)
    )

    if not account_check.data:
        return error_response(
            "No account found for this email. Please sign up.",
            404,
        )

    # --- generate & store code ---
    code = _generate_code()
    _forgot_codes[email] = (code, time.time())
    logger.info("DEBUG forgot code for %s: %s", email, code)

    # --- send email: try SMTP first, then fallback to Resend ---
    smtp_ok = _send_email_via_smtp(email, code)

    if not smtp_ok:
        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if api_key and resend is not None:
            try:
                resend.api_key = api_key
                resend.Emails.send({
                    "from": "Clinic Appointment System <onboarding@resend.dev>",
                    "to": [email],
                    "subject": "Your Password Reset Code",
                    "html": (
                        f"<p>Your password reset code is: <strong>{code}</strong></p>"
                        f"<p>This code expires in 5 minutes.</p>"
                    ),
                })
                logger.info("Resend email sent to %s", email)
            except Exception as exc:
                logger.warning("Resend email failed for %s: %r", email, exc)
        else:
            logger.warning(
                "No email provider available — forgot code for %s logged only: %s",
                email, code,
            )
    else:
        logger.info("Forgot password code sent to %s via SMTP", email)

    return jsonify({"success": True, "message": "Verification code sent"}), 200


# ============================================================
# POST /api/auth/forgot/reset
#
# Request: {
#   "email":    "202411829@gordoncollege.edu.ph",
#   "code":     "482916",
#   "password": "s3cretP@ss",
#   "confirmPassword": "s3cretP@ss"
# }
#
# Response: { "success": true, "message": "Password reset successfully." }
# ============================================================

@auth_bp.route("/forgot/reset", methods=["POST"])
@handle_errors("forgot reset error")
def forgot_reset():
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
    if not _is_forgot_code_valid(email, code):
        return error_response("Invalid or expired verification code.", 400)

    # --- find auth user ---
    auth_user = _find_auth_user_by_email(email)
    if auth_user is None:
        return error_response("Account not found.", 404)

    # --- reset password via Supabase admin API ---
    try:
        supabase.auth.admin.update_user_by_id(
            auth_user.id,
            {"password": password},
        )
    except Exception as exc:
        logger.error("Admin update_user_by_id failed for %s: %r", email, exc)
        return error_response("Failed to reset password. Please try again.", 500)

    # --- consume forgot code ---
    _forgot_codes.pop(email, None)

    logger.info("Password reset completed for %s", email)

    return jsonify({"success": True, "message": "Password reset successfully."}), 200


# ============================================================
# ADMIN SIGNUP GATED FLOW
# ============================================================

@auth_bp.route("/admin/check-email", methods=["POST"])
@handle_errors("admin check-email error")
def admin_check_email():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active, email").eq("email", email).limit(1)
    )
    if not resp.data:
        return error_response("Not invited", 404)

    row = resp.data[0]
    # If active and has app_accounts -> already active
    acct = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
    )
    has_account = bool(acct.data)
    is_active = bool(row.get("is_active"))
    if is_active and has_account:
        return error_response("Already active", 409)

    status_label = "pending" if not is_active and not has_account else ("active" if is_active and has_account else "inactive")
    return jsonify({"success": True, "invited": True, "status": status_label}), 200


@auth_bp.route("/admin/send-code", methods=["POST"])
@handle_errors("admin send-code error")
def admin_send_code():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    err, status = _validate_email(email)
    if err:
        return error_response(err, status)

    # Re-validate allowlisted + pending
    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("email", email).limit(1)
    )
    if not resp.data:
        return error_response("Not invited", 404)
    is_active = bool(resp.data[0].get("is_active"))
    acct = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
    )
    if is_active and acct.data:
        return error_response("Already active", 409)

    _purge_admin_codes()
    if not _check_admin_rate_limit(email):
        return error_response("Too many codes sent. Please try again later.", 429)

    code = _generate_code()
    _record_admin_send(email, code)
    logger.info("DEBUG admin signup code for %s: %s", email, code)

    smtp_ok = _send_email_via_smtp(email, code)
    if not smtp_ok:
        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if api_key and resend is not None:
            try:
                resend.api_key = api_key
                resend.Emails.send({
                    "from": "Clinic Appointment System <onboarding@resend.dev>",
                    "to": [email],
                    "subject": "Your Admin Verification Code",
                    "html": f"<p>Your admin verification code is: <strong>{code}</strong></p><p>This code expires in 5 minutes.</p>",
                })
                logger.info("Resend admin code sent to %s", email)
            except Exception as exc:
                logger.warning("Resend admin code failed for %s: %r", email, exc)
        else:
            logger.warning("No email provider -- admin code for %s logged only: %s", email, code)

    return jsonify({"success": True, "message": "Code sent"}), 200


@auth_bp.route("/admin/signup", methods=["POST"])
@handle_errors("admin signup error")
def admin_signup():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    password = body.get("password") or ""
    confirm_password = body.get("confirmPassword") or ""

    if not email:
        return error_response("Email is required.", 400)
    if not code:
        return error_response("Verification code is required.", 400)
    if not password:
        return error_response("Password is required.", 400)
    if not confirm_password:
        return error_response("Password confirmation is required.", 400)

    err, status = _validate_email(email)
    if err:
        return error_response(err, status)
    if len(password) < MIN_PASSWORD_LENGTH:
        return error_response(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", 400)
    if password != confirm_password:
        return error_response("Passwords do not match.", 400)
    if not code.isdigit() or len(code) != 6:
        return error_response("Invalid or expired code", 400)

    if not _is_admin_code_valid(email, code):
        return error_response("Invalid or expired code", 400)

    # Re-validate still pending
    admin_resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("email", email).limit(1)
    )
    if not admin_resp.data:
        return error_response("Not invited", 404)
    admin_row = admin_resp.data[0]
    admin_id = admin_row["admin_id"]
    if admin_row.get("is_active"):
        # Check if already has account
        acct_check = execute_with_retry(
            supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
        )
        if acct_check.data:
            return error_response("Already active", 409)

    # Idempotency: app_accounts exists?
    existing_account = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
    )
    if existing_account.data:
        return error_response("An account with this email already exists. Please log in instead.", 409)

    # Create auth user
    auth_user_id = None
    try:
        auth_result = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        if auth_result.user is None:
            return error_response("Failed to create auth user.", 500)
        auth_user_id = auth_result.user.id
    except Exception as exc:
        exc_str = str(exc).lower()
        if "already" in exc_str or "exists" in exc_str:
            return error_response("An account with this email already exists. Please log in instead.", 409)
        logger.error("Admin create_user failed: %r", exc)
        return error_response(f"Failed to create auth user: {exc}", 500)

    if auth_user_id is None:
        return error_response("Failed to create auth user.", 500)

    try:
        execute_with_retry(
            supabase.table("app_accounts").insert({
                "auth_user_id": auth_user_id,
                "email": email,
                "account_type": "admin",
                "admin_id": admin_id,
            })
        )
        execute_with_retry(
            supabase.table("admin_accounts").update({"is_active": True}).eq("admin_id", admin_id)
        )
    except Exception as exc:
        # Rollback: delete orphaned app_accounts row, then auth user
        try:
            execute_with_retry(
                supabase.table("app_accounts").delete().eq("auth_user_id", auth_user_id)
            )
        except Exception:
            pass
        try:
            supabase.auth.admin.delete_user(auth_user_id)
        except Exception:
            pass
        logger.error("Admin signup DB insert failed: %r", exc)
        return error_response("Failed to create admin account. Please try again.", 500)

    _admin_signup_codes.pop(email, None)
    logger.info("Admin signup completed for %s (admin_id=%s, auth_user_id=%s)", email, admin_id, auth_user_id)
    return jsonify({"success": True, "message": "Admin account created", "admin_id": admin_id}), 201
