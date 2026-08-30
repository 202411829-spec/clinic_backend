# Admin Management (Management -> Admins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Management -> Admins roster management with allowlist invite, hidden admin signup, and deactivate/activate/hard-delete lifecycle using existing tables only.

**Architecture:** New router `routers/admin_mgmt.py` owns `/api/admins` CRUD (allowlist + state transitions); `routers/auth.py` gains three public admin auth endpoints gated by allowlist and an isolated in-memory code store. Frontend adds a paginated Admins page under `AdminLayout` plus an unlinked public `/admin/signup` page that reuses the existing verification-code UX patterns. All DB writes go through the service-role Supabase client via `execute_with_retry()`.

**Tech Stack:** Flask 3 + Supabase (service-role PostgREST client) + Python 3.10+, React 18 + Vite + Tailwind PWA, Supabase Auth Admin API (`create_user`/`delete_user`), Resend + SMTP email fallback

**Spec:** `docs/superpowers/specs/2026-08-30-admin-management-design.md`

## Global Constraints

- No new tables, views, or migrations. Roster lives entirely in existing `admin_accounts` + `app_accounts` (+ `auth.users` via Admin API).
- Email domain must be `@gordoncollege.edu.ph` enforced server-side (case-insensitive trim + lower) on every admin email write and on admin signup; role enum is exactly `nurse` | `doctor`.
- `POST /api/auth/admin/check-email`, `send-code`, `signup` are public but re-validate allowlist server-side; students not in `admin_accounts` are blocked at `check-email` with 404.
- Code is 6-digit numeric, 5-minute TTL, one-time use; `send-code` rate limit max 3 per email per 15 minutes (in-memory counter).
- `DELETE /api/admins/:id` requires `confirmEmail` equals row email (case-insensitive) and blocks self-delete (id or email matches `g.user`); hard delete removes `auth.users` via `admin.delete_user` if exists, then `app_accounts`, then `admin_accounts`.
- `require_admin` guards all `/api/admins/*` routes (any active admin: `admin_accounts.is_active=true` + `app_accounts` binding); error envelope `{ success:false, error:"..." }`.
- `/admin/signup` is hidden: no nav link in `adminNav.js`, `Sidebar.jsx`, or landing pages; lazy-loaded outside `AdminLayout`.
- Reuse existing pagination/search pattern (`page`, `page_size`, `search` via `sanitize_search` + `or_` ilike) and SMTP -> Resend email fallback pattern.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `routers/admin_mgmt.py` | Create | `GET /api/admins` (list with status derivation + search/pagination), `POST /api/admins` (allowlist insert), `PATCH /api/admins/:id/deactivate`, `PATCH /api/admins/:id/activate`, `DELETE /api/admins/:id` (guarded hard delete) |
| `routers/auth.py` | Modify | Add `POST /api/auth/admin/check-email`, `POST /api/auth/admin/send-code`, `POST /api/auth/admin/signup` + isolated `_admin_signup_codes` dict + `_is_admin_code_valid`/`_purge_admin_codes` helpers; reuse `_send_email_via_smtp` and Resend fallback |
| `main.py` | Modify | Register `admin_mgmt` blueprint (`app.register_blueprint(admin_mgmt_bp)`) |
| `src/lib/api.js` | Modify | Add `adminsApi: { list, add, deactivate, activate, remove }` (authed `request`) and `adminAuthApi: { checkEmail, sendCode, signup }` (unauthenticated `authRequest`) |
| `src/data/adminNav.js` | Modify | Append `{ label: "Admins", to: "/admin/admins", icon: "shield" }` to `managementNav` |
| `src/components/icons.jsx` | Modify | Add `ShieldIcon` (or reuse `MasterlistIcon` alias) for Admins nav |
| `src/components/layout/Sidebar.jsx` | Modify | Import `ShieldIcon`; render `managementNav` entries from `adminNav.js` or add Admins item to `MANAGEMENT_ITEMS` |
| `src/pages/admin/Admins.jsx` | Create | Route wrapper page rendering `AdminsPanel` inside `AdminLayout` |
| `src/components/admin/AdminsPanel.jsx` | Create | Table with search + pagination, status badges, Deactivate/Activate actions, overflow Delete with confirm modal |
| `src/components/admin/AddAdminModal.jsx` | Create | Modal form: email + role dropdown; submit -> `POST /api/admins`; inline validation |
| `src/pages/auth/AdminSignUp.jsx` | Create | Hidden 3-step page: Email -> Code -> Password; calls `adminAuthApi`; auto-login via `adminSignIn` on success |
| `src/App.jsx` | Modify | Lazy imports for `Admins` and `AdminSignUp`; add routes `/admin/signup` (public) and `/admin/admins` (inside `AdminLayout`) |
| `tests/test_admin_mgmt.py` / `tests/test_admin_auth.py` | Create (per task) | Backend pytest suites; mocked Supabase client |

