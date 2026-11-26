import os
import re
import logging
import secrets
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
from html import escape
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from flask import Blueprint, jsonify, request, g

try:
    import resend
except ImportError:
    resend = None

from database import supabase
from routers.auth_guard import (
    ADMIN_ROLE,
    SUPER_ADMIN_ROLE,
    require_admin,
    require_auth,
    require_super_admin,
    sanitize_search,
)
from routers.auth import (
    ADMIN_SUFFIX_MAX,
    is_admin_signup_email_exception,
    is_valid_admin_middle_initial,
    normalize_admin_middle_initial,
)
from routers.helpers import execute_with_retry, error_response, handle_errors

logger = logging.getLogger(__name__)

admin_mgmt_bp = Blueprint("admin_mgmt", __name__, url_prefix="/api")

# The two admin access roles; mirrors the admin_accounts_role_check
# constraint added by migrations/2026-11-25_admin_access_roles.sql.
ALLOWED_ADMIN_ROLES = {ADMIN_ROLE, SUPER_ADMIN_ROLE}
ALLOWED_DOMAIN = "gordoncollege.edu.ph"
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
INVITE_SENT_COLUMN = "invite_email_sent_at"
INVITE_TOKEN_COLUMN = "invitation_token"
INVITE_EMAIL_SUBJECT = "GCCAS admin invitation"
ADMIN_SIGNUP_PATH = "/admin/signup"  # src/router/index.jsx
LOCAL_FRONTEND_URL = "http://localhost:5173"
LOCAL_FRONTEND_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _send_admin_decision_email(to_email: str, approved: bool) -> bool:
    """Notify an applicant of an approve/reject decision via configured SMTP.

    Delivery failure is logged but never blocks the administrative action.
    No credentials, tokens, or message content beyond the decision and email
    address are logged.
    """
    if not to_email:
        return False

    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    if not smtp_user or not smtp_password:
        logger.warning("SMTP credentials not configured — admin decision email skipped for %s", to_email)
        return False

    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    try:
        smtp_port = int(os.environ.get("SMTP_PORT", 587))
    except (TypeError, ValueError):
        logger.warning("Invalid SMTP_PORT — admin decision email skipped for %s", to_email)
        return False

    smtp_from = os.environ.get("SMTP_FROM", "").strip() or smtp_user
    from_address = smtp_from.split("<")[-1].rstrip(">").strip() or smtp_user
    decision = "approved" if approved else "not approved"
    subject = f"GCCAS admin request {decision}"
    body = (
        "Your Gordon College Clinic System admin access request has been "
        f"{decision}.\n\n"
        + (
            "You can now sign in to the admin portal with your registered account."
            if approved
            else "Admin access was not enabled for this request."
        )
        + "\n"
    )

    msg = MIMEText(body, "plain")
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg["Subject"] = subject

    stage = "connect"
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            stage = "starttls"
            server.starttls()
            stage = "login"
            server.login(smtp_user, smtp_password)
            stage = "sendmail"
            server.sendmail(from_address, to_email, msg.as_string())
        logger.info("Admin decision email sent to %s (%s)", to_email, decision)
        return True
    except Exception as exc:
        code = getattr(exc, "errno", None) or getattr(exc, "winerror", None)
        detail = type(exc).__name__
        if code is not None:
            detail = f"{detail} code={code}"
        logger.warning(
            "Admin decision email failed at %s for %s using %s:%s: %s",
            stage,
            to_email,
            smtp_host,
            smtp_port,
            detail,
        )
        return False


def _normalize_frontend_base(value: str) -> str:
    """Return an absolute scheme://host[/path] base, without query/fragment."""
    value = (value or "").strip().rstrip("/")
    if not value:
        return ""

    parsed = urlsplit(value)
    if parsed.scheme and parsed.netloc:
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc
        path = parsed.path.rstrip("/")
    else:
        # Bare values such as `localhost:5173` are interpreted as a scheme by
        # urlsplit, so normalize the authority manually.
        authority, _, remainder = value.partition("/")
        host = authority.split(":", 1)[0].lower()
        scheme = "http" if host in LOCAL_FRONTEND_HOSTS else "https"
        netloc = authority
        path = remainder.rstrip("/")

    return urlunsplit((scheme, netloc, path, "", ""))


