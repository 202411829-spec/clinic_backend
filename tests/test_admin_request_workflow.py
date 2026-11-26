import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import routers.admin_mgmt as admin_mgmt
import routers.auth as auth
import routers.auth_guard as auth_guard
from main import app
from routers.auth import (
    ADMIN_SIGNUP_EMAIL_EXCEPTION,
    _validate_email,
    is_valid_admin_middle_initial,
    normalize_admin_middle_initial,
)

APPROVER_EMAIL = "approver.tester@gordoncollege.edu.ph"
REQUEST_EMAIL = "request.tester@gordoncollege.edu.ph"
SECOND_EMAIL = "second.tester@gordoncollege.edu.ph"
PASSWORD = "ClearSky2026!"
AUTH_HEADERS = {"Authorization": "Bearer controlled-test-token"}


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
        self.filters[key] = value.lower()
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
        self.deleted_auth_users = []
        self._next_admin = 1
        self._next_account = 1
        self._next_auth = 1

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
    smtp_calls = []
    decision_calls = []

    auth._admin_signup_codes.clear()

    monkeypatch.setattr(auth, "execute_with_retry", lambda query: query.execute())
    monkeypatch.setattr(admin_mgmt, "execute_with_retry", lambda query: query.execute())

    fake_auth = MagicMock()
    fake_auth.table.side_effect = state.table

    def create_user(payload):
        auth_user_id = f"auth-{state._next_auth}"
        state._next_auth += 1
        return SimpleNamespace(user=SimpleNamespace(id=auth_user_id))

    fake_auth.auth.admin.create_user.side_effect = create_user
    monkeypatch.setattr(auth, "supabase", fake_auth)

    fake_admin_supabase = MagicMock()
    fake_admin_supabase.table.side_effect = state.table
    fake_admin_supabase.auth.admin.delete_user.side_effect = (
        lambda auth_user_id: state.deleted_auth_users.append(auth_user_id)
    )
    monkeypatch.setattr(admin_mgmt, "supabase", fake_admin_supabase)

    def fake_smtp(email, code, *args):
        smtp_calls.append((email, code))
        return True

    monkeypatch.setattr(auth, "_send_email_via_smtp", fake_smtp)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)

    def fake_decision(email, approved):
        decision_calls.append((email, approved))
        return True

    monkeypatch.setattr(
        admin_mgmt, "_send_admin_decision_email", fake_decision, raising=False
    )

    def verify_token(token):
        return SimpleNamespace(id="approver-auth-id", email=APPROVER_EMAIL)

    monkeypatch.setattr(auth_guard, "_verify_token", verify_token)
    monkeypatch.setattr(auth_guard, "is_admin_user", lambda user: True)

    yield app.test_client(), state, smtp_calls, decision_calls

    auth._admin_signup_codes.clear()


def send_code(client, smtp_calls, email):
    response = client.post("/api/auth/admin/send-code", json={"email": email})
    assert response.status_code == 200, response.get_json()
    return smtp_calls[-1][1]


def send_invitation_code(client, smtp_calls, email, invitation_token):
    response = client.post(
        "/api/auth/admin/send-code",
        json={"email": email, "invitation_token": invitation_token},
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["email"] == REQUEST_EMAIL
    return smtp_calls[-1][1]


def test_admin_middle_initial_helpers_accept_one_initial_only():
    assert normalize_admin_middle_initial("B") == "B."
    assert normalize_admin_middle_initial("B.") == "B."
    assert normalize_admin_middle_initial("B......") == "B."
    assert normalize_admin_middle_initial("b") == "B."
    assert normalize_admin_middle_initial("") is None

    assert is_valid_admin_middle_initial("B") is True
    assert is_valid_admin_middle_initial("B......") is True
    assert is_valid_admin_middle_initial("") is True
    assert is_valid_admin_middle_initial("Daniel") is False
    assert is_valid_admin_middle_initial("II") is False


def test_admin_signup_rejects_multi_letter_middle_initial(env):
    client, state, smtp_calls, _ = env
    code = send_code(client, smtp_calls, REQUEST_EMAIL)

    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        middle_initial="Daniel",
    )

    assert response.status_code == 400, response.get_json()
    assert "single letter" in response.get_json()["error"].lower()
    assert state.admins == []


def submit_request(
    client,
    email,
    code,
    first="Test",
    last="Tester",
    middle_initial=None,
    suffix=None,
    role=None,
    invitation_token=None,
):
    # `role` is intentionally optional and ignored by the server: a new
    # self-request always stores "admin" and an invite completion keeps
    # the role stored on the invite row.
    payload = {
        "email": email,
        "code": code,
        "password": PASSWORD,
        "confirmPassword": PASSWORD,
        "first_name": first,
        "last_name": last,
    }
    if role is not None:
        payload["role"] = role
    if invitation_token is not None:
        payload["invitation_token"] = invitation_token
    if middle_initial is not None:
        payload["middle_initial"] = middle_initial
    if suffix is not None:
        payload["suffix"] = suffix
    return client.post("/api/auth/admin/signup", json=payload)