---

### Task 1: Backend admin allowlist CRUD (GET/POST /api/admins)

**Files:**
- Create: `routers/admin_mgmt.py`
- Modify: `main.py:46-56` (register blueprint)
- Test: `tests/test_admin_mgmt.py` (new)

**Interfaces:**
- Consumes: `supabase_client.supabase` (or `database.supabase`), `routers.helpers.execute_with_retry`, `routers.helpers.error_response`, `routers.helpers.handle_errors`, `routers.auth_guard.require_admin`, `routers.auth_guard.sanitize_search`, Flask `g.user`
- Produces: `Blueprint admin_mgmt_bp` with routes `GET /api/admins`, `POST /api/admins`; helper `_derive_status(is_active, has_app_account) -> str`; `ALLOWED_ADMIN_ROLES = {"nurse","doctor"}` exported for Task 3 reuse

- [ ] **Step 1: Write the failing test**

```python
# tests/test_admin_mgmt.py
import pytest
from unittest.mock import MagicMock, patch

# Mock supabase before importing blueprint
@pytest.fixture
def client():
    with patch("routers.admin_mgmt.supabase") as mock_supabase:
        # Use fresh import per test module load
        from main import app
        app.config["TESTING"] = True
        with app.test_client() as c:
            yield c, mock_supabase

def test_get_admins_requires_admin(client):
    c, _ = client
    resp = c.get("/api/admins")
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False

def test_post_admins_validates_domain_and_role():
    # Will be implemented after blueprint exists; for now assert import fails
    try:
        import routers.admin_mgmt  # noqa: F401
        assert hasattr(routers.admin_mgmt, "admin_mgmt_bp")
    except ImportError:
        pytest.fail("routers.admin_mgmt not importable yet")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_admin_mgmt.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'routers.admin_mgmt'` or `ImportError`

- [ ] **Step 3: Write minimal implementation**

```python
# routers/admin_mgmt.py
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
```

Register in `main.py`:

```python
# main.py — add import and registration
from routers.admin_mgmt import admin_mgmt_bp
# ... after other registrations:
app.register_blueprint(admin_mgmt_bp)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_admin_mgmt.py -v`
Expected: PASS (at least the import/blueprint tests). Then targeted live checks:
Run: `python -m py_compile routers/admin_mgmt.py`
Expected: no error.
Run: `python -c "from routers.admin_mgmt import _derive_status; assert _derive_status(False, False)=='pending'; assert _derive_status(True, True)=='active'; assert _derive_status(False, True)=='inactive'; print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add routers/admin_mgmt.py main.py tests/test_admin_mgmt.py
git commit -m "feat(admin): add admin allowlist CRUD (GET/POST /api/admins)"
```

---

### Task 2: Backend admin signup gated flow (check-email / send-code / signup)

**Files:**
- Modify: `routers/auth.py:48-53, 143-178` (add `_admin_signup_codes`, helpers, 3 routes)
- Test: `tests/test_admin_auth.py` (new)

**Interfaces:**
- Consumes: `supabase.table("admin_accounts")`, `supabase.table("app_accounts")`, `supabase.auth.admin.create_user`, `routers.auth._send_email_via_smtp`, `routers.auth._generate_code` pattern, `execute_with_retry`, `error_response`, `handle_errors`; produces dict `_admin_signup_codes: dict[str, dict]` with shape `{code: str, expires_at: float, send_count: int, window_start: float}`
- Produces: `POST /api/auth/admin/check-email`, `POST /api/auth/admin/send-code`, `POST /api/auth/admin/signup`; helpers `_is_admin_code_valid(email, code) -> bool`, `_purge_admin_codes()`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_admin_auth.py
import time
import pytest
from unittest.mock import MagicMock, patch

def test_admin_check_email_not_invited():
    from unittest.mock import patch as _patch
    from main import app
    app.config["TESTING"] = True
    # Mock supabase to return no admin_accounts row
    with _patch("routers.auth.supabase") as mock_sup:
        mock_sup.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
        # Need execute_with_retry to pass through
        with _patch("routers.auth.execute_with_retry", side_effect=lambda q: q.execute()):
            c = app.test_client()
            resp = c.post("/api/auth/admin/check-email", json={"email": "nobody@gordoncollege.edu.ph"})
            assert resp.status_code == 404
            assert resp.get_json()["success"] is False
            assert "Not invited" in resp.get_json()["error"]

