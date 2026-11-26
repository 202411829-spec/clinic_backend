"""
Authentication endpoints for student signup and password reset flows.

POST /api/auth/check-email        - validate email format + domain, check availability
POST /api/auth/send-code          - generate & store a 6-digit verification code
POST /api/auth/signup             - create Supabase auth user + students + app_accounts rows

POST /api/auth/forgot/check-email - validate recovery email without revealing account existence
POST /api/auth/forgot/send-code   - send a 6-digit code for password reset
POST /api/auth/forgot/reset       - reset password using the verification code
"""

import logging
import os
import re
import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid, parseaddr

from flask import Blueprint, jsonify, request

from database import supabase
from routers.auth_guard import ADMIN_ROLE, SUPER_ADMIN_ROLE
from routers.helpers import error_response, execute_with_retry, handle_errors
from routers.password_policy import (
    SUPABASE_WEAK_PASSWORD_MESSAGE,
    is_supabase_password_validation_error,
    redact_password_from_error,
    validate_password,
)

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
STUDENT_EMAIL_RE = re.compile(r"^\d{9}@gordoncollege\.edu\.ph$", re.IGNORECASE)
ADMIN_EMAIL_RE = re.compile(r"^[A-Za-z]+\.[A-Za-z]+@gordoncollege\.edu\.ph$", re.IGNORECASE)
STUDENT_EMAIL_MESSAGE = (
    "Please use your official 9-digit Gordon College student email "
    "(e.g., 202311330@gordoncollege.edu.ph)."
)
ADMIN_EMAIL_MESSAGE = (
    "Please use your official Gordon College admin email "
    "(lastname.firstname@gordoncollege.edu.ph)."
)
# Explicit live-QA exception for the admin signup request flow only.
ADMIN_SIGNUP_EMAIL_EXCEPTION = "josephramos0254@gmail.com"
ADMIN_INVITE_TOKEN_COLUMN = "invitation_token"
ADMIN_SIGNUP_ROLES = {ADMIN_ROLE, SUPER_ADMIN_ROLE}
FORGOT_EMAIL_MESSAGE = "Use a valid Gordon College email address (student or admin format)."
FORGOT_GENERIC_MESSAGE = "If an account exists, a verification code has been sent."
STUDENT_FORGOT_ACCOUNT_NOT_FOUND_MESSAGE = (
    "No account found with this email address. Please check your email or sign up."
)
CODE_LENGTH = 6
ADMIN_MIDDLE_INITIAL_RE = re.compile(r"^[A-Za-z]\.*$")
ADMIN_SUFFIX_MAX = 20
CODE_TTL_SECONDS = 5 * 60  # 5 minutes

# These in-memory stores are process-local. On serverless, multi-worker, or
# restarted deployments, a code generated in one process may not be visible to
# the process handling verification; shared TTL storage is required before
# scaling beyond a single long-lived worker.
# In-memory verification codes: {email: (code, created_at)}
_verification_codes: dict[str, tuple[str, float]] = {}

# In-memory forgot-password codes: {email: (code, created_at)}
_forgot_codes: dict[str, tuple[str, float]] = {}

# Isolated admin signup code store: email -> {code, expires_at, send_count, window_start}
_admin_signup_codes: dict[str, dict] = {}
ADMIN_CODE_TTL_SECONDS = 5 * 60
ADMIN_SEND_LIMIT = 3
ADMIN_SEND_WINDOW_SECONDS = 15 * 60


def _mask_email_for_log(email: str) -> str:
    """Return a non-reversible, log-safe form of an email address."""
    local, sep, domain = str(email or "").strip().partition("@")
    if not sep or not domain:
        return "(invalid recipient)"
    return f"{local[:1]}***@{domain}" if local else f"***@{domain}"


def _flow_log_suffix(flow_context: str | None, email: str) -> str:
    """Extra log fields only for explicitly opted-in flows."""
    if not flow_context:
        return ""
    return f" flow={flow_context} masked_recipient={_mask_email_for_log(email)}"


# ============================================================
# HELPERS
# ============================================================

def _generate_code() -> str:
    """Return a cryptographically random zero-padded 6-digit code."""
    return str(secrets.randbelow(10**CODE_LENGTH)).zfill(CODE_LENGTH)


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


