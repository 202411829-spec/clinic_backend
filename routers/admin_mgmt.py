import re
import logging

from flask import Blueprint, jsonify, request, g

from database import supabase
from routers.auth_guard import require_admin, sanitize_search
from routers.helpers import execute_with_retry, error_response, handle_errors

logger = logging.getLogger(__name__)

admin_mgmt_bp = Blueprint("admin_mgmt", __name__, url_prefix="/api")

ALLOWED_ADMIN_ROLES = {"nurse", "doctor"}
ALLOWED_DOMAIN = "gordoncollege.edu.ph"
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _derive_status(is_active: bool, has_app_account: bool) -> str:
    if not is_active and not has_app_account:
        return "pending"
    if is_active and has_app_account:
        return "active"
    if not is_active and has_app_account:
        return "inactive"
    # is_active true but no app_account is treated as pending (orphan invite)
    return "pending"


def _validate_admin_email(email: str):
    if not email:
        return "Email is required."
    if not EMAIL_RE.match(email):
        return "Invalid email format."
    if not email.lower().endswith(f"@{ALLOWED_DOMAIN}"):
        return f"Email must be @{ALLOWED_DOMAIN}"
    return None


@admin_mgmt_bp.route("/admins", methods=["GET"])
@require_admin
@handle_errors("list admins error")
def list_admins():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    page_size = max(1, min(page_size, 100))
    search = sanitize_search(request.args.get("search"))

    # Fetch admin_accounts with pagination; need total count for header
    query = supabase.table("admin_accounts").select("*", count="exact").order("created_at", desc=True)
    if search:
        like = f"%{search}%"
        query = query.or_(
            f"email.ilike.{like},username.ilike.{like},first_name.ilike.{like},last_name.ilike.{like},role.ilike.{like}"
        )
    start = (page - 1) * page_size
    end = start + page_size - 1
    query = query.range(start, end)
    resp = execute_with_retry(query)
    rows = resp.data or []
    total = resp.count or 0

    # Need has_app_account per row: fetch app_accounts admin_ids in one query
    admin_ids = [r["admin_id"] for r in rows if r.get("admin_id") is not None]
    has_account = set()
    if admin_ids:
        acct_resp = execute_with_retry(
            supabase.table("app_accounts").select("admin_id").in_("admin_id", admin_ids)
        )
        has_account = {r["admin_id"] for r in (acct_resp.data or []) if r.get("admin_id")}

    admins = []
    for r in rows:
        aid = r.get("admin_id")
        admins.append({
            "admin_id": aid,
            "username": r.get("username"),
            "email": r.get("email"),
            "first_name": r.get("first_name"),
            "last_name": r.get("last_name"),
            "role": r.get("role"),
            "license_no": r.get("license_no"),
            "is_active": r.get("is_active"),
            "status": _derive_status(bool(r.get("is_active")), aid in has_account),
        })

    return jsonify({
        "success": True,
        "count": len(admins),
        "total": total,
        "page": page,
        "page_size": page_size,
        "admins": admins,
    }), 200


@admin_mgmt_bp.route("/admins", methods=["POST"])
@require_admin
@handle_errors("add admin error")
def add_admin():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    role = (body.get("role") or "").strip().lower()

    err = _validate_admin_email(email)
    if err:
        return error_response(err, 400)
    if role not in ALLOWED_ADMIN_ROLES:
        return error_response("Role must be nurse or doctor", 400)

    # Duplicate email check
    existing = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id").eq("email", email).limit(1)
    )
    if existing.data:
        return error_response("Email already exists", 409)

    username = email.split("@")[0]
    # Duplicate username check (local-part)
    existing_user = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id").eq("username", username).limit(1)
    )
    if existing_user.data:
        return error_response("Email already exists", 409)

    inserted = execute_with_retry(
        supabase.table("admin_accounts").insert({
            "email": email,
            "username": username,
            "role": role,
            "is_active": False,
        }).select("*")
    )
    row = (inserted.data or [None])[0]
    return jsonify({"success": True, "message": "Admin invite created", "admin": row}), 201