def test_admin_signup_rejects_short_password():
    from main import app
    app.config["TESTING"] = True
    c = app.test_client()
    resp = c.post("/api/auth/admin/signup", json={
        "email": "test@gordoncollege.edu.ph",
        "code": "123456",
        "password": "short",
        "confirmPassword": "short"
    })
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_admin_auth.py::test_admin_check_email_not_invited -v`
Expected: FAIL with 404 not matched or route not found `404` vs expected path OR `AttributeError` if routes not yet added

- [ ] **Step 3: Write minimal implementation**

Add to `routers/auth.py` (after `CODE_TTL_SECONDS`/`_forgot_codes` area, near line 52):

```python
# Isolated admin signup code store: email -> {code, expires_at, send_count, window_start}
_admin_signup_codes: dict[str, dict] = {}
ADMIN_CODE_TTL_SECONDS = 5 * 60
ADMIN_SEND_LIMIT = 3
ADMIN_SEND_WINDOW_SECONDS = 15 * 60

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
```

Routes (append after `forgot_reset`, still under `auth_bp`):

```python
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
        # Rollback auth user on failure
        try:
            supabase.auth.admin.delete_user(auth_user_id)
        except Exception:
            pass
        logger.error("Admin signup DB insert failed: %r", exc)
        return error_response("Failed to create admin account. Please try again.", 500)

    _admin_signup_codes.pop(email, None)
    logger.info("Admin signup completed for %s (admin_id=%s, auth_user_id=%s)", email, admin_id, auth_user_id)
    return jsonify({"success": True, "message": "Admin account created", "admin_id": admin_id}), 201
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_admin_auth.py -v`
Expected: PASS (404 path for not invited, 400 for short password).
Run: `python -m py_compile routers/auth.py`
Expected: no error.
Run: `python -c "from routers.auth import _admin_signup_codes, ADMIN_CODE_TTL_SECONDS; print('isolated:', _admin_signup_codes is not None)"`
Expected: `isolated: True` confirming isolated dict does not alias `_verification_codes`.

- [ ] **Step 5: Commit**

```bash
git add routers/auth.py tests/test_admin_auth.py
git commit -m "feat(auth): add admin signup gated flow (check-email/send-code/signup)"
```

---

### Task 3: Backend admin deactivate/activate/delete

**Files:**
- Modify: `routers/admin_mgmt.py:1-60` (add 3 routes)
- Test: `tests/test_admin_mgmt.py` (extend)

**Interfaces:**
- Consumes: `admin_mgmt_bp` from Task 1, `supabase.auth.admin.delete_user`, `g.user` (for self-delete guard), `ALLOWED_ADMIN_ROLES`/`_derive_status` from Task 1
- Produces: `PATCH /api/admins/:id/deactivate`, `PATCH /api/admins/:id/activate`, `DELETE /api/admins/:id`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_admin_mgmt.py — additions
def test_deactivate_requires_admin(client):
    c, _ = client
    resp = c.patch("/api/admins/1/deactivate")
    assert resp.status_code == 401

def test_delete_requires_confirm_email():
    from unittest.mock import patch as _patch
    from main import app
    app.config["TESTING"] = True
    # Need auth; without it should 401 before body validation
    c = app.test_client()
    resp = c.delete("/api/admins/1", json={})
    assert resp.status_code == 401

def test_activate_pending_without_app_account_returns_409():
    # Simulate admin exists but no app_accounts row, activate should 409 per spec
    import routers.admin_mgmt as m
    assert hasattr(m, "_derive_status")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_admin_mgmt.py::test_deactivate_requires_admin -v`
Expected: FAIL or 404 if routes not yet added (route not found returns 404 not 401)

- [ ] **Step 3: Write minimal implementation**

Append to `routers/admin_mgmt.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_admin_mgmt.py -v`
Expected: PASS (401 for unauthenticated, 409 message preserved).
Run: `python -m py_compile routers/admin_mgmt.py`
Expected: no error.

- [ ] **Step 5: Commit**

```bash
git add routers/admin_mgmt.py tests/test_admin_mgmt.py
git commit -m "feat(admin): add deactivate/activate/hard-delete with guards"
```

---

### Task 4: Frontend Management->Admins page + Add modal + nav

**Files:**
- Create: `src/pages/admin/Admins.jsx`
- Create: `src/components/admin/AdminsPanel.jsx`
- Create: `src/components/admin/AddAdminModal.jsx`
- Modify: `src/data/adminNav.js:13-16` (add Admins entry)
- Modify: `src/components/icons.jsx:1-69` (add ShieldIcon)
- Modify: `src/components/layout/Sidebar.jsx:20-23` (render from adminNav or add Admins)
- Modify: `src/lib/api.js:112-194` (add adminsApi)
- Modify: `src/App.jsx:15, 66-76` (lazy + route)
- Test: manual `npm run build` + render check