def _validate_email(
    email: str, email_format: str = "any"
) -> tuple[str | None, int]:
    """Validate email format, domain, and role-specific shape."""
    if not email:
        return "Email is required.", 400

    if email_format == "student" and not is_valid_student_email(email):
        return STUDENT_EMAIL_MESSAGE, 400

    if email_format == "admin":
        if is_admin_signup_email_exception(email):
            return None, 0
        if not is_valid_admin_email(email):
            return ADMIN_EMAIL_MESSAGE, 400

    if email_format == "any" and not EMAIL_RE.match(email):
        return "Invalid email format.", 400

    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        return f"Only @{ALLOWED_DOMAIN} email addresses are allowed.", 400

    return None, 0


def _resolve_admin_invitation(
    token: str, requested_email: str | None = None
) -> tuple[dict | None, str | None, tuple | None]:
    """Resolve the stored invitation that owns a token.

    The token row is the only source of truth for the invited email and role.
    Callers that pass ``requested_email`` get an explicit mismatch error; OTP
    issuance deliberately does not pass it so a stale form value is replaced by
    the canonical invited email instead of poisoning the code flow.

    Returns ``(row, invited_email, error_response)``.
    """
    token = (token or "").strip()
    if not token:
        return None, None, None

    admin_columns = f"admin_id, email, is_active, role, {ADMIN_INVITE_TOKEN_COLUMN}"
    try:
        invited_resp = execute_with_retry(
            supabase.table("admin_accounts")
            .select(admin_columns)
            .eq(ADMIN_INVITE_TOKEN_COLUMN, token)
            .limit(1)
        )
        invitation_row = (invited_resp.data or [None])[0]
        if invitation_row is None:
            return None, None, error_response(
                "This invitation link is invalid or has expired.", 400
            )

        invited_email = (invitation_row.get("email") or "").strip().lower()
        if not invited_email:
            return None, None, error_response(
                "This invitation link is invalid or has expired.", 400
            )

        account_resp = execute_with_retry(
            supabase.table("app_accounts")
            .select("account_id")
            .eq("email", invited_email)
            .limit(1)
        )
        if account_resp.data or bool(invitation_row.get("is_active")):
            return None, None, error_response(
                "This invitation has already been used. Please log in instead.", 409
            )

        if requested_email and invited_email != requested_email:
            return None, None, error_response(
                "This invitation was sent to a different email address.", 400
            )
    except Exception as exc:
        logger.warning("Invitation token lookup unavailable: %s", type(exc).__name__)
        return None, None, error_response(
            "Invitation signup is not available yet. Please try again later.", 503
        )

    return invitation_row, invited_email, None


def is_valid_student_email(email: str) -> bool:
    return bool(STUDENT_EMAIL_RE.fullmatch(str(email).strip()))


def is_valid_admin_email(email: str) -> bool:
    return bool(ADMIN_EMAIL_RE.fullmatch(str(email).strip()))


def is_admin_signup_email_exception(email: str) -> bool:
    """Return True only for the explicit admin-signup live-QA email."""
    return str(email).strip().lower() == ADMIN_SIGNUP_EMAIL_EXCEPTION


def is_valid_admin_middle_initial(value: str) -> bool:
    """Accept one letter with any number of trailing periods, or empty."""
    raw = str(value or "").strip()
    return not raw or bool(ADMIN_MIDDLE_INITIAL_RE.fullmatch(raw))


def normalize_admin_middle_initial(value: str) -> str | None:
    """Store one uppercase initial and exactly one period, matching the frontend."""
    raw = str(value or "").strip()
    if not raw:
        return None
    base = raw.rstrip(".").strip()
    return f"{base[0].upper()}." if base else None


def _validate_forgot_email(email: str) -> tuple[str | None, int]:
    """Validate a recovery email without revealing whether an account exists."""
    if not email:
        return "Email is required.", 400
    if is_valid_student_email(email) or is_valid_admin_email(email):
        return None, 0
    return FORGOT_EMAIL_MESSAGE, 400


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