def _is_local_frontend_base(base: str) -> bool:
    return (urlsplit(base).hostname or "").lower() in LOCAL_FRONTEND_HOSTS


def _configured_frontend_base_url() -> str:
    """Resolve the public frontend base used in invitation emails.

    Priority:
      1. FRONTEND_URL — explicit public URL; set this in production.
      2. FRONTEND_ORIGINS — CORS allowlist; prefer its first non-local origin.
      3. LOCAL_FRONTEND_URL — safe absolute local-dev fallback.
    """
    explicit = _normalize_frontend_base(os.environ.get("FRONTEND_URL", ""))
    if explicit:
        return explicit

    candidates = [
        _normalize_frontend_base(origin)
        for origin in os.environ.get("FRONTEND_ORIGINS", "").split(",")
    ]
    candidates = [base for base in candidates if base]

    for base in candidates:
        if not _is_local_frontend_base(base):
            return base
    for base in candidates:
        return base

    return LOCAL_FRONTEND_URL


def _frontend_signup_url(query: dict | None = None) -> str:
    """Build the absolute admin signup URL used by invitation emails.

    Any query parameters supplied by the caller (for example an invitation
    token) are appended instead of being dropped during URL construction.
    """
    base = _configured_frontend_base_url()
    parsed = urlsplit(base)
    path = f"{parsed.path.rstrip('/')}{ADMIN_SIGNUP_PATH}"

    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    for key, value in (query or {}).items():
        if value is not None:
            query_items.append((str(key), str(value)))

    return urlunsplit((
        parsed.scheme,
        parsed.netloc,
        path,
        urlencode(query_items),
        "",
    ))


def _new_invitation_token() -> str:
    """Issue a high-entropy, single-purpose token for one invitation."""
    return secrets.token_urlsafe(24)


def _ensure_invitation_token(row: dict) -> str | None:
    """Return the row's invite token, persisting one if the column is available.

    The token is stored server-side and never exposed by the admin list API.
    If the additive migration has not been applied yet, delivery can still
    proceed with an email-only signup link and the ordinary approval workflow.
    """
    if not row:
        return None

    token = (row.get(INVITE_TOKEN_COLUMN) or "").strip()
    if token:
        return token

    admin_id = row.get("admin_id")
    if not admin_id:
        return None

    token = _new_invitation_token()
    try:
        resp = execute_with_retry(
            supabase.table("admin_accounts")
            .update({INVITE_TOKEN_COLUMN: token})
            .eq("admin_id", admin_id)
        )
        if getattr(resp, "error", None):
            raise RuntimeError("supabase update error")
    except Exception as exc:
        logger.warning(
            "Could not store invitation token for %s: %s",
            admin_id,
            type(exc).__name__,
        )
        return None

    return token


def _invite_signup_url(to_email: str, invite_token: str | None, role: str) -> str:
    """Build a signup link carrying the invited email and optional token.

    The role is included for readability in the link only; the backend always
    resolves the effective role from the stored invitation row.
    """
    query = {"email": (to_email or "").strip().lower()}
    if invite_token:
        query["invite_token"] = invite_token
    if role:
        query["role"] = role
    return _frontend_signup_url(query)