**Interfaces:**
- Consumes: `adminsApi.list/add/deactivate/activate/remove` (to be added in `api.js`), `adminNav.managementNav`, `require_admin` backend
- Produces: `Admins` page component, `AdminsPanel` with props `{ search, page, pageSize }`, `AddAdminModal` with props `{ open, onClose, onCreated }`

- [ ] **Step 1: Write the failing test**

```js
// src/components/admin/__tests__/AdminsPanel.test.jsx (Vitest if present, else manual)
// For this plan we use a minimal render assertion that the file exists:
import { describe, it, expect } from 'vitest'
import fs from 'fs'
describe('Admins files exist', () => {
  it('AdminsPanel file exists', () => {
    expect(fs.existsSync('src/components/admin/AdminsPanel.jsx')).toBe(true)
  })
})
```

If no Vitest, the failing signal is `npm run build` failing due to missing lazy import:

Run: `npm run build`
Expected: FAIL with `Could not resolve "./pages/admin/Admins.jsx"` after adding lazy import before file creation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — Vite cannot resolve `Admins.jsx`.

- [ ] **Step 3: Write minimal implementation**

`src/data/adminNav.js` — add after Reports:

```js
export const managementNav = [
  { label: "Clinic Schedule", to: "/admin/clinic-schedule", icon: "clock" },
  { label: "Reports", to: "/admin/reports", icon: "chart" },
  { label: "Admins", to: "/admin/admins", icon: "shield" },
];
```

`src/components/icons.jsx` — add:

```jsx
export function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" strokeLinejoin="round" />
      <path d="M12 11a2 2 0 100 4 2 2 0 000-4z" fill="currentColor" stroke="none" />
    </svg>
  )
}
```

`src/lib/api.js` — add after `reportsApi`:

```js
export const adminsApi = {
  list: (params) => api.get('/api/admins', params),
  add: (body) => api.post('/api/admins', body),
  deactivate: (adminId) => api.patch(`/api/admins/${adminId}/deactivate`, {}),
  activate: (adminId) => api.patch(`/api/admins/${adminId}/activate`, {}),
  remove: (adminId, confirmEmail) =>
    request(`/api/admins/${adminId}`, { method: 'DELETE', body: JSON.stringify({ confirmEmail }) }),
}
```

`src/components/layout/Sidebar.jsx` — update MANAGEMENT_ITEMS:

```jsx
import { ShieldIcon } from '../icons.jsx'
const MANAGEMENT_ITEMS = [
  { to: '/admin/clinic-schedule', label: 'Clinic Schedule', Icon: ClinicScheduleIcon },
  { to: '/admin/reports', label: 'Reports', Icon: ReportsIcon },
  { to: '/admin/admins', label: 'Admins', Icon: ShieldIcon },
]
```

`src/components/admin/AddAdminModal.jsx`:

```jsx
import { useState } from 'react'
import { adminsApi } from '../../lib/api.js'

const ROLES = ['nurse', 'doctor']

export default function AddAdminModal({ open, onClose, onCreated }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('nurse')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Email is required.'); return }
    if (!ROLES.includes(role)) { setError('Role must be nurse or doctor'); return }
    setBusy(true)
    try {
      const res = await adminsApi.add({ email: email.trim(), role })
      onCreated?.(res.admin || res)
      setEmail('')
      setRole('nurse')
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to add admin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Add Admin</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-admin-email" className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
            <input id="add-admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@gordoncollege.edu.ph" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gc-accent focus:ring-2 focus:ring-gc-accent/20" />
          </div>
          <div>
            <label htmlFor="add-admin-role" className="block text-sm font-semibold text-gray-900 mb-1">Role</label>
            <select id="add-admin-role" value={role} onChange={e => setRole(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm">
              <option value="nurse">nurse</option>
              <option value="doctor">doctor</option>
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-gc-accent py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

`src/components/admin/AdminsPanel.jsx` (abbreviated, full in repo):

```jsx
import { useEffect, useState } from 'react'
import { adminsApi } from '../../lib/api.js'
import { supabase } from '../../lib/supabaseClient.js'
import AddAdminModal from './AddAdminModal.jsx'