def _send_email_via_smtp(
    to_email: str,
    code: str,
    code_label: str = "verification",
    flow_context: str | None = None,
) -> bool:
    """Send a code email via SMTP. Returns True when the provider accepts it."""
    started_at = time.perf_counter()
    log_suffix = _flow_log_suffix(flow_context, to_email)
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    smtp_from = os.environ.get("SMTP_FROM", "").strip() or smtp_user
    smtp_from_address = parseaddr(smtp_from)[1] or smtp_user
    smtp_timeout_seconds = float(os.environ.get("SMTP_TIMEOUT_SECONDS", "10"))

    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not configured%s — skipping SMTP send", log_suffix)
        return False

    recipient_domain = (
        to_email.rsplit("@", 1)[-1] if "@" in to_email else "(invalid recipient)"
    )
    message_id = make_msgid(
        domain=smtp_from_address.rsplit("@", 1)[-1]
        if "@" in smtp_from_address
        else None
    )

    msg = MIMEMultipart("alternative")
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg["Subject"] = "GCCAS OTP"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = message_id

    plain_body = (
        f"Your {code_label} code is: {code}\n"
        "This code expires in 5 minutes.\n"
    )
    html_body = (
        f"<p>Your {code_label} code is: <strong>{code}</strong></p>"
        f"<p>This code expires in 5 minutes.</p>"
    )
    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    smtp_responses: dict = {}
    rcpt_codes: list[int] = []
    data_code = None
    stage = "connect"
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=smtp_timeout_seconds) as server:
            server.ehlo()
            stage = "starttls"
            server.starttls()
            server.ehlo()
            stage = "login"
            server.login(smtp_user, smtp_password)

            # smtplib.sendmail() discards the RCPT/DATA replies. Capture them
            # without changing the sendmail() call so a 4xx/5xx DATA reply is
            # not mistaken for provider acceptance.
            original_rcpt = getattr(server, "rcpt", None)
            if callable(original_rcpt):
                def capture_rcpt(address, *args, **kwargs):
                    reply = original_rcpt(address, *args, **kwargs)
                    smtp_responses.setdefault("rcpt", []).append(reply)
                    return reply

                server.rcpt = capture_rcpt

            original_data = getattr(server, "data", None)
            if callable(original_data):
                def capture_data(raw_message):
                    reply = original_data(raw_message)
                    smtp_responses["data"] = reply
                    return reply

                server.data = capture_data

            stage = "sendmail"
            refused = server.sendmail(smtp_from_address, to_email, msg.as_string())
            if refused:
                # smtplib can return a refused-recipient mapping instead of
                # raising. Treat that as a failed submission so callers never
                # advance a user to OTP entry for an email that was not sent.
                raise smtplib.SMTPRecipientsRefused(refused)

            rcpt_codes = [reply[0] for reply in smtp_responses.get("rcpt", [])]
            data_reply = smtp_responses.get("data")
            data_code = data_reply[0] if data_reply else None
            if data_code is not None and data_code != 250:
                raise smtplib.SMTPDataError(
                    data_code, data_reply[1] if len(data_reply) > 1 else b""
                )

        logger.info(
            "SMTP OTP accepted recipient_domain=%s message_id=%s "
            "rcpt_codes=%s data_code=%s elapsed_ms=%s%s",
            recipient_domain,
            message_id,
            rcpt_codes,
            data_code,
            int((time.perf_counter() - started_at) * 1000),
            log_suffix,
        )
        return True
    except smtplib.SMTPAuthenticationError:
        # Log only the exception class and stage: a provider error could
        # echo the message payload, and the OTP must never reach the logs.
        logger.error(
            "SMTP authentication failed at %s for recipient_domain=%s "
            "using %s:%s (STARTTLS): SMTPAuthenticationError "
            "message_id=%s rcpt_codes=%s data_code=%s elapsed_ms=%s%s",
            stage,
            recipient_domain,
            smtp_host,
            smtp_port,
            message_id,
            rcpt_codes,
            data_code,
            int((time.perf_counter() - started_at) * 1000),
            log_suffix,
        )
        return False
    except Exception as exc:
        code = getattr(exc, "errno", None) or getattr(exc, "winerror", None)
        detail = type(exc).__name__
        if code is not None:
            detail = f"{detail} code={code}"
        logger.warning(
            "SMTP send failed at %s for recipient_domain=%s using %s:%s "
            "(STARTTLS): %s message_id=%s rcpt_codes=%s data_code=%s elapsed_ms=%s%s",
            stage,
            recipient_domain,
            smtp_host,
            smtp_port,
            detail,
            message_id,
            rcpt_codes,
            data_code,
            int((time.perf_counter() - started_at) * 1000),
            log_suffix,
        )
        return False


