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

    updated = execute_with_retry(
        supabase.table("admin_accounts").update({"is_active": False}).eq("admin_id", admin_id).select("*")
    )
    admin = (updated.data or [None])[0] or row
    return jsonify({"success": True, "message": "Admin deactivated", "admin": admin}), 200


@admin_mgmt_bp.route("/admins/<admin_id>/activate", methods=["PATCH"])
@require_admin
@handle_errors("activate admin error")
def activate_admin(admin_id):
    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id, is_active").eq("admin_id", admin_id).limit(1)
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

    updated = execute_with_retry(
        supabase.table("admin_accounts").update({"is_active": True}).eq("admin_id", admin_id).select("*")
    )
    admin = (updated.data or [None])[0] or row
    return jsonify({"success": True, "message": "Admin activated", "admin": admin}), 200


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
    return jsonify({"success": True, "message": "Admin deleted"}), 200


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
    if "license_no" in body:
        updates["license_no"] = (body.get("license_no") or "").strip() or None

    # Role is read-only in the UI — block any attempt to change it here.
    if "role" in body:
        return error_response("Role cannot be changed here. Use Admins management.", 400)

    if not updates:
        return error_response("No fields to update.", 400)

    resp = execute_with_retry(
        supabase.table("admin_accounts").select("admin_id").eq("admin_id", admin_id).limit(1)
    )
    if not resp.data:
        return error_response("Admin not found", 404)

    updated = execute_with_retry(
        supabase.table("admin_accounts").update(updates).eq("admin_id", admin_id).select("*")
    )
    row = (updated.data or [None])[0]
    return jsonify({"success": True, "message": "Profile updated", "admin": row}), 200