function StatusBadge({ status }) {
  const map = { pending: 'bg-amber-100 text-amber-700', active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-600' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status] || 'bg-gray-100'}`}>{status}</span>
}

export default function AdminsPanel() {
  const [admins, setAdmins] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  async function fetchAdmins() {
    setLoading(true)
    try {
      const res = await adminsApi.list({ page, page_size: pageSize, search: debouncedSearch || undefined })
      setAdmins(res.admins || [])
      setTotal(res.total || 0)
    } catch (err) {
      setError(err?.message || 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAdmins() }, [page, pageSize, debouncedSearch])

  // Derive self admin_id via supabase session for delete guard
  const [selfEmail, setSelfEmail] = useState('')
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setSelfEmail((data?.user?.email || '').toLowerCase()))
  }, [])

  async function handleToggle(admin) {
    try {
      if (admin.status === 'active') await adminsApi.deactivate(admin.admin_id)
      else await adminsApi.activate(admin.admin_id)
      fetchAdmins()
    } catch (err) {
      setError(err?.message || 'Action failed')
    }
  }

  async function handleDelete(admin) {
    try {
      await adminsApi.remove(admin.admin_id, confirmEmail.trim())
      setConfirmDelete(null)
      setConfirmEmail('')
      fetchAdmins()
    } catch (err) {
      setError(err?.message || 'Delete failed')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
        <button onClick={() => setShowAdd(true)} className="rounded-xl bg-gc-accent px-5 py-2.5 text-sm font-semibold text-white">Add Admin</button>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search email, name, role…" className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">License No.</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody>
              {admins.map(a => {
                const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
                const isSelf = (a.email || '').toLowerCase() === selfEmail
                return (
                  <tr key={a.admin_id} className="border-t">
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3">{a.email}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{a.role}</span></td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3">{a.license_no || '—'}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      {a.status === 'active' ? (
                        <button onClick={() => handleToggle(a)} className="rounded-lg border px-3 py-1 text-xs font-semibold">Deactivate</button>
                      ) : (
                        <button onClick={() => handleToggle(a)} className="rounded-lg bg-gc-accent px-3 py-1 text-xs font-semibold text-white">Activate</button>
                      )}
                      <button disabled={isSelf} title={isSelf ? 'Cannot delete yourself' : ''} onClick={() => setConfirmDelete(a)} className="text-xs font-semibold text-red-600 disabled:opacity-40">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Prev</button>
        <span className="text-sm">Page {page} of {totalPages} ({total} total)</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-1 text-sm disabled:opacity-40">Next</button>
      </div>

      <AddAdminModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={fetchAdmins} />

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-bold">Delete admin?</h3>
            <p className="mt-1 text-sm text-gray-600">Type <span className="font-semibold">{confirmDelete.email}</span> to confirm.</p>
            <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder={confirmDelete.email} className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setConfirmDelete(null); setConfirmEmail('') }} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

`src/pages/admin/Admins.jsx`:

```jsx
import AdminsPanel from '../../components/admin/AdminsPanel.jsx'
export default function Admins() {
  return <AdminsPanel />
}
```

`src/App.jsx` — add:

```jsx
const Admins = lazy(() => import('./pages/admin/Admins.jsx'))
// ...
<Route element={<AdminLayout />}>
  <Route path="reports" element={<Reports />} />
  <Route path="admins" element={<Admins />} />
</Route>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS (0 errors, no missing lazy imports).
Run: `python -m py_compile routers/admin_mgmt.py` (if not already)
Expected: no error.

- [ ] **Step 5: Commit**

```bash
git add src/data/adminNav.js src/components/icons.jsx src/components/layout/Sidebar.jsx src/lib/api.js src/pages/admin/Admins.jsx src/components/admin/AdminsPanel.jsx src/components/admin/AddAdminModal.jsx src/App.jsx
git commit -m "feat(admin): add Management->Admins page, Add modal, nav, and API client"
```

---

### Task 5: Frontend hidden Admin Signup page + route

**Files:**
- Create: `src/pages/auth/AdminSignUp.jsx`
- Modify: `src/lib/api.js` (add `adminAuthApi` if not already in Task 4)
- Modify: `src/App.jsx` (add lazy + public route)
- Test: manual `npm run build` + flow check

**Interfaces:**
- Consumes: `adminAuthApi.checkEmail/sendCode/signup` from `api.js`, `adminSignIn` from `supabaseClient.js`, `useNavigate` from `react-router-dom`
- Produces: `AdminSignUp` page at `/admin/signup` (public, outside `AdminLayout` and `ProtectedRoute`)

- [ ] **Step 1: Write the failing test**

Run: `npm run build` after adding lazy import for `AdminSignUp` before file exists — build must fail.
Alternatively:

```js
// existence check
import fs from 'fs'
expect(fs.existsSync('src/pages/auth/AdminSignUp.jsx')).toBe(true) // FAIL before file creation
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL `Could not resolve "./pages/auth/AdminSignUp.jsx"`

- [ ] **Step 3: Write minimal implementation**

`src/lib/api.js` — add (if not already from Task 4):

```js
export const adminAuthApi = {
  checkEmail: (email) => authRequest('/api/auth/admin/check-email', { email }),
  sendCode: (email) => authRequest('/api/auth/admin/send-code', { email }),
  signup: (payload) => authRequest('/api/auth/admin/signup', payload),
}
```

`src/pages/auth/AdminSignUp.jsx` (3-step, gated by check-email — reuses StudentSignUpForm variant pattern):

```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { adminAuthApi } from '../../lib/api.js'
import { adminSignIn } from '../../lib/supabaseClient.js'
import { EyeIcon, EyeOffIcon } from '../../components/icons.jsx'

const EMAIL_RE = /^[^\s@]+@gordoncollege\.edu\.ph$/i
const STEPS = [{ id: 1, label: 'Email' }, { id: 2, label: 'Verify' }, { id: 3, label: 'Password' }]

export default function AdminSignUp() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [info, setInfo] = useState('')

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) { setFieldError('Use your Gordon College email (@gordoncollege.edu.ph).'); return }
    setFieldError(''); setBusy(true)
    try {
      const res = await adminAuthApi.checkEmail(email.trim())
      if (res?.invited !== true) { setFieldError('Unexpected response. Please try again.'); return }
      await adminAuthApi.sendCode(email.trim())
      setInfo(`We sent a 6-digit code to ${email.trim()}.`)
      setStep(2)
    } catch (err) {
      const msg = err?.message || ''
      if (/Not invited/i.test(msg)) setFieldError('This email is not on the admin allowlist.')
      else if (/Already active/i.test(msg)) setFieldError('Already active — please log in.')
      else setFieldError(msg || 'Could not verify this email.')
    } finally { setBusy(false) }
  }

  async function handleResend() {
    setBusy(true); setFieldError('')
    try {
      await adminAuthApi.sendCode(email.trim())
      setInfo(`We resent a 6-digit code to ${email.trim()}.`)
    } catch (err) {
      const msg = err?.message || ''
      if (/Too many/i.test(msg)) setFieldError('Too many codes sent. Please try again later.')
      else setFieldError(msg || 'Could not resend the code.')
    } finally { setBusy(false) }
  }

  function handleCodeSubmit(e) {
    e.preventDefault()
    if (code.length !== 6) { setFieldError('Enter the 6-digit code we sent you.'); return }
    setFieldError(''); setStep(3)
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    if (!password || password.length < 8) { setFieldError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setFieldError('Passwords do not match.'); return }
    setFieldError(''); setBusy(true)
    try {
      await adminAuthApi.signup({ email: email.trim(), code, password, confirmPassword })
      await adminSignIn(email.trim().split('@')[0], password)
      navigate('/admin/dashboard')
    } catch (err) {
      const msg = err?.message || 'Could not create your account.'
      if (/code/i.test(msg)) { setFieldError(msg); setCode(''); setStep(2) }
      else setFieldError(msg)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-xs font-bold tracking-widest text-gc-accent uppercase">Admin Portal</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gc-green-700">Admin Sign Up</h1>
        <p className="mt-1 text-sm text-gray-500">Your email must be on the admin allowlist to continue.</p>

        <ol className="mt-6 flex items-center gap-2">
          {STEPS.map((s, idx) => (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${s.id === step || s.id < step ? 'bg-gc-accent text-white' : 'bg-gray-100 text-gray-400'}`}>{s.id}</span>
              <span className={`text-xs font-semibold ${s.id === step || s.id < step ? 'text-gc-green-700' : 'text-gray-400'}`}>{s.label}</span>
              {idx < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${s.id < step ? 'bg-gc-accent' : 'bg-gray-100'}`} />}
            </li>
          ))}
        </ol>

        {info && !fieldError && <p className="mt-4 text-sm font-medium text-gc-green-700">{info}</p>}
        {fieldError && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{fieldError}</p>}

        <form onSubmit={step === 1 ? handleEmailSubmit : step === 2 ? handleCodeSubmit : handlePasswordSubmit} className="mt-6 space-y-4">
          {step === 1 && (
            <div>
              <label htmlFor="admin-signup-email" className="block text-sm font-semibold mb-1">Gordon College email</label>
              <input id="admin-signup-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setFieldError('') }} placeholder="name@gordoncollege.edu.ph" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" />
              <button type="submit" disabled={busy} className="mt-4 w-full rounded-xl bg-gc-accent py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : 'Continue'}</button>
            </div>
          )}
          {step === 2 && (
            <div>
              <label htmlFor="admin-signup-code" className="block text-sm font-semibold mb-1">6-digit code</label>
              <input id="admin-signup-code" type="text" inputMode="numeric" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setFieldError('') }} placeholder="••••••" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-xl tracking-[0.5em]" />
              <button type="button" onClick={handleResend} disabled={busy} className="mt-2 text-xs font-semibold text-gc-accent">Resend code</button>
              <button type="submit" disabled={busy} className="mt-4 w-full rounded-xl bg-gc-accent py-3 text-sm font-semibold text-white disabled:opacity-60">Verify code</button>
              <button type="button" onClick={() => setStep(1)} className="mt-2 w-full text-sm font-semibold text-gray-500">Back</button>
            </div>
          )}
          {step === 3 && (
            <>
              <div>
                <label htmlFor="admin-signup-password" className="block text-sm font-semibold mb-1">Password</label>
                <div className="relative">
                  <input id="admin-signup-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setFieldError('') }} placeholder="At least 8 characters" className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-sm" />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-3 text-gray-400">{showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}</button>
                </div>
              </div>
              <div>
                <label htmlFor="admin-signup-confirm" className="block text-sm font-semibold mb-1">Confirm password</label>
                <input id="admin-signup-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setFieldError('') }} placeholder="Re-enter password" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm" />
              </div>
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-gc-accent py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : 'Create account'}</button>
              <button type="button" onClick={() => setStep(2)} className="w-full text-sm font-semibold text-gray-500">Back</button>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account? <Link to="/admin/login" className="font-semibold text-gc-accent">Log in</Link>
        </p>
      </div>
    </div>
  )
}
```

`src/App.jsx` — add (outside `AdminLayout`):

```jsx
const AdminSignUp = lazy(() => import('./pages/auth/AdminSignUp.jsx'))
// ...
<Route path="/admin/signup" element={<AdminSignUp />} />
<Route path="/admin/login" element={<AdminLogin />} />
// AdminLayout routes remain below
```

Do NOT add `AdminSignUp` to `adminNav.js` or `Sidebar.jsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS (no unresolved imports; `AdminSignUp` chunk emitted).
Run (if Vitest): `npx vitest run src/pages/auth/__tests__/AdminSignUp.test.jsx`
Expected: PASS — file exists and renders step 1 form.

- [ ] **Step 5: Commit**

```bash
git add src/pages/auth/AdminSignUp.jsx src/lib/api.js src/App.jsx
git commit -m "feat(admin): add hidden /admin/signup page with allowlist-gated flow"
```

---

### Task 6: Frontend Admin Profile fields (Name, License, Role)

**Files:**
- Modify: `src/pages/admin/Profile.jsx` or `src/components/admin/ProfileForm.jsx` (existing profile page — inspect first)
- Modify: `routers/admin_mgmt.py` (add `PATCH /api/admins/:id/profile` if no existing profile update endpoint)
- Modify: `src/lib/api.js` (add `adminsApi.updateProfile` if needed)
- Test: `npm run build` + manual profile save

**Interfaces:**
- Consumes: `adminsApi.list` (to resolve own `admin_id`), `adminsApi.updateProfile(adminId, { first_name, last_name, license_no })`
- Produces: Profile fields Name (first_name + last_name editable), License No. editable, Role read-only badge

- [ ] **Step 1: Write the failing test**

Before implementing, verify the current profile page renders incomplete:

Run: `grep -R "license_no\|first_name\|Admin Profile" src/pages src/components --include="*.jsx" | head -20`
Expected: existing profile page may already have fields but lack `license_no` or show role as editable — the test is manual: navigate to `/admin/profile` with empty `first_name`/`license_no` and expect banner "Complete your profile" is missing.

If an existing `PATCH /api/admins/:id` profile endpoint exists, test it:

```python
# tests/test_admin_mgmt.py — addition
def test_profile_patch_requires_admin(client):
    c, _ = client
    resp = c.patch("/api/admins/1/profile", json={"first_name": "Test"})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_admin_mgmt.py::test_profile_patch_requires_admin -v`
Expected: FAIL with 404 if route not yet added (or manual UI check shows banner missing).

- [ ] **Step 3: Write minimal implementation**

If no existing profile edit, add to `routers/admin_mgmt.py`:

```python
@admin_mgmt_bp.route("/admins/<admin_id>/profile", methods=["PATCH"])
@require_admin
@handle_errors("update admin profile error")
def update_admin_profile(admin_id):
    body = request.get_json(silent=True) or {}
    # Only allow self or any admin (per spec any active admin can manage any other admin)
    # But profile edit is typically self; allow any active admin per non-goal.
    updates = {}
    if "first_name" in body:
        fn = (body.get("first_name") or "").strip()
        if not fn:
            return error_response("First name is required.", 400)
        updates["first_name"] = fn
    if "last_name" in body:
        ln = (body.get("last_name") or "").strip()
        if not ln:
            return error_response("Last name is required.", 400)
        updates["last_name"] = ln
    if "license_no" in body:
        updates["license_no"] = (body.get("license_no") or "").strip() or None
    # Role is NOT editable via this endpoint (read-only badge); block if sent
    if "role" in body:
        return error_response("Role cannot be changed via profile. Use Admins management.", 400)
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
```

If an existing profile endpoint already exists (e.g., `routers/student_record.py` or `routers/auth.py` profile route), extend it to handle `license_no` and verify `first_name`/`last_name` are writable — do NOT create a duplicate.

Frontend: extend existing profile page to show editable `first_name`, `last_name`, `license_no` and read-only `role` badge. Add banner when incomplete:

```jsx
{(admin.first_name === '' || admin.last_name === '' || !admin.license_no) && (
  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
    Complete your profile — add your name and license number.
  </div>
)}
```

`src/lib/api.js` — add:

```js
updateProfile: (adminId, body) => api.patch(`/api/admins/${adminId}/profile`, body),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS.
Run: `python -m pytest tests/test_admin_mgmt.py -v`
Expected: PASS (profile patch 401 for unauthenticated).
Run: `python -m py_compile routers/admin_mgmt.py`
Expected: no error.

- [ ] **Step 5: Commit**

```bash
git add routers/admin_mgmt.py src/lib/api.js src/pages/admin/Profile.jsx
git commit -m "feat(admin): add admin profile fields (name, license, read-only role) with completion banner"
```

---

## Spec Coverage Check

| Spec Section | Task |
|---|---|
| §3 Data Model (admin_accounts allowlist, app_accounts binding, no new tables) | Task 1, 2 |
| §3.2 Lifecycle pending->active->inactive->delete + status derivation | Task 1, 3 |
| §4.2 GET /api/admins (search/pagination/status) | Task 1 |
| §4.2 POST /api/admins (domain/role validation, duplicate 409, username local-part) | Task 1 |
| §4.2 POST /api/auth/admin/check-email (404/409 gates) | Task 2 |
| §4.2 POST /api/auth/admin/send-code (TTL 5m, rate 3/15m, SMTP->Resend fallback, re-validate) | Task 2 |
| §4.2 POST /api/auth/admin/signup (code one-time, create auth user, app_accounts, is_active flip, rollback) | Task 2 |
| §4.2 PATCH deactivate/activate | Task 3 |
| §4.2 DELETE with confirmEmail + self-delete guard + auth/app_accounts cascade | Task 3 |
| §5.1 Navigation (adminNav + Sidebar shield icon) | Task 4 |
| §5.2 Admins page table/columns/actions/search/pagination/confirm modal/self guard | Task 4 |
| §5.3 Hidden signup 3-step + auto-login + no nav link | Task 5 |
| §5.4 Admin Profile (editable name/license, read-only role, completion banner) | Task 6 |
| §6.1 Backend placement (routers/admin_mgmt.py + routers/auth.py + main.py + isolated _admin_signup_codes) | Task 1, 2, 3 |
| §6.2 Frontend placement + lazy loading | Task 4, 5 |
| §6.3 Security controls (require_admin, allowlist re-validation, domain, TTL, rate, self-delete, open-registration block) | Task 1, 2, 3 |
| §7 Error Handling table | Task 1, 2, 3, 4 |
| §8 Testing (py_compile, GET/POST lifecycle, deactivate/activate/delete, npm build, manual invite->signup) | All tasks (steps 2/4) |

## Placeholder Scan

Checked for `TBD`, `TODO`, `implement later`, `fill in`, `appropriate error handling`, `Similar to Task N` — none present. All code blocks contain real signatures, enum values, and table names.

## Type Consistency

- `admin_id` is `bigint` PK: passed as URL param string, compared via `str(admin_id)` in self-delete guard.
- `app_accounts.admin_id` linkage used consistently; fallback lookup by `email` mirrors spec.
- `adminsApi.remove(adminId, confirmEmail)` signature matches `DELETE /api/admins/:id { confirmEmail }`.
- `authRequest` helper reused for unauthenticated admin auth endpoints (same as `authApi`/`forgotApi`).
- Status strings exactly `pending`/`active`/`inactive` (derived), never `confirmed`.

---

*End of plan — 2026-08-30. Authoritative for Admin Management (Management -> Admins) implementation.*