def _send_verification_email(
    to_email: str,
    code: str,
    code_label: str = "verification",
    flow_context: str | None = None,
) -> bool:
    """Submit a verification email through SMTP or Resend; never logs the code."""
    # Stages that were attempted and did NOT deliver, for the failure log
    # below, so a 500 is traceable to the failing provider without
    # exposing the code itself.
    failed_stages: list[str] = []
    recipient_domain = (
        to_email.rsplit("@", 1)[-1] if "@" in to_email else "(invalid recipient)"
    )
    log_suffix = _flow_log_suffix(flow_context, to_email)

    if _send_email_via_smtp(to_email, code, code_label, flow_context):
        logger.info(
            "SMTP provider accepted %s message for recipient_domain=%s%s",
            code_label,
            recipient_domain,
            log_suffix,
        )
        return True
    failed_stages.append("smtp failed/skipped (reason in the preceding smtp log)")

    # Resend fallback is opt-in. Automatic fallback can add a second provider
    # timeout after SMTP already failed, which delays the API response and can
    # cause duplicate/late emails. Enable only with OTP_ALLOW_RESEND_FALLBACK=1.
    if os.environ.get("OTP_ALLOW_RESEND_FALLBACK", "").strip() != "1":
        failed_stages.append("resend fallback disabled")
    else:
        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if not api_key:
            failed_stages.append("resend not configured (RESEND_API_KEY empty)")
        elif resend is None:
            failed_stages.append("resend SDK unavailable")
        else:
            sender = os.environ.get("RESEND_FROM", "").strip() or (
                "Clinic Appointment System <onboarding@resend.dev>"
            )
            try:
                resend.api_key = api_key
                send_result = resend.Emails.send({
                    "from": sender,
                    "to": [to_email],
                    "subject": "GCCAS OTP",
                    "html": (
                        f"<p>Your {code_label} code is: <strong>{code}</strong></p>"
                        f"<p>This code expires in 5 minutes.</p>"
                    ),
                })
                # Some SDK versions surface provider errors as a response body
                # instead of raising. Only a clean response counts as submission.
                if isinstance(send_result, dict) and send_result.get("error"):
                    raise RuntimeError("resend provider error")
                logger.info(
                    "Resend provider accepted %s message for recipient_domain=%s%s",
                    code_label,
                    recipient_domain,
                    log_suffix,
                )
                return True
            except Exception as exc:
                logger.warning(
                    "Resend email failed (%s) for recipient_domain=%s: %s%s",
                    code_label,
                    recipient_domain,
                    type(exc).__name__,
                    log_suffix,
                )
                failed_stages.append("resend send failed")

    logger.error(
        "Email delivery failed (%s) for recipient_domain=%s - failing stages: %s%s",
        code_label,
        recipient_domain,
        "; ".join(failed_stages),
        log_suffix,
    )
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
    err, status = _validate_email(email, "student")
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
    started_at = time.perf_counter()
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_email(email, "student")
    if err:
        return error_response(err, status)

    # --- generate code ---
    _purge_expired_codes()
    code = _generate_code()

    if not _send_verification_email(email, code):
        logger.warning(
            "OTP send-code failed flow=student_signup elapsed_ms=%s",
            int((time.perf_counter() - started_at) * 1000),
        )
        return error_response(
            "Could not send the verification email. Please try again later.", 500
        )

    _verification_codes[email] = (code, time.time())
    logger.info(
        "OTP send-code accepted flow=student_signup elapsed_ms=%s",
        int((time.perf_counter() - started_at) * 1000),
    )

    return jsonify({
        "success": True,
        "message": "Verification code sent. It may take a minute to arrive; check spam if needed.",
    }), 200


# ============================================================
# POST /api/auth/signup
#
# Request: {
#   "email":    "202411829@gordoncollege.edu.ph",
#   "code":     "482916",
#   "password": "S3cret-Passphrase!",
#   "confirmPassword": "S3cret-Passphrase!"
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
    err, status = _validate_email(email, "student")
    if err:
        return error_response(err, status)

    # --- password validation (shared policy is authoritative) ---
    password_check = validate_password(
        password, email=email, username=email.split("@")[0]
    )
    if not password_check["valid"]:
        return error_response(password_check["message"], 400)

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
        if is_supabase_password_validation_error(exc):
            logger.error(
                "Admin create_user rejected password for %s: code=%r details=%r",
                email,
                getattr(exc, "code", None),
                redact_password_from_error(exc, password),
            )
            return error_response(SUPABASE_WEAK_PASSWORD_MESSAGE, 400)

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
            logger.error(
                "Admin create_user failed: %r",
                redact_password_from_error(exc, password),
            )
            return error_response("Failed to create auth user. Please try again.", 500)

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
# Response: { "success": true, "message": "..." }
#
# Validates the email format without revealing whether an account exists.
# ============================================================

