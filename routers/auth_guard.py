"""
Authentication / authorization guards for the Flask API.

The React frontend signs users into Supabase Auth directly
(adminSignIn/studentSignIn) and sends their access token on every
API call as:

    Authorization: Bearer <supabase_access_token>

`require_auth` verifies exactly that header format against Supabase
Auth using the shared service-role client, and attaches the verified
user to flask.g for downstream handlers:

    g.user = {"id": <auth uid>, "email": <verified email>}

`require_admin` additionally checks the verified user is an admin by
consulting the single clean `app_accounts` table (account_type='admin'
with an admin_id), which links the authenticated auth user to their
admin identity (Blockers B/C).
"""

import logging
from functools import wraps

from flask import g, jsonify, request

from database import supabase
from routers.helpers import execute_with_retry

logger = logging.getLogger(__name__)


# ============================================================
# SHARED FILTER-SANITIZING HELPER
#
# PostgREST's or_()/logic-tree syntax uses commas to separate
# clauses, parentheses for grouping, and double quotes for
# quoted values. User-supplied search text used to be
# interpolated straight into f"%{search}%" filter strings, so a
# search value containing any of those characters could inject
# extra filter clauses. Strip them before interpolation.
# ============================================================

FILTER_METACHARACTERS = '(),"\\'


def sanitize_search(value):
    """
    Remove PostgREST filter metacharacters (commas, parentheses,
    double quotes, backslashes) from user-supplied search input
    before it is interpolated into an or_()/ilike filter string.
    Returns None for empty input so existing `if search:` guards
    keep working unchanged.
    """
    if value is None:
        return None

    cleaned = str(value)

    for ch in FILTER_METACHARACTERS:
        cleaned = cleaned.replace(ch, "")

    cleaned = cleaned.strip()

    return cleaned or None


# ============================================================
# INTERNALS
# ============================================================

def _unauthorized(message):
    """Uniform 401 envelope — matches every other error body shape."""
    return jsonify({"success": False, "error": message}), 401


def _forbidden(message):
    """Authenticated but not authorized — same envelope, HTTP 403."""
    return jsonify({"success": False, "error": message}), 403


def _get_bearer_token():
    """
    Extract the token from an 'Authorization: Bearer <token>' header.
    Returns None when missing/malformed.
    """
    header = request.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None

    token = header[len("Bearer "):].strip()

    return token or None


def _verify_token(token):
    """
    Verify the Supabase access token via the shared service-role
    client. Returns the auth User object, or None when invalid.
    supabase-py v2 returns either a User or a response wrapper
    depending on version, so unwrap defensively.
    """

    try:
        response = supabase.auth.get_user(token)
    except Exception:
        return None

    if response is None:
        return None

    user = getattr(response, "user", response)

    return user if user else None


def is_admin_user(user):
    """
    Check whether the verified auth user is an admin.

    Identity is resolved through the single clean `app_accounts` table
    (Blockers B): an admin user is one whose app_accounts row has
    account_type='admin' AND admin_id IS NOT NULL. app_accounts has no
    `username` column, so matching is by auth_user_id first (the verified
    token subject — more robust than email), then by the verified email
    (the key, `<username>@gordoncollege.edu.ph`). Values come from the
    verified Supabase Auth user, never raw client input.
    """
    auth_user_id = getattr(user, "id", None)
    email = (getattr(user, "email", "") or "").strip().lower()

    try:
        if auth_user_id:
            response = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("admin_id")
                .eq("auth_user_id", auth_user_id)
                .eq("account_type", "admin")
                .limit(1)
            )
            if response.data:
                return bool(response.data[0].get("admin_id"))

        if email:
            response = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("admin_id")
                .eq("email", email)
                .eq("account_type", "admin")
                .limit(1)
            )
            if response.data:
                return bool(response.data[0].get("admin_id"))

        return False

    except Exception as e:
        logger.error("Admin check error: %r", e)
        return False


def resolve_student_id(user):
    """
    Resolve the verified auth user to a student_id via the clean
    `app_accounts` table (account_type='student' with a student_id).
    Resolves by auth_user_id first (the verified token subject), then by
    the verified email. The legacy email-local-part derivation is kept
    ONLY as a clearly-commented last-resort fallback — never the primary
    path (Blockers C).
    """
    auth_user_id = getattr(user, "id", None)
    email = (getattr(user, "email", "") or "").strip().lower()

    try:
        if auth_user_id:
            response = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("student_id")
                .eq("auth_user_id", auth_user_id)
                .eq("account_type", "student")
                .limit(1)
            )
            if response.data and response.data[0].get("student_id"):
                return response.data[0]["student_id"]

        if email:
            response = execute_with_retry(
                supabase
                .table("app_accounts")
                .select("student_id")
                .eq("email", email)
                .eq("account_type", "student")
                .limit(1)
            )
            if response.data and response.data[0].get("student_id"):
                return response.data[0]["student_id"]

    except Exception as e:
        logger.error("Student id resolution error: %r", e)

    # LAST-RESORT fallback only — never the primary path (Blockers C).
    if email and "@" in email:
        return email.split("@")[0]

    return None


# ============================================================
# DECORATORS
# ============================================================

def require_auth(f):
    """
    Require 'Authorization: Bearer <supabase_access_token>' on the
    request. Attaches g.user = {id, email} on success.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):

        token = _get_bearer_token()

        if token is None:
            return _unauthorized(
                "Missing or malformed Authorization header. "
                "Expected: Bearer <access_token>"
            )

        user = _verify_token(token)

        if user is None:
            return _unauthorized("Invalid or expired token")

        g.user = {
            "id": getattr(user, "id", None),
            "email": getattr(user, "email", None),
        }

        return f(*args, **kwargs)

    return wrapper


def require_admin(f):
    """
    Same as require_auth, PLUS the verified user must be an admin in the
    clean `app_accounts` table (account_type='admin' with an admin_id,
    resolved by auth_user_id or verified email).
    """
    @wraps(f)
    def wrapper(*args, **kwargs):

        token = _get_bearer_token()

        if token is None:
            return _unauthorized(
                "Missing or malformed Authorization header. "
                "Expected: Bearer <access_token>"
            )

        user = _verify_token(token)

        if user is None:
            return _unauthorized("Invalid or expired token")

        g.user = {
            "id": getattr(user, "id", None),
            "email": getattr(user, "email", None),
        }

        if not is_admin_user(user):
            return _forbidden("Admin privileges required")

        return f(*args, **kwargs)

    return wrapper