def test_self_request_persists_appears_pending_and_approve_grants_access(env, monkeypatch):
    client, state, smtp_calls, decision_calls = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(client, REQUEST_EMAIL, code)
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["status"] == "pending"

    admin_id = body["admin_id"]
    assert len(state.admins) == 1
    assert state.admins[0]["is_active"] is False
    assert len(state.accounts) == 1
    assert state.accounts[0]["account_type"] == "admin"
    assert state.accounts[0]["admin_id"] == admin_id

    duplicate_code = send_code(client, smtp_calls, REQUEST_EMAIL)
    duplicate = submit_request(client, REQUEST_EMAIL, duplicate_code)
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.get_json()["error"].lower()

    pending = client.get("/api/admins?view=pending", headers=AUTH_HEADERS)
    assert pending.status_code == 200
    assert pending.get_json()["counts"]["pending"] == 1
    assert pending.get_json()["admins"][0]["status"] == "pending"
    assert pending.get_json()["admins"][0]["email"] == REQUEST_EMAIL

    applicant_auth_id = state.accounts[0]["auth_user_id"]
    monkeypatch.setattr(
        auth_guard,
        "_verify_token",
        lambda token: SimpleNamespace(id=applicant_auth_id, email=REQUEST_EMAIL),
    )
    own_pending = client.get("/api/admins/me", headers=AUTH_HEADERS)
    assert own_pending.status_code == 200
    assert own_pending.get_json()["admin"]["status"] == "pending"

    approved = client.patch(f"/api/admins/{admin_id}/activate", headers=AUTH_HEADERS)
    assert approved.status_code == 200, approved.get_json()
    assert state.admins[0]["is_active"] is True
    assert (REQUEST_EMAIL, True) in decision_calls

    own_active = client.get("/api/admins/me", headers=AUTH_HEADERS)
    assert own_active.status_code == 200
    assert own_active.get_json()["admin"]["status"] == "active"

    roster = client.get("/api/admins?view=roster", headers=AUTH_HEADERS)
    assert roster.get_json()["counts"]["active"] == 1
    assert roster.get_json()["admins"][0]["status"] == "active"


def test_admin_signup_persists_complete_name_fields(env):
    client, state, smtp_calls, _ = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        first="Joseph Daniel",
        last="Ramos",
        middle_initial="B......",
        suffix="Jr.",
    )
    assert response.status_code == 201, response.get_json()

    row = state.admins[0]
    assert row["last_name"] == "Ramos"
    assert row["first_name"] == "Joseph Daniel"
    assert row["middle_initial"] == "B."
    assert row["suffix"] == "Jr."

    pending = client.get("/api/admins?view=pending", headers=AUTH_HEADERS)
    assert pending.status_code == 200, pending.get_json()
    listed = pending.get_json()["admins"][0]
    assert listed["middle_initial"] == "B."
    assert listed["suffix"] == "Jr."
    assert [listed["last_name"], listed["first_name"], listed["middle_initial"], listed["suffix"]] == [
        "Ramos",
        "Joseph Daniel",
        "B.",
        "Jr.",
    ]


@pytest.mark.parametrize("suffix", ["Jr.", "Sr.", "II", "III"])
def test_admin_signup_accepts_common_suffixes(env, suffix):
    client, state, smtp_calls, _ = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        first="Joseph Daniel",
        last="Ramos",
        middle_initial="B",
        suffix=suffix,
    )

    assert response.status_code == 201, response.get_json()
    assert state.admins[0]["middle_initial"] == "B."
    assert state.admins[0]["suffix"] == suffix


def test_reject_request_removes_records_and_notifies_applicant(env):
    client, state, smtp_calls, decision_calls = env

    code = send_code(client, smtp_calls, SECOND_EMAIL)
    response = submit_request(client, SECOND_EMAIL, code, first="Second", last="Tester")
    assert response.status_code == 201
    admin_id = response.get_json()["admin_id"]
    auth_user_id = state.accounts[0]["auth_user_id"]

    rejected = client.delete(
        f"/api/admins/{admin_id}",
        json={"confirmEmail": SECOND_EMAIL},
        headers=AUTH_HEADERS,
    )
    assert rejected.status_code == 200, rejected.get_json()
    assert state.admins == []
    assert state.accounts == []
    assert state.deleted_auth_users == [auth_user_id]
    assert (SECOND_EMAIL, False) in decision_calls

    pending = client.get("/api/admins?view=pending", headers=AUTH_HEADERS)
    assert pending.get_json()["counts"]["pending"] == 0