@auth_bp.route("/forgot/check-email", methods=["POST"])
@handle_errors("forgot check-email error")
def forgot_check_email():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_forgot_email(email)
    if err:
        return error_response(err, status)

    return jsonify({
        "success": True,
        "message": FORGOT_GENERIC_MESSAGE,
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
    started_at = time.perf_counter()
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    # --- validation ---
    err, status = _validate_forgot_email(email)
    if err:
        return error_response(err, status)

    # --- check account exists and resolve the recipient ---
    # Student recovery is intentionally isolated here: admin forgot-password
    # keeps the original exact-match lookup and submitted-email recipient.
    student_recovery = is_valid_student_email(email)
    flow_context = "student_forgot" if student_recovery else None
    recipient = email
    masked_email = _mask_email_for_log(email)

    if student_recovery:
        try:
            account_check = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("account_id, email, account_type")
                .ilike("email", email)
                .limit(1)
            )
        except Exception as exc:
            logger.error(
                "Student forgot OTP lookup failed masked_email=%s error=%s "
                "elapsed_ms=%s",
                masked_email,
                type(exc).__name__,
                int((time.perf_counter() - started_at) * 1000),
            )
            raise

        if not account_check.data:
            logger.warning(
                "Student forgot OTP lookup no account masked_email=%s elapsed_ms=%s",
                masked_email,
                int((time.perf_counter() - started_at) * 1000),
            )
            return error_response(STUDENT_FORGOT_ACCOUNT_NOT_FOUND_MESSAGE, 404)

        account_row = account_check.data[0]
        recipient = (account_row.get("email") or email).strip().lower()
        logger.info(
            "Student forgot OTP lookup found masked_email=%s masked_recipient=%s "
            "account_type=%s elapsed_ms=%s",
            masked_email,
            _mask_email_for_log(recipient),
            account_row.get("account_type") or "(unknown)",
            int((time.perf_counter() - started_at) * 1000),
        )
    else:
        account_check = execute_with_retry(
            supabase
            .table("app_accounts")
            .select("account_id")
            .eq("email", email)
            .limit(1)
        )

        if not account_check.data:
            return jsonify({
                "success": True,
                "message": FORGOT_GENERIC_MESSAGE,
            }), 200

    # --- generate code ---
    code = _generate_code()

    if not _send_verification_email(
        recipient, code, "password reset", flow_context
    ):
        logger.warning(
            "OTP send-code failed flow=%s elapsed_ms=%s",
            flow_context or "forgot_password",
            int((time.perf_counter() - started_at) * 1000),
        )
        return error_response(
            "Could not send the verification email. Please try again later.", 500
        )

    # The reset form is keyed by the email the user typed, so keep the code
    # under that value even when the canonical recipient differs slightly.
    _forgot_codes[email] = (code, time.time())
    logger.info(
        "OTP send-code accepted flow=%s elapsed_ms=%s",
        flow_context or "forgot_password",
        int((time.perf_counter() - started_at) * 1000),
    )

    return jsonify({
        "success": True,
        "message": FORGOT_GENERIC_MESSAGE,
    }), 200


# ============================================================
# POST /api/auth/forgot/reset
#
# Request: {
#   "email":    "202411829@gordoncollege.edu.ph",
#   "code":     "482916",
#   "password": "S3cret-Passphrase!",
#   "confirmPassword": "S3cret-Passphrase!"
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
    err, status = _validate_forgot_email(email)
    if err:
        return error_response(err, status)

    # --- password validation (shared policy is authoritative) ---
    password_check = validate_password(
        password, email=email, username=email.split("@")[0]
    )
    if not password_check["valid"]:
        return error_response(password_check["message"], 400)

    if password != confirm_password:
        return error_response("Passwords do not match.", 400)

    # --- verify code ---
    if not _is_forgot_code_valid(email, code):
        return error_response("Invalid or expired verification code.", 400)

    # --- find auth user ---
    auth_user = _find_auth_user_by_email(email)
    if auth_user is None:
        return error_response("Invalid or expired verification code.", 400)

    # --- reset password via Supabase admin API ---
    try:
        supabase.auth.admin.update_user_by_id(
            auth_user.id,
            {"password": password},
        )
    except Exception as exc:
        details = redact_password_from_error(exc, password)
        if is_supabase_password_validation_error(exc):
            logger.error(
                "Admin update_user_by_id rejected password for %s: code=%r details=%r",
                email,
                getattr(exc, "code", None),
                details,
            )
            return error_response(SUPABASE_WEAK_PASSWORD_MESSAGE, 400)
        logger.error("Admin update_user_by_id failed for %s: %r", email, details)
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
    """Check if an admin email is available for signup request.

    Logic (no allowlist — any valid admin email or the explicit signup exception can request):
      - Email already active (admin_accounts.is_active + app_account) -> 409 "Already active"
      - Email exists in admin_accounts but not active -> 200 {available:false, status:"pending"}
      - Email not in admin_accounts -> 200 {available:true}
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    err, status = _validate_email(email, "admin")
    if err:
        return error_response(err, status)

    # Check if email already exists in admin_accounts
    admin_resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("email", email).limit(1)
    )
    if admin_resp.data:
        row = admin_resp.data[0]
        is_active = bool(row.get("is_active"))
        if is_active:
            # Check if already has app_account (fully active)
            acct = execute_with_retry(
                supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
            )
            if acct.data:
                return error_response("Already active", 409)
        # Not yet active (pending request or allowlist invite)
        return jsonify({"success": True, "available": False, "status": "pending"}), 200

    # Also check app_accounts (e.g. student email reused as admin)
    acct_resp = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
    )
    if acct_resp.data:
        return error_response("An account with this email already exists. Please log in instead.", 409)

    # Email not in any admin table -- available for signup request
    return jsonify({"success": True, "available": True}), 200


@auth_bp.route("/admin/send-code", methods=["POST"])
@handle_errors("admin send-code error")
def admin_send_code():
    """Send a 6-digit verification code for admin signup request.

    No allowlist gate: any valid admin email, or the explicit signup exception,
    that isn't already active can request a code.  Rate limited to 3 accepted
    sends per 15 minutes.
    """
    started_at = time.perf_counter()
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    invitation_token = (body.get("invitation_token") or "").strip()

    if invitation_token:
        # An invitation token owns the canonical email. Never let stale form
        # state or an old query copy decide which address receives the OTP.
        invitation_row, invited_email, invitation_error = _resolve_admin_invitation(
            invitation_token
        )
        if invitation_error:
            return invitation_error
        email = invited_email

    err, status = _validate_email(email, "admin")
    if err:
        return error_response(err, status)

    # Block if already active (admin_accounts.is_active + app_account exists)
    admin_resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("email", email).limit(1)
    )
    if admin_resp.data:
        is_active = bool(admin_resp.data[0].get("is_active"))
        if is_active:
            acct = execute_with_retry(
                supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
            )
            if acct.data:
                return error_response("Already active", 409)

    _purge_admin_codes()
    if not _check_admin_rate_limit(email):
        return error_response("Too many codes sent. Please try again later.", 429)

    code = _generate_code()

    if not _send_verification_email(email, code, "admin verification"):
        logger.warning(
            "OTP send-code failed flow=admin_signup elapsed_ms=%s",
            int((time.perf_counter() - started_at) * 1000),
        )
        return error_response(
            "Could not send the verification email. Please try again later.", 500
        )

    _record_admin_send(email, code)
    logger.info(
        "OTP send-code accepted flow=admin_signup elapsed_ms=%s",
        int((time.perf_counter() - started_at) * 1000),
    )

    return jsonify({
        "success": True,
        "message": "Verification code sent. It may take a minute to arrive; check spam if needed.",
        "email": email,
    }), 200


@auth_bp.route("/admin/signup", methods=["POST"])
@handle_errors("admin signup error")
def admin_signup():
    """Complete an invited admin signup or create a pending self-request.

    A valid invitation token with a matching email activates the existing
    invite row immediately with the role stored by the inviting super admin.
    Without a token, the ordinary request flow stays pending for approval.

    Request body:
      email, code, password, confirmPassword,
      last_name, first_name, middle_initial (optional single letter), suffix (optional),
      license_no (optional), invitation_token (optional)

    The access role is NOT client-controlled: a brand-new self-request is
    always stored as ADMIN_ROLE ("admin"), while an invite completion keeps
    whatever role the inviting super admin stored on the pending row.
    """
    body = request.get_json(silent=True) or {}
    requested_email = (body.get("email") or "").strip().lower()
    invitation_token = (body.get("invitation_token") or "").strip()
    code = (body.get("code") or "").strip()
    password = body.get("password") or ""
    confirm_password = body.get("confirmPassword") or ""
    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    middle_initial_raw = body.get("middle_initial")
    middle_initial = normalize_admin_middle_initial(middle_initial_raw)
    suffix_raw = (body.get("suffix") or "").strip()
    suffix = suffix_raw or None
    license_no = (body.get("license_no") or "").strip() or None

    # --- required field checks ---
    if not requested_email:
        return error_response("Email is required.", 400)
    if not code:
        return error_response("Verification code is required.", 400)
    if not password:
        return error_response("Password is required.", 400)
    if not confirm_password:
        return error_response("Password confirmation is required.", 400)
    if not first_name:
        return error_response("First name is required.", 400)
    if not last_name:
        return error_response("Last name is required.", 400)
    if not is_valid_admin_middle_initial(middle_initial_raw):
        return error_response(
            "Middle initial must be a single letter, optionally followed by a period.", 400
        )
    if suffix and len(suffix) > ADMIN_SUFFIX_MAX:
        return error_response(f"Suffix must be {ADMIN_SUFFIX_MAX} characters or fewer.", 400)

    # Resolve invitations before any other email-dependent work. The token row
    # owns the canonical email/code bucket; the submitted email is only checked
    # for an explicit mismatch, never trusted to define the invitation.
    email = requested_email
    invitation_row = None
    is_invitation = False
    if invitation_token:
        invitation_row, invited_email, invitation_error = _resolve_admin_invitation(
            invitation_token, requested_email
        )
        if invitation_error:
            return invitation_error
        email = invited_email
        is_invitation = True

    # --- email validation ---
    err, status = _validate_email(email, "admin")
    if err:
        return error_response(err, status)

    # --- password validation (shared policy is authoritative) ---
    password_check = validate_password(
        password, email=email, username=email.split("@")[0]
    )
    if not password_check["valid"]:
        return error_response(password_check["message"], 400)
    if password != confirm_password:
        return error_response("Passwords do not match.", 400)

    # --- code validation ---
    if not code.isdigit() or len(code) != 6:
        return error_response("Invalid or expired code", 400)
    if not _is_admin_code_valid(email, code):
        return error_response("Invalid or expired code", 400)

    # --- idempotency / invite completion ---
    # A pending self-request always has both admin_accounts and app_accounts.
    # A super-admin invitation has only admin_accounts plus a server-issued
    # token, so the invitee completes that row instead of dead-ending at a
    # duplicate-request 409.
    admin_columns = f"admin_id, is_active, role, {ADMIN_INVITE_TOKEN_COLUMN}"
    admin_resp = execute_with_retry(
        supabase.table("admin_accounts").select(admin_columns).eq("email", email).limit(1)
    )
    existing_account = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
    )
    existing_admin_id = None
    created_admin_row = False
    admin_row = (admin_resp.data or [None])[0]

    if is_invitation:
        if admin_row is None or str(admin_row.get("admin_id")) != str(invitation_row.get("admin_id")):
            admin_row = invitation_row
    elif admin_row and (admin_row.get(ADMIN_INVITE_TOKEN_COLUMN) or "").strip():
        return error_response("Use the invitation link sent to this email to complete signup.", 400)

    # The role is never taken from the client payload: a brand-new
    # self-request is always ADMIN_ROLE, while an invite completion keeps
    # the role the super admin stored on the invitation row.
    role = ADMIN_ROLE

    if admin_row:
        is_active = bool(admin_row.get("is_active"))
        if existing_account.data:
            if is_active:
                return error_response("Already active", 409)
            return error_response("A signup request already exists for this email. Please wait for approval.", 409)
        existing_admin_id = admin_row.get("admin_id") or None
        if existing_admin_id is None:
            return error_response("Failed to create admin account. Please try again.", 500)
        if is_invitation:
            stored_role = (invitation_row.get("role") or "").strip().lower()
            if stored_role not in ADMIN_SIGNUP_ROLES:
                return error_response("The invitation role is invalid. Ask the super admin to resend it.", 400)
            role = stored_role
    elif existing_account.data:
        return error_response("An account with this email already exists. Please log in instead.", 409)

    # Invite completions become active immediately; ordinary self-requests
    # remain pending until an existing admin approves them.
    username = email.split("@")[0]
    profile_updates = {
        "last_name": last_name,
        "first_name": first_name,
        "middle_initial": middle_initial,
        "suffix": suffix,
        "license_no": license_no,
        "role": role,
        "is_active": True if is_invitation else False,
    }
    admin_id = existing_admin_id

    def _rollback_invite_activation():
        """Keep a failed invite completion pending instead of half-activated."""
        if not is_invitation or created_admin_row or existing_admin_id is None:
            return
        try:
            execute_with_retry(
                supabase.table("admin_accounts")
                .update({"is_active": False})
                .eq("admin_id", existing_admin_id)
            )
        except Exception:
            pass

    try:
        if existing_admin_id:
            execute_with_retry(
                supabase.table("admin_accounts").update(profile_updates).eq("admin_id", existing_admin_id)
            )
        else:
            inserted = execute_with_retry(
                supabase.table("admin_accounts").insert({
                    "email": email,
                    "username": username,
                    **profile_updates,
                })
            )
            row = (inserted.data or [None])[0]
            if row is None:
                fetched = execute_with_retry(
                    supabase.table("admin_accounts").select("admin_id").eq("email", email).limit(1)
                )
                row = (fetched.data or [None])[0]
            if row is None:
                raise RuntimeError("admin_accounts insert returned no data")
            admin_id = row["admin_id"]
            created_admin_row = True
    except Exception as exc:
        logger.error("Admin signup: failed to save admin_accounts row for %s: %r", email, exc)
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            return error_response("A signup request already exists for this email. Please wait for approval.", 409)
        return error_response("Failed to create admin account. Please try again.", 500)

    # --- create Supabase auth user ---
    auth_user_id = None
    try:
        auth_result = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        if auth_result.user is None:
            raise RuntimeError("create_user returned None user")
        auth_user_id = auth_result.user.id
    except Exception as exc:
        if is_supabase_password_validation_error(exc):
            logger.error(
                "Admin create_user rejected password for %s: code=%r details=%r",
                email,
                getattr(exc, "code", None),
                redact_password_from_error(exc, password),
            )
            # Rollback only rows created here; never delete an existing invite.
            if created_admin_row:
                try:
                    execute_with_retry(
                        supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
                    )
                except Exception:
                    pass
            _rollback_invite_activation()
            return error_response(SUPABASE_WEAK_PASSWORD_MESSAGE, 400)

        exc_str = str(exc).lower()
        if "already" in exc_str or "exists" in exc_str:
            # Rollback only rows created here; never delete an existing invite.
            if created_admin_row:
                try:
                    execute_with_retry(
                        supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
                    )
                except Exception:
                    pass
            _rollback_invite_activation()
            return error_response("An account with this email already exists. Please log in instead.", 409)
        logger.error(
            "Admin create_user failed for %s: %r",
            email,
            redact_password_from_error(exc, password),
        )
        # Rollback only rows created here; never delete an existing invite.
        if created_admin_row:
            try:
                execute_with_retry(
                    supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
                )
            except Exception:
                pass
        _rollback_invite_activation()
        return error_response("Failed to create auth user. Please try again.", 500)

    if auth_user_id is None:
        if created_admin_row:
            try:
                execute_with_retry(
                    supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
                )
            except Exception:
                pass
        _rollback_invite_activation()
        return error_response("Failed to create auth user.", 500)

    # --- create app_accounts row (links auth user to admin) ---
    try:
        execute_with_retry(
            supabase.table("app_accounts").insert({
                "auth_user_id": auth_user_id,
                "email": email,
                "account_type": "admin",
                "admin_id": admin_id,
            })
        )
    except Exception as exc:
        # Rollback: delete app_accounts (if partial), auth user, admin_accounts
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
        if created_admin_row:
            try:
                execute_with_retry(
                    supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
                )
            except Exception:
                pass
        _rollback_invite_activation()
        logger.error("Admin signup DB insert failed for %s: %r", email, exc)
        return error_response("Failed to create admin account. Please try again.", 500)

    # --- consume invitation token ---
    # The token is single-use. Clearing it after the account and auth user are
    # fully linked prevents a second signup from reusing the same invitation.
    if is_invitation:
        try:
            execute_with_retry(
                supabase.table("admin_accounts")
                .update({ADMIN_INVITE_TOKEN_COLUMN: None})
                .eq("admin_id", admin_id)
            )
        except Exception as exc:
            logger.warning(
                "Could not consume invitation token for admin %s: %s",
                admin_id,
                type(exc).__name__,
            )

    # --- consume verification code ---
    _admin_signup_codes.pop(email, None)
    logger.info(
        "Admin signup %s for %s (admin_id=%s, auth_user_id=%s)",
        "invitation accepted" if is_invitation else "request submitted",
        email,
        admin_id,
        auth_user_id,
    )
    return jsonify({
        "success": True,
        "message": (
            "Invitation accepted. Your admin account is active."
            if is_invitation else "Request submitted, pending approval"
        ),
        "admin_id": admin_id,
        "status": "active" if is_invitation else "pending",
    }), 201
