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
matching their email (or GC-username) against the `admin` table.
"""

from functools import wraps

from flask import g, jsonify, request

from database import supabase


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


def _is_admin_user(user):
    """
    Check whether the verified auth user is an admin.

    APPROACH CHOSEN: database email match against the `admin`
    table. A read-only schema probe confirmed the table has an
    `email` column (alongside admin_id, username, role, firstname,
    last_name, license_no), so we match the VERIFIED email from
    Supabase Auth directly — stronger than trusting JWT metadata,
    which users could potentially influence.

    Fallback within the same check: the frontend signs admins in
    as '<username>@gordoncollege.edu.ph', so if no row matches the
    full email we retry with the local part against the `username`
    column (also confirmed to exist). Values here come from the
    verified Supabase Auth user, never from raw client input, and
    are bound via parameterized .eq() filters rather than string
    interpolation into or_() clauses.
    """
    email = (getattr(user, "email", "") or "").strip().lower()
    username = email.split("@")[0] if "@" in email else None

    if not email:
        return False

    try:
        response = (
            supabase
            .table("admin")
            .select("admin_id")
            .eq("email", email)
            .limit(1)
            .execute()
        )

        if response.data:
            return True

        if username:
            response = (
                supabase
                .table("admin")
                .select("admin_id")
                .eq("username", username)
                .limit(1)
                .execute()
            )
            return bool(response.data)

        return False

    except Exception as e:
        print("Admin check error:", repr(e))
        return False


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
    Same as require_auth, PLUS the verified user must exist in the
    `admin` table (matched by verified email, falling back to the
    GC username derived from it).
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

        if not _is_admin_user(user):
            return _forbidden("Admin privileges required")

        return f(*args, **kwargs)

    return wrapper