INVITE_TOKEN = "tok-invited-request-2026"


def test_invited_admin_completes_signup_and_is_activated(env):
    client, state, smtp_calls, _ = env
    state.admins.append({
        "admin_id": "adm-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "super_admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "created_at": "2026-01-01T00:00:00Z",
    })

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    # The client sends a role; it must never override the invited role.
    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        first="Invited",
        last="Tester",
        role="admin",
        invitation_token=INVITE_TOKEN,
    )

    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["admin_id"] == "adm-invite"
    assert body["status"] == "active"
    assert "active" in body["message"].lower()
    assert len(state.admins) == 1
    assert state.admins[0]["first_name"] == "Invited"
    assert state.admins[0]["last_name"] == "Tester"
    assert state.admins[0]["is_active"] is True
    # Invite completion preserves the role stored on the invite row.
    assert state.admins[0]["role"] == "super_admin"
    # Successful invitations are single-use: the stored token is cleared.
    assert state.admins[0].get("invitation_token") is None
    assert len(state.accounts) == 1
    assert state.accounts[0]["admin_id"] == "adm-invite"


def test_invitation_token_rejects_a_different_email(env):
    client, state, smtp_calls, _ = env
    state.admins.append({
        "admin_id": "adm-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "created_at": "2026-01-01T00:00:00Z",
    })

    code = send_code(client, smtp_calls, SECOND_EMAIL)
    response = submit_request(
        client,
        SECOND_EMAIL,
        code,
        invitation_token=INVITE_TOKEN,
    )

    assert response.status_code == 400, response.get_json()
    assert "different email" in response.get_json()["error"].lower()
    assert len(state.admins) == 1
    assert state.admins[0]["is_active"] is False
    assert state.accounts == []


def test_invalid_invitation_token_is_rejected(env):
    client, state, smtp_calls, _ = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        invitation_token="tok-not-issued",
    )

    assert response.status_code == 400, response.get_json()
    assert "invitation" in response.get_json()["error"].lower()
    assert state.admins == []
    assert state.accounts == []


def test_invitation_otp_uses_token_email_not_stale_form_email(env):
    """Regression: a stale email copy must not poison the invitation OTP flow."""
    client, state, smtp_calls, _ = env
    state.admins.append({
        "admin_id": "adm-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "super_admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "created_at": "2026-01-01T00:00:00Z",
    })

    # The client accidentally carries a different email into the OTP step.
    code = send_invitation_code(client, smtp_calls, SECOND_EMAIL, INVITE_TOKEN)
    assert smtp_calls[-1][0] == REQUEST_EMAIL
    assert auth._admin_signup_codes[REQUEST_EMAIL]["code"] == code
    assert SECOND_EMAIL not in auth._admin_signup_codes

    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        invitation_token=INVITE_TOKEN,
    )

    assert response.status_code == 201, response.get_json()
    assert response.get_json()["status"] == "active"
    assert response.get_json()["admin_id"] == "adm-invite"
    assert state.admins[0]["role"] == "super_admin"
    assert state.admins[0].get("invitation_token") is None
    assert len(state.accounts) == 1
    assert state.accounts[0]["email"] == REQUEST_EMAIL


def test_consumed_invitation_token_cannot_be_reused(env):
    client, state, smtp_calls, _ = env
    state.admins.append({
        "admin_id": "adm-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "created_at": "2026-01-01T00:00:00Z",
    })

    code = send_invitation_code(client, smtp_calls, REQUEST_EMAIL, INVITE_TOKEN)
    assert submit_request(
        client, REQUEST_EMAIL, code, invitation_token=INVITE_TOKEN
    ).status_code == 201

    # A stale link is invalid after the invitation has been consumed.
    replay = client.post(
        "/api/auth/admin/signup",
        json={
            "email": REQUEST_EMAIL,
            "code": code,
            "password": PASSWORD,
            "confirmPassword": PASSWORD,
            "first_name": "Replay",
            "last_name": "Tester",
            "invitation_token": INVITE_TOKEN,
        },
    )
    assert replay.status_code == 400, replay.get_json()
    assert "invalid or has expired" in replay.get_json()["error"].lower()


def test_stale_invitation_token_for_deleted_row_is_rejected(env):
    client, state, smtp_calls, _ = env
    state.admins.append({
        "admin_id": "adm-deleted-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "created_at": "2026-01-01T00:00:00Z",
    })
    state.admins.clear()  # simulates the invite row being deleted before signup

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(
        client,
        REQUEST_EMAIL,
        code,
        invitation_token=INVITE_TOKEN,
    )

    assert response.status_code == 400, response.get_json()
    assert "invalid or has expired" in response.get_json()["error"].lower()
    assert state.admins == []
    assert state.accounts == []