def _send_admin_invite_email(
    to_email: str,
    role: str = ADMIN_ROLE,
    invite_token: str | None = None,
) -> bool:
    """Send an admin invitation via SMTP, falling back to Resend.

    Returns True only when a provider accepts the message. Provider errors
    are logged by stage/type only — never credentials, message bodies, or
    full exception text.
    """
    if not to_email:
        return False

    role_label = "Super Admin" if role == SUPER_ADMIN_ROLE else "Admin"
    signup_url = _invite_signup_url(to_email, invite_token, role)
    text_body = (
        "You have been invited to join the Gordon College Clinic System "
        f"with {role_label} access.\n\n"
        f"Use this email address when signing up: {to_email}\n"
        f"Sign up here: {signup_url}\n\n"
        "Your account will be activated automatically after you complete signup."
    )
    html_body = (
        "<p>You have been invited to join the Gordon College Clinic System "
        f"with <strong>{role_label}</strong> access.</p>"
        f"<p>Use this email address when signing up: <strong>{escape(to_email)}</strong></p>"
        f'<p><a href="{escape(signup_url, quote=True)}">Sign up here</a></p>'
        "<p>Your account will be activated automatically after you complete signup.</p>"
    )
    failed_stages = []

    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    if not smtp_user or not smtp_password:
        failed_stages.append("smtp credentials missing")
    else:
        smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        try:
            smtp_port = int(os.environ.get("SMTP_PORT", 587))
        except (TypeError, ValueError):
            failed_stages.append("smtp invalid port")
            smtp_port = None

        if smtp_port is not None:
            smtp_from = os.environ.get("SMTP_FROM", "").strip() or smtp_user
            from_address = parseaddr(smtp_from)[1] or smtp_user
            msg = MIMEMultipart("alternative")
            msg["From"] = smtp_from
            msg["To"] = to_email
            msg["Subject"] = INVITE_EMAIL_SUBJECT
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            stage = "connect"
            try:
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    stage = "starttls"
                    server.starttls()
                    stage = "login"
                    server.login(smtp_user, smtp_password)
                    stage = "sendmail"
                    refused = server.sendmail(from_address, to_email, msg.as_string())
                    if refused:
                        # smtplib reports partially/fully refused recipients in
                        # its return value instead of always raising.
                        failed_stages.append("smtp recipient refused")
                        raise smtplib.SMTPRecipientsRefused(refused)
                logger.info("Admin invite email sent to %s", to_email)
                return True
            except Exception as exc:
                code = getattr(exc, "errno", None) or getattr(exc, "winerror", None)
                detail = type(exc).__name__
                if code is not None:
                    detail = f"{detail} code={code}"
                logger.warning(
                    "Admin invite email failed at %s for %s using %s:%s: %s",
                    stage,
                    to_email,
                    smtp_host,
                    smtp_port,
                    detail,
                )
                failed_stages.append(f"smtp {stage}")

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        failed_stages.append("resend not configured")
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
                "subject": INVITE_EMAIL_SUBJECT,
                "text": text_body,
                "html": html_body,
            })
            # Some SDK versions surface provider errors as a response body
            # instead of raising. Only a clean response counts as submission.
            if isinstance(send_result, dict) and send_result.get("error"):
                raise RuntimeError("resend provider error")
            logger.info("Resend accepted admin invite for %s", to_email)
            return True
        except Exception as exc:
            logger.warning(
                "Resend admin invite failed for %s: %s", to_email, type(exc).__name__
            )
            failed_stages.append("resend send failed")

    logger.error(
        "Admin invite email delivery failed for %s - stages: %s",
        to_email,
        "; ".join(failed_stages),
    )
    return False


def _mark_invite_email_sent(admin_id) -> str | None:
    """Record successful invite delivery; tolerate a not-yet-applied column."""
    if not admin_id:
        return None
    sent_at = datetime.now(timezone.utc).isoformat()
    try:
        resp = execute_with_retry(
            supabase.table("admin_accounts")
            .update({INVITE_SENT_COLUMN: sent_at})
            .eq("admin_id", admin_id)
        )
        if getattr(resp, "error", None):
            logger.warning(
                "Could not record invite email timestamp for %s: supabase update error",
                admin_id,
            )
            return None
        return sent_at
    except Exception as exc:
        # The additive migration may not be applied yet. Delivery already
        # succeeded, so do not fail the request just because tracking is
        # unavailable.
        logger.warning(
            "Could not record invite email timestamp for %s: %s",
            admin_id,
            type(exc).__name__,
        )
        return None


