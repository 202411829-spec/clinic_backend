# tests/test_admin_role_authorization.py
"""Super-admin authorization for admin invites and role changes.

The guard chain runs for real against an in-memory fake of
admin_accounts/app_accounts, so these tests prove the role is read
from the database for the verified caller — not from the request body
or anything the client controls.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import routers.admin_mgmt as admin_mgmt
import routers.auth_guard as auth_guard
from main import app
from routers.admin_mgmt import _validate_admin_email

SUPER_ID = "super-auth-id"
SUPER_EMAIL = "super.admin@gordoncollege.edu.ph"
REGULAR_ID = "regular-auth-id"
REGULAR_EMAIL = "regular.admin@gordoncollege.edu.ph"
INVITEE_EMAIL = "invitee.tester@gordoncollege.edu.ph"
EXCEPTION_EMAIL = "josephramos0254@gmail.com"


class FakeQuery:
    def __init__(self, state, table):
        self.state = state
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = {}

    def select(self, *columns):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.filters[key] = set(values)
        return self

    def ilike(self, key, value):
        self.filters[key] = str(value).lower()
        return self

    def or_(self, expression):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, count):
        return self

    def execute(self):
        return SimpleNamespace(data=self.state.run(self))


class FakeState:
    def __init__(self):
        self.admins = []
        self.accounts = []
        self._next_admin = 1
        self._next_account = 1

    def table(self, name):
        return FakeQuery(self, name)

    def _matches(self, row, filters):
        for key, expected in filters.items():
            actual = row.get(key)
            if isinstance(expected, set):
                if actual not in expected:
                    return False
            elif key == "email" and isinstance(actual, str):
                if actual.lower() != str(expected).lower():
                    return False
            elif actual != expected:
                return False
        return True

    def run(self, query):
        rows = self.admins if query.table == "admin_accounts" else self.accounts
        op = query.op

        if op == "select":
            return [dict(row) for row in rows if self._matches(row, query.filters)]

        if op == "insert":
            row = dict(query.payload)
            if query.table == "admin_accounts":
                row.setdefault("admin_id", f"adm-{self._next_admin}")
                row.setdefault("created_at", "2026-01-01T00:00:00Z")
                self._next_admin += 1
            else:
                row.setdefault("account_id", f"acct-{self._next_account}")
                self._next_account += 1
            rows.append(row)
            return [dict(row)]

        matched = [row for row in rows if self._matches(row, query.filters)]
        if op == "update":
            for row in matched:
                row.update(query.payload)
            return [dict(row) for row in matched]

        if op == "delete":
            for row in matched:
                rows.remove(row)
            return [dict(row) for row in matched]

        raise AssertionError(f"Unexpected fake DB operation: {op}")


@pytest.fixture
def env(monkeypatch):
    app.config["TESTING"] = True
    state = FakeState()

    # Seeded super admin (the default caller) and a plain admin.
    state.admins.append({
        "admin_id": "adm-super",
        "email": SUPER_EMAIL,
        "username": "super.admin",
        "first_name": "Super",
        "last_name": "Admin",
        "role": "super_admin",
        "license_no": None,
        "is_active": True,
        "created_at": "2026-01-01T00:00:00Z",
    })
    state.admins.append({
        "admin_id": "adm-regular",
        "email": REGULAR_EMAIL,
        "username": "regular.admin",
        "first_name": "Regular",
        "last_name": "Admin",
        "role": "admin",
        "license_no": None,
        "is_active": True,
        "created_at": "2026-01-01T00:00:00Z",
    })
    state.accounts.append({
        "account_id": "acct-1",
        "auth_user_id": SUPER_ID,
        "email": SUPER_EMAIL,
        "account_type": "admin",
        "admin_id": "adm-super",
    })
    state.accounts.append({
        "account_id": "acct-2",
        "auth_user_id": REGULAR_ID,
        "email": REGULAR_EMAIL,
        "account_type": "admin",
        "admin_id": "adm-regular",
    })

    fake_supabase = MagicMock()
    fake_supabase.table.side_effect = state.table

    # Both the route module and the guard module talk to the same fake.
    monkeypatch.setattr(admin_mgmt, "execute_with_retry", lambda query: query.execute())
    monkeypatch.setattr(admin_mgmt, "supabase", fake_supabase)
    # Invites now submit an email; authorization tests focus on role checks,
    # so their provider always accepts.
    monkeypatch.setattr(
        admin_mgmt, "_send_admin_invite_email", lambda to_email, role, invite_token=None: True
    )
    monkeypatch.setattr(auth_guard, "execute_with_retry", lambda query: query.execute())
    monkeypatch.setattr(auth_guard, "supabase", fake_supabase)

    def verify_token(token, user_id=SUPER_ID, user_email=SUPER_EMAIL):
        return SimpleNamespace(id=user_id, email=user_email)

    monkeypatch.setattr(auth_guard, "_verify_token", verify_token)

    yield app.test_client(), state, monkeypatch


def _as_regular_admin(monkeypatch):
    monkeypatch.setattr(
        auth_guard,
        "_verify_token",
        lambda token: SimpleNamespace(id=REGULAR_ID, email=REGULAR_EMAIL),
    )


# ============================================================
# POST /api/admins — invite
# ============================================================


def test_invite_without_token_returns_401(env):
    client, _, _ = env
    resp = client.post("/api/admins", json={"email": INVITEE_EMAIL, "role": "admin"})
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_invite_rejected_for_regular_admin(env):
    """A plain admin clears require_admin but must get 403 here."""
    client, state, monkeypatch = env
    _as_regular_admin(monkeypatch)

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE_EMAIL, "role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 403
    assert resp.get_json()["success"] is False
    # No invite row was created.
    assert len(state.admins) == 2


def test_invite_as_super_admin_persists_admin_role(env):
    client, state, _ = env

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE_EMAIL, "role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 201, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["admin"]["role"] == "admin"
    assert state.admins[-1]["email"] == INVITEE_EMAIL
    assert state.admins[-1]["role"] == "admin"
    assert state.admins[-1]["is_active"] is False


def test_invite_as_super_admin_persists_super_admin_role(env):
    client, state, _ = env

    resp = client.post(
        "/api/admins",
        json={"email": "second.invitee@gordoncollege.edu.ph", "role": "super_admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()["admin"]["role"] == "super_admin"
    assert state.admins[-1]["role"] == "super_admin"


@pytest.mark.parametrize("legacy_role", ["nurse", "doctor"])
def test_invite_rejects_legacy_roles(env, legacy_role):
    client, state, _ = env

    resp = client.post(
        "/api/admins",
        json={"email": INVITEE_EMAIL, "role": legacy_role},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 400
    assert "admin or super_admin" in resp.get_json()["error"]
    assert len(state.admins) == 2


def test_invite_accepts_gordon_domain_and_exact_gmail_exception(env):
    client, state, _ = env

    gordon = client.post(
        "/api/admins",
        json={"email": INVITEE_EMAIL, "role": "admin"},
        headers={"Authorization": "Bearer t"},
    )
    assert gordon.status_code == 201, gordon.get_json()

    exception = client.post(
        "/api/admins",
        json={"email": EXCEPTION_EMAIL.upper(), "role": "admin"},
        headers={"Authorization": "Bearer t"},
    )
    assert exception.status_code == 201, exception.get_json()
    assert state.admins[-1]["email"] == EXCEPTION_EMAIL


def test_invite_rejects_other_gmail_addresses(env):
    client, state, _ = env

    resp = client.post(
        "/api/admins",
        json={"email": "someone.else@gmail.com", "role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 400
    assert "gordoncollege.edu.ph" in resp.get_json()["error"]
    assert len(state.admins) == 2


def test_invite_validator_unit_cases():
    assert _validate_admin_email(EXCEPTION_EMAIL) is None
    assert _validate_admin_email(f"  {EXCEPTION_EMAIL.upper()}  ") is None
    assert _validate_admin_email("lastname.firstname@gordoncollege.edu.ph") is None
    # Invite validation is domain-only (unchanged): any Gordon address
    # passes, only non-Gordon addresses are rejected.
    assert _validate_admin_email("202311330@gordoncollege.edu.ph") is None
    assert _validate_admin_email("another.person@gmail.com") is not None
    assert _validate_admin_email("someone@yahoo.com") is not None


# ============================================================
# PATCH /api/admins/<admin_id>/role
# ============================================================


def test_role_endpoint_requires_auth(env):
    client, _, _ = env
    resp = client.patch("/api/admins/adm-regular/role", json={"role": "super_admin"})
    assert resp.status_code == 401


def test_role_change_rejected_for_regular_admin(env):
    client, state, monkeypatch = env
    _as_regular_admin(monkeypatch)

    resp = client.patch(
        "/api/admins/adm-super/role",
        json={"role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 403
    # Target role untouched.
    assert state.admins[0]["role"] == "super_admin"


def test_super_admin_can_promote_another_admin(env):
    client, state, _ = env

    resp = client.patch(
        "/api/admins/adm-regular/role",
        json={"role": "super_admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200, resp.get_json()
    body = resp.get_json()
    assert body["success"] is True
    assert body["admin"]["admin_id"] == "adm-regular"
    assert body["admin"]["role"] == "super_admin"
    assert state.admins[1]["role"] == "super_admin"


def test_super_admin_can_demote_another_admin(env):
    client, state, _ = env
    state.admins[1]["role"] = "super_admin"

    resp = client.patch(
        "/api/admins/adm-regular/role",
        json={"role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["admin"]["role"] == "admin"
    assert state.admins[1]["role"] == "admin"


@pytest.mark.parametrize("bad_role", ["nurse", "doctor", "root", "", None])
def test_role_change_rejects_invalid_roles(env, bad_role):
    client, state, _ = env
    payload = {} if bad_role is None else {"role": bad_role}

    resp = client.patch(
        "/api/admins/adm-regular/role",
        json=payload,
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 400
    assert "admin or super_admin" in resp.get_json()["error"]
    assert state.admins[1]["role"] == "admin"


def test_role_change_rejects_unknown_admin(env):
    client, _, _ = env

    resp = client.patch(
        "/api/admins/adm-missing/role",
        json={"role": "super_admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 404


def test_super_admin_cannot_change_own_role(env):
    client, state, _ = env

    resp = client.patch(
        "/api/admins/adm-super/role",
        json={"role": "admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 403
    assert "your own role" in resp.get_json()["error"]
    assert state.admins[0]["role"] == "super_admin"


def test_profile_patch_still_blocks_role_changes(env):
    client, state, _ = env

    resp = client.patch(
        "/api/admins/adm-regular/profile",
        json={"role": "super_admin"},
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 400
    assert "PATCH /api/admins/<admin_id>/role" in resp.get_json()["error"]
    assert state.admins[1]["role"] == "admin"