def test_pending_invite_is_marked_as_invitation_without_exposing_token(env):
    client, state, _, _ = env
    state.admins.append({
        "admin_id": "adm-invite",
        "email": REQUEST_EMAIL,
        "username": REQUEST_EMAIL.split("@")[0],
        "first_name": "",
        "last_name": "",
        "role": "super_admin",
        "license_no": None,
        "is_active": False,
        "invitation_token": INVITE_TOKEN,
        "invite_email_sent_at": "2026-11-25T10:00:00+00:00",
        "created_at": "2026-01-01T00:00:00Z",
    })

    pending = client.get("/api/admins?view=pending", headers=AUTH_HEADERS)

    assert pending.status_code == 200, pending.get_json()
    row = pending.get_json()["admins"][0]
    assert row["email"] == REQUEST_EMAIL
    assert row["status"] == "pending"
    assert row["is_invitation"] is True
    assert row["invitation_status"] == "Invitation sent"
    assert "invitation_token" not in row


def test_new_self_request_role_is_forced_to_admin_server_side(env):
    """A client-supplied role can never upgrade a new self-request."""
    client, state, smtp_calls, _ = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(
        client, REQUEST_EMAIL, code, role="super_admin"
    )

    assert response.status_code == 201, response.get_json()
    assert len(state.admins) == 1
    assert state.admins[0]["role"] == "admin"


def test_signup_request_without_role_field_is_accepted(env):
    """role is no longer required in the signup request body."""
    client, state, smtp_calls, _ = env

    code = send_code(client, smtp_calls, REQUEST_EMAIL)
    response = submit_request(client, REQUEST_EMAIL, code)

    assert response.status_code == 201, response.get_json()
    assert state.admins[0]["role"] == "admin"


def test_bad_code_is_rejected_server_side(env):
    client, state, smtp_calls, _ = env
    send_code(client, smtp_calls, REQUEST_EMAIL)

    response = submit_request(client, REQUEST_EMAIL, "000000")
    assert response.status_code == 400
    assert "code" in response.get_json()["error"].lower()
    assert state.admins == []
    assert state.accounts == []


def test_only_exact_gmail_exception_bypasses_admin_email_format(env):
    client, _, _, _ = env

    assert _validate_email(ADMIN_SIGNUP_EMAIL_EXCEPTION, "admin") == (None, 0)
    assert _validate_email(ADMIN_SIGNUP_EMAIL_EXCEPTION.upper(), "admin") == (None, 0)

    err, status = _validate_email("another.person@gmail.com", "admin")
    assert err is not None
    assert status == 400

    err, status = _validate_email("202311330@gordoncollege.edu.ph", "admin")
    assert err is not None
    assert status == 400

    rejected = client.post(
        "/api/auth/admin/send-code", json={"email": "another.person@gmail.com"}
    )
    assert rejected.status_code == 400


def test_gmail_exception_request_stays_pending_until_admin_approval(env, monkeypatch):
    client, state, smtp_calls, decision_calls = env

    code = send_code(client, smtp_calls, ADMIN_SIGNUP_EMAIL_EXCEPTION)
    response = submit_request(
        client,
        ADMIN_SIGNUP_EMAIL_EXCEPTION,
        code,
        first="Joseph",
        last="Ramos",
    )
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["status"] == "pending"

    admin_id = body["admin_id"]
    assert state.admins[0]["is_active"] is False
    assert state.accounts[0]["account_type"] == "admin"
    assert state.accounts[0]["admin_id"] == admin_id

    pending = client.get("/api/admins?view=pending", headers=AUTH_HEADERS)
    assert pending.status_code == 200
    queued = [
        row for row in pending.get_json()["admins"]
        if row["email"] == ADMIN_SIGNUP_EMAIL_EXCEPTION
    ]
    assert len(queued) == 1
    assert queued[0]["status"] == "pending"

    applicant_auth_id = state.accounts[0]["auth_user_id"]
    monkeypatch.setattr(
        auth_guard,
        "_verify_token",
        lambda token: SimpleNamespace(
            id=applicant_auth_id, email=ADMIN_SIGNUP_EMAIL_EXCEPTION
        ),
    )
    own_pending = client.get("/api/admins/me", headers=AUTH_HEADERS)
    assert own_pending.status_code == 200
    assert own_pending.get_json()["admin"]["status"] == "pending"

    approved = client.patch(f"/api/admins/{admin_id}/activate", headers=AUTH_HEADERS)
    assert approved.status_code == 200, approved.get_json()
    assert state.admins[0]["is_active"] is True
    assert (ADMIN_SIGNUP_EMAIL_EXCEPTION, True) in decision_calls

    own_active = client.get("/api/admins/me", headers=AUTH_HEADERS)
    assert own_active.status_code == 200
    assert own_active.get_json()["admin"]["status"] == "active"