def _find_admin_by_email(email: str):
    """Find an existing request by email, tolerating case/whitespace drift."""
    email = (email or "").strip().lower()
    if not email:
        return None

    # Fast path for rows written by the current normalized code.
    resp = execute_with_retry(
        supabase.table("admin_accounts").select("*").eq("email", email).limit(1)
    )
    if resp.data:
        return resp.data[0]

    # Older/live rows can have a different case or stray whitespace. Without
    # this normalized fallback, a resend misses the listed request and either
    # 409s on username or tries to insert a duplicate row. The roster is small
    # (list_admins already scans it), so a defensive scan is appropriate.
    all_rows = execute_with_retry(supabase.table("admin_accounts").select("*"))
    for row in all_rows.data or []:
        row_email = (row.get("email") or "").strip().lower()
        if row_email == email:
            return row
    return None


def _username_taken(username: str) -> bool:
    """Check username collisions without being fooled by legacy casing."""
    username = (username or "").strip().lower()
    if not username:
        return False

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id").eq("username", username).limit(1)
    )
    if resp.data:
        return True

    all_rows = execute_with_retry(supabase.table("admin_accounts").select("username"))
    return any(
        (row.get("username") or "").strip().lower() == username
        for row in all_rows.data or []
    )


def _derive_status(is_active: bool, has_app_account: bool) -> str:
    """Derive human-readable status from DB flags.

    - not is_active → pending (covers both new signup requests and old
      allowlist invites that haven't completed activation)
    - is_active + has_app_account → active
    - is_active but no app_account → pending (orphan, rare)
    """
    if is_active and has_app_account:
        return "active"
    if not is_active:
        return "pending"
    # is_active true but no app_account is treated as pending (orphan invite)
    return "pending"


def _validate_admin_email(email: str):
    # Normalize once so the Gmail exception match is case/whitespace safe.
    email = (email or "").strip().lower()
    if not email:
        return "Email is required."
    if not EMAIL_RE.match(email):
        return "Invalid email format."
    # Single explicit live-QA exception, same one the admin signup flow
    # accepts; every other address must be on the Gordon domain.
    if is_admin_signup_email_exception(email):
        return None
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        return f"Email must be @{ALLOWED_DOMAIN}"
    return None


@admin_mgmt_bp.route("/admins", methods=["GET"])
@require_admin
@handle_errors("list admins error")
def list_admins():
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        return error_response("Invalid page parameter", 400)
    try:
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        return error_response("Invalid page_size parameter", 400)
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    search = sanitize_search(request.args.get("search"))

    # "roster" (default) = active admins/staff shown in the main table.
    # "pending" = the Requests queue (new signups + accounts awaiting
    # re-approval). Anything else falls back to "roster".
    view = (request.args.get("view") or "roster").strip().lower()
    if view not in ("roster", "pending"):
        view = "roster"

    # Fetch every admin_accounts row matching the search rather than paging
    # at the DB level. Status is derived from a second table (app_accounts),
    # so the roster/pending split has to happen after that lookup — doing it
    # here (instead of client-side, post-pagination) keeps "total" and the
    # page slice consistent with what's actually displayed. A single campus
    # clinic's admin/staff roster is small (tens of rows), so fetching it in
    # full is cheap and simpler than expressing the join as SQL filters.
    query = supabase.table("admin_accounts").select("*").order("created_at", desc=True)
    if search:
        like = f"%{search}%"
        query = query.or_(
            f"email.ilike.{like},username.ilike.{like},first_name.ilike.{like},last_name.ilike.{like},role.ilike.{like}"
        )
    resp = execute_with_retry(query)
    rows = resp.data or []

    # Need has_app_account per row: fetch app_accounts admin_ids in one query
    admin_ids = [r["admin_id"] for r in rows if r.get("admin_id") is not None]
    has_account = set()
    if admin_ids:
        acct_resp = execute_with_retry(
            supabase.table("app_accounts").select("admin_id").in_("admin_id", admin_ids)
        )
        has_account = {r["admin_id"] for r in (acct_resp.data or []) if r.get("admin_id")}

    enriched = []
    for r in rows:
        aid = r.get("admin_id")
        is_invitation = bool((r.get(INVITE_TOKEN_COLUMN) or "").strip())
        enriched.append({
            "admin_id": aid,
            "username": r.get("username"),
            "email": r.get("email"),
            "first_name": r.get("first_name"),
            "last_name": r.get("last_name"),
            "middle_initial": r.get("middle_initial"),
            "suffix": r.get("suffix"),
            "role": r.get("role"),
            "license_no": r.get("license_no"),
            "is_active": r.get("is_active"),
            "status": _derive_status(bool(r.get("is_active")), aid in has_account),
            "is_invitation": is_invitation,
            "invitation_status": (
                "Invitation sent" if r.get(INVITE_SENT_COLUMN) else "Awaiting signup"
            ) if is_invitation else None,
            INVITE_SENT_COLUMN: r.get(INVITE_SENT_COLUMN),
        })

    counts = {
        "active": sum(1 for a in enriched if a["status"] == "active"),
        "pending": sum(1 for a in enriched if a["status"] == "pending"),
    }

    wanted_status = "pending" if view == "pending" else "active"
    matching = [a for a in enriched if a["status"] == wanted_status]
    total = len(matching)
    start = (page - 1) * page_size
    end = start + page_size
    admins = matching[start:end]

    return jsonify({
        "success": True,
        "count": len(admins),
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": counts,
        "admins": admins,
    }), 200


@admin_mgmt_bp.route("/admins/me", methods=["GET"])
@require_auth
@handle_errors("get own admin profile error")
def get_own_admin_profile():
    """Return the authenticated caller's own admin record.

    Uses ``require_auth`` (not ``require_admin``) so that pending users
    (is_active=False) can still retrieve their profile — the AdminLayout
    component needs this to distinguish "pending" from "not an admin".
    """
    auth_user_id = g.user.get("id")
    email = (g.user.get("email") or "").strip().lower()

    admin_row = None

    # Primary: resolve via app_accounts by auth_user_id → admin_id
    if auth_user_id:
        acct_resp = execute_with_retry(
            supabase.table("app_accounts")
            .select("admin_id")
            .eq("auth_user_id", auth_user_id)
            .limit(1)
        )
        if acct_resp.data and acct_resp.data[0].get("admin_id"):
            admin_id = acct_resp.data[0]["admin_id"]
            resp = execute_with_retry(
                supabase.table("admin_accounts")
                .select("*")
                .eq("admin_id", admin_id)
                .limit(1)
            )
            if resp.data:
                admin_row = resp.data[0]

    # Fallback: resolve by email (case-insensitive)
    if admin_row is None and email:
        resp = execute_with_retry(
            supabase.table("admin_accounts")
            .select("*")
            .ilike("email", email)
            .limit(1)
        )
        if resp.data:
            admin_row = resp.data[0]

    if admin_row is None:
        return jsonify({"success": False, "error": "Admin profile not found"}), 404

    # Check if an app_accounts row exists (needed for _derive_status)
    has_app_account = False
    aid = admin_row.get("admin_id")
    if aid:
        acct = execute_with_retry(
            supabase.table("app_accounts")
            .select("account_id")
            .eq("admin_id", aid)
            .limit(1)
        )
        has_app_account = bool(acct.data)

    return jsonify({
        "success": True,
        "admin": {
            "admin_id": admin_row.get("admin_id"),
            "email": admin_row.get("email"),
            "username": admin_row.get("username"),
            "first_name": admin_row.get("first_name"),
            "last_name": admin_row.get("last_name"),
            "middle_initial": admin_row.get("middle_initial"),
            "suffix": admin_row.get("suffix"),
            "role": admin_row.get("role"),
            "license_no": admin_row.get("license_no"),
            "is_active": admin_row.get("is_active"),
            "status": _derive_status(bool(admin_row.get("is_active")), has_app_account),
        },
    }), 200


@admin_mgmt_bp.route("/admins", methods=["POST"])
@require_admin
@require_super_admin
@handle_errors("add admin error")
def add_admin():
    """Invite a new admin, or send/resend an invite for an existing request.

    Super-admin only. A request row is never recreated or deleted; the
    response reports the real email-provider result via ``email_sent``.
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    role = (body.get("role") or "").strip().lower()
    explicit_resend = body.get("resend") is True

    err = _validate_admin_email(email)
    if err:
        return error_response(err, 400)
    if role not in ALLOWED_ADMIN_ROLES:
        return error_response("Role must be admin or super_admin", 400)

    # Existing pending request: reuse it instead of creating a duplicate.
    existing = _find_admin_by_email(email)
    if existing and existing.get("is_active"):
        return error_response("Email already exists", 409)

    if existing:
        invite_role = existing.get("role") or role
        if invite_role not in ALLOWED_ADMIN_ROLES:
            invite_role = role
        already_sent = bool(existing.get(INVITE_SENT_COLUMN))
        if already_sent and not explicit_resend:
            return jsonify({
                "success": True,
                "message": "Invite already sent. No duplicate request was created.",
                "email_sent": False,
                "already_sent": True,
                "created": False,
                "resent": False,
                "admin": existing,
            }), 200

        invite_token = _ensure_invitation_token(existing)
        if not _send_admin_invite_email(email, invite_role, invite_token):
            return jsonify({
                "success": False,
                "error": (
                    "Request already exists, but the invitation email could not "
                    "be sent. Use Resend invite in Requests to try again."
                ),
                "email_sent": False,
                "already_sent": already_sent,
                "created": False,
                "resent": explicit_resend,
                "admin": existing,
            }), 502

        sent_at = _mark_invite_email_sent(existing.get("admin_id"))
        if sent_at:
            existing[INVITE_SENT_COLUMN] = sent_at
        return jsonify({
            "success": True,
            "message": "Invite resent." if (explicit_resend or already_sent) else "Invite sent.",
            "email_sent": True,
            "already_sent": already_sent,
            "created": False,
            "resent": explicit_resend or already_sent,
            "admin": existing,
        }), 200

    username = email.split("@")[0]
    if _username_taken(username):
        return error_response("Email already exists", 409)

    inserted = execute_with_retry(
        supabase.table("admin_accounts").insert({
            "email": email,
            "username": username,
            "first_name": "",
            "last_name": "",
            "role": role,
            "is_active": False,
        })
    )
    row = (inserted.data or [None])[0]
    # Fallback fetch if insert did not return row (some supabase-py versions)
    if row is None:
        row = _find_admin_by_email(email) or {"email": email, "role": role, "is_active": False}

    invite_token = _ensure_invitation_token(row)

    # Preserve the pending request even when delivery fails; the super admin
    # can retry from Requests without creating another row.
    if not _send_admin_invite_email(email, role, invite_token):
        return jsonify({
            "success": False,
            "error": (
                "Invite request was created, but the email could not be sent. "
                "Resend it from Requests."
            ),
            "email_sent": False,
            "already_sent": False,
            "created": True,
            "resent": False,
            "admin": row,
        }), 502

    sent_at = _mark_invite_email_sent(row.get("admin_id"))
    if sent_at:
        row[INVITE_SENT_COLUMN] = sent_at
    return jsonify({
        "success": True,
        "message": "Invite sent.",
        "email_sent": True,
        "already_sent": False,
        "created": True,
        "resent": False,
        "admin": row,
    }), 201


# ============================================================
# ROLE UPDATE (super admin only)
# ============================================================


def _resolve_caller_admin_id():
    """Map the authenticated caller to their admin_accounts.admin_id.

    g.user is populated by require_admin from the verified token, so
    these are verified values. Resolution mirrors the guards:
    app_accounts by auth_user_id first, verified email fallback.
    """
    caller = getattr(g, "user", None) or {}
    auth_user_id = caller.get("id")
    email = (caller.get("email") or "").strip().lower()

    if auth_user_id:
        acct = execute_with_retry(
            supabase.table("app_accounts")
            .select("admin_id")
            .eq("auth_user_id", auth_user_id)
            .eq("account_type", "admin")
            .limit(1)
        )
        if acct.data and acct.data[0].get("admin_id"):
            return acct.data[0]["admin_id"]

    if email:
        acct = execute_with_retry(
            supabase.table("app_accounts")
            .select("admin_id")
            .eq("email", email)
            .eq("account_type", "admin")
            .limit(1)
        )
        if acct.data and acct.data[0].get("admin_id"):
            return acct.data[0]["admin_id"]

    return None


@admin_mgmt_bp.route("/admins/<admin_id>/role", methods=["PATCH"])
@require_admin
@require_super_admin
@handle_errors("update admin role error")
def update_admin_role(admin_id):
    """Change another admin's access role. Super-admin only.

    Body: ``{"role": "admin" | "super_admin"}``. The target role is the
    only thing read from the body, and it must be one of the two allowed
    values; the caller's own super_admin status was already verified
    from the database by require_super_admin.
    """
    body = request.get_json(silent=True) or {}
    role = (body.get("role") or "").strip().lower()
    if role not in ALLOWED_ADMIN_ROLES:
        return error_response("Role must be admin or super_admin", 400)

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("*").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)
    row = resp.data[0]

    # Self-role-change guard: resolve the caller's admin_id the same way
    # the guards do, with a direct email match on the target row as a
    # last resort when the app_accounts link is missing.
    caller_admin_id = _resolve_caller_admin_id()
    if caller_admin_id is not None and str(caller_admin_id) == str(admin_id):
        return error_response("Cannot change your own role", 403)
    caller_email = ((getattr(g, "user", None) or {}).get("email") or "").strip().lower()
    target_email = (row.get("email") or "").strip().lower()
    if caller_email and target_email == caller_email:
        return error_response("Cannot change your own role", 403)

    execute_with_retry(
        supabase.table("admin_accounts").update({"role": role}).eq("admin_id", admin_id)
    )
    row = {**row, "role": role}
    return jsonify({"success": True, "message": "Admin role updated", "admin": row}), 200


# ============================================================
# DEACTIVATE / ACTIVATE / HARD DELETE
# ============================================================


@admin_mgmt_bp.route("/admins/<admin_id>/deactivate", methods=["PATCH"])
@require_admin
@handle_errors("deactivate admin error")
def deactivate_admin(admin_id):
    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)
    row = resp.data[0]
    if not row.get("is_active"):
        return jsonify({"success": True, "message": "Admin already inactive", "admin": row}), 200

    execute_with_retry(
        supabase.table("admin_accounts").update({"is_active": False}).eq("admin_id", admin_id)
    )
    row["is_active"] = False
    return jsonify({"success": True, "message": "Admin deactivated", "admin": row}), 200


@admin_mgmt_bp.route("/admins/<admin_id>/activate", methods=["PATCH"])
@require_admin
@handle_errors("activate admin error")
def activate_admin(admin_id):
    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active, email").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)
    row = resp.data[0]
    if row.get("is_active"):
        return jsonify({"success": True, "message": "Admin already active", "admin": row}), 200

    # Requires existing app_accounts (else pending must complete signup)
    acct = execute_with_retry(
        supabase.table("app_accounts").select("account_id").eq("admin_id", admin_id).limit(1)
    )
    if not acct.data:
        # Also check by email fallback
        admin_full = execute_with_retry(
            supabase.table("admin_accounts").select("email").eq("admin_id", admin_id).limit(1)
        )
        email = (admin_full.data[0].get("email") if admin_full.data else None)
        if email:
            acct2 = execute_with_retry(
                supabase.table("app_accounts").select("account_id").eq("email", email).limit(1)
            )
            if not acct2.data:
                return error_response("Pending — must complete signup", 409)
        else:
            return error_response("Pending — must complete signup", 409)

    execute_with_retry(
        supabase.table("admin_accounts").update({"is_active": True}).eq("admin_id", admin_id)
    )
    row["is_active"] = True
    notification_sent = _send_admin_decision_email(row.get("email"), True)
    return jsonify({
        "success": True,
        "message": "Admin activated",
        "admin": row,
        "notification_sent": notification_sent,
    }), 200


@admin_mgmt_bp.route("/admins/<admin_id>", methods=["DELETE"])
@require_admin
@handle_errors("delete admin error")
def delete_admin(admin_id):
    body = request.get_json(silent=True) or {}
    confirm_email = (body.get("confirmEmail") or "").strip().lower()
    if not confirm_email:
        return error_response("Please type the admin email to confirm", 400)

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, email").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)
    row = resp.data[0]
    row_email = (row.get("email") or "").strip().lower()
    if confirm_email != row_email:
        return error_response("Please type the admin email to confirm", 400)

    # Self-delete guard: id or email matches caller
    caller_id = getattr(g, "user", {}).get("id")
    caller_email = (getattr(g, "user", {}).get("email") or "").strip().lower()
    if str(admin_id) == str(caller_id) or row_email == caller_email:
        return jsonify({"success": False, "error": "Cannot delete yourself"}), 403

    # Also block self-delete via app_accounts admin_id match
    if caller_id:
        caller_acct = execute_with_retry(
            supabase.table("app_accounts").select("admin_id").eq("auth_user_id", caller_id).limit(1)
        )
        if caller_acct.data and str(caller_acct.data[0].get("admin_id")) == str(admin_id):
            return jsonify({"success": False, "error": "Cannot delete yourself"}), 403

    # If app_accounts exists, delete auth user then app_accounts row
    acct = execute_with_retry(
        supabase.table("app_accounts").select("auth_user_id, account_id").eq("admin_id", admin_id).limit(1)
    )
    # Fallback by email if admin_id not matched
    if not acct.data and row_email:
        acct = execute_with_retry(
            supabase.table("app_accounts").select("auth_user_id, account_id").eq("email", row_email).limit(1)
        )
    if acct.data:
        auth_user_id = acct.data[0].get("auth_user_id")
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception as exc:
                logger.warning("Failed to delete auth user %s: %r", auth_user_id, exc)
        execute_with_retry(
            supabase.table("app_accounts").delete().eq("account_id", acct.data[0]["account_id"])
        )

    execute_with_retry(
        supabase.table("admin_accounts").delete().eq("admin_id", admin_id)
    )
    notification_sent = _send_admin_decision_email(row_email, False)
    return jsonify({
        "success": True,
        "message": "Admin deleted",
        "notification_sent": notification_sent,
    }), 200


# ============================================================
# PROFILE UPDATE (self or any active admin)
# ============================================================


@admin_mgmt_bp.route("/admins/<admin_id>/profile", methods=["PATCH"])
@require_admin
@handle_errors("update admin profile error")
def update_admin_profile(admin_id):
    body = request.get_json(silent=True) or {}

    updates = {}
    if "first_name" in body:
        first_name = (body.get("first_name") or "").strip()
        if not first_name:
            return error_response("First name is required.", 400)
        updates["first_name"] = first_name
    if "last_name" in body:
        last_name = (body.get("last_name") or "").strip()
        if not last_name:
            return error_response("Last name is required.", 400)
        updates["last_name"] = last_name
    if "middle_initial" in body:
        middle_raw = body.get("middle_initial")
        if not is_valid_admin_middle_initial(middle_raw):
            return error_response(
                "Middle initial must be a single letter, optionally followed by a period.",
                400,
            )
        # Empty clears the stored value; omitting the key would preserve it.
        updates["middle_initial"] = normalize_admin_middle_initial(middle_raw)
    if "suffix" in body:
        suffix = str(body.get("suffix") or "").strip()
        if len(suffix) > ADMIN_SUFFIX_MAX:
            return error_response(f"Suffix must be {ADMIN_SUFFIX_MAX} characters or fewer.", 400)
        updates["suffix"] = suffix or None
    if "license_no" in body:
        updates["license_no"] = (body.get("license_no") or "").strip() or None

    # Role is managed separately — block any attempt to change it here.
    if "role" in body:
        return error_response(
            "Role cannot be changed here. Use PATCH /api/admins/<admin_id>/role.",
            400,
        )

    if not updates:
        return error_response("No fields to update.", 400)

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, email, username, first_name, last_name, middle_initial, suffix, role, license_no, is_active").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)

    execute_with_retry(
        supabase.table("admin_accounts").update(updates).eq("admin_id", admin_id)
    )
    row = {**resp.data[0], **updates}
    return jsonify({"success": True, "message": "Profile updated", "admin": row}), 200
