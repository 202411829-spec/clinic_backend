import json
import logging
from pathlib import Path
from unittest.mock import MagicMock

import pytest

import routers.auth as auth
import routers.password_policy as password_policy
from main import app
from routers.password_policy import validate_password


ROOT = Path(__file__).resolve().parents[1]
VECTORS = json.loads((ROOT / "tests" / "password_policy_vectors.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", VECTORS, ids=[case["name"] for case in VECTORS])
def test_shared_policy_vectors(case):
    password = case.get("password")
    if password is None:
        password = case["passwordRepeat"] * case["repeat"] + case.get("passwordSuffix", "")

    result = validate_password(
        password,
        email=case.get("email"),
        username=case.get("username"),
    )

    assert result["valid"] is case["valid"]
    assert result["code"] == case["code"]
    assert result["strength"] == case["strength"]


def test_denylist_is_shared_and_curated():
    denylist_path = ROOT / "shared" / "common-passwords.json"
    denylist = json.loads(denylist_path.read_text(encoding="utf-8"))

    assert isinstance(denylist, list)
    assert len(denylist) >= 12
    assert "password" in denylist
    assert "password123" in denylist
    assert len({entry.casefold() for entry in denylist}) == len(denylist)


def test_validation_does_not_mutate_password():
    original = "  Sunshine42Blue  "
    password = original[:]

    validate_password(password, email="student@gordoncollege.edu.ph", username="202311330")

    assert password == original


def _provider_error(message, code=None):
    error = Exception(message)
    if code is not None:
        error.code = code
    return error


@pytest.mark.parametrize(
    "error",
    [
        _provider_error("weak_password: Password does not meet requirements"),
        _provider_error("provider failed", code="weak_password"),
        _provider_error("Password cannot be longer than 72 bytes"),
        _provider_error("Password is too weak or has been exposed in a data breach"),
    ],
)
def test_supabase_password_validation_errors_are_recognized(error):
    assert password_policy.is_supabase_password_validation_error(error)


def test_unrelated_provider_errors_are_not_treated_as_password_errors():
    assert not password_policy.is_supabase_password_validation_error(
        _provider_error("Email already exists", code="email_exists")
    )


def test_password_error_details_redact_submitted_password():
    password = "Sunshine42Blue"

    details = password_policy.redact_password_from_error(
        _provider_error(f"weak_password: invalid password {password}"),
        password,
    )

    assert password not in details
    assert "[REDACTED]" in details


def test_weak_password_message_is_safe_for_display():
    message = password_policy.SUPABASE_WEAK_PASSWORD_MESSAGE

    assert "password" in message.lower()
    assert "weak_password" not in message
    assert "supabase" not in message.lower()


STUDENT_EMAIL = "202311330@gordoncollege.edu.ph"
ADMIN_EMAIL = "bautista.kenneth@gordoncollege.edu.ph"


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture(autouse=True)
def clear_otp_stores():
    auth._verification_codes.clear()
    auth._forgot_codes.clear()
    auth._admin_signup_codes.clear()
    yield
    auth._verification_codes.clear()
    auth._forgot_codes.clear()
    auth._admin_signup_codes.clear()


def _capture_code(monkeypatch):
    calls = []
    monkeypatch.setattr(auth, "_send_email_via_smtp", lambda email, code, *args: calls.append((email, code)) or True)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setattr(auth, "resend", None)
    return calls


def _mock_db(monkeypatch, responses):
    iterator = iter(responses)
    monkeypatch.setattr(auth, "execute_with_retry", lambda query: MagicMock(data=next(iterator)))


def _mock_auth_user(monkeypatch):
    fake_supabase = MagicMock()
    fake_supabase.auth.admin.create_user.return_value = MagicMock(user=MagicMock(id="auth-test-id"))
    monkeypatch.setattr(auth, "supabase", fake_supabase)


def _send_student_code(client, monkeypatch):
    calls = _capture_code(monkeypatch)
    assert client.post("/api/auth/send-code", json={"email": STUDENT_EMAIL}).status_code == 200
    return calls[0][1]


def _send_admin_code(client, monkeypatch):
    _mock_db(monkeypatch, [[]])
    calls = _capture_code(monkeypatch)
    assert client.post("/api/auth/admin/send-code", json={"email": ADMIN_EMAIL}).status_code == 200
    return calls[0][1]


def _send_forgot_code(client, monkeypatch, email):
    _mock_db(monkeypatch, [[{"account_id": "account-test-id"}]])
    calls = _capture_code(monkeypatch)
    assert client.post("/api/auth/forgot/send-code", json={"email": email}).status_code == 200
    return calls[0][1]


def test_student_signup_enforces_password_policy(client, monkeypatch):
    code = _send_student_code(client, monkeypatch)
    _mock_db(monkeypatch, [[], [], [{}], [{}]])
    _mock_auth_user(monkeypatch)

    response = client.post(
        "/api/auth/signup",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": "password123",
            "confirmPassword": "password123",
        },
    )

    assert response.status_code == 400
    assert "password" in response.get_json()["error"].lower()


def test_admin_signup_enforces_password_policy(client, monkeypatch):
    code = _send_admin_code(client, monkeypatch)
    _mock_db(monkeypatch, [[], [], [{"admin_id": "admin-test-id"}], [{}]])
    _mock_auth_user(monkeypatch)

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "password": "password123",
            "confirmPassword": "password123",
            "first_name": "Kenneth",
            "last_name": "Bautista",
            "role": "admin",
        },
    )

    assert response.status_code == 400
    assert "password" in response.get_json()["error"].lower()


@pytest.mark.parametrize("email", [STUDENT_EMAIL, ADMIN_EMAIL])
def test_forgot_reset_enforces_password_policy(client, monkeypatch, email):
    code = _send_forgot_code(client, monkeypatch, email)
    fake_supabase = MagicMock()
    monkeypatch.setattr(auth, "supabase", fake_supabase)

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": email,
            "code": code,
            "password": "password123",
            "confirmPassword": "password123",
        },
    )

    assert response.status_code == 400
    assert "password" in response.get_json()["error"].lower()
    fake_supabase.auth.admin.update_user_by_id.assert_not_called()


def test_student_signup_reports_supabase_weak_password_safely(client, monkeypatch, caplog):
    code = _send_student_code(client, monkeypatch)
    _mock_db(monkeypatch, [[]])
    password = "Sunshine42Blue"
    raw_error = f"weak_password: invalid password {password} (provider detail)"

    fake_supabase = MagicMock()
    fake_supabase.auth.admin.create_user.side_effect = Exception(raw_error)
    monkeypatch.setattr(auth, "supabase", fake_supabase)

    with caplog.at_level(logging.ERROR):
        response = client.post(
            "/api/auth/signup",
            json={
                "email": STUDENT_EMAIL,
                "code": code,
                "password": password,
                "confirmPassword": password,
            },
        )

    body = response.get_json()
    assert response.status_code == 400
    assert body["error"] == password_policy.SUPABASE_WEAK_PASSWORD_MESSAGE
    assert "weak_password" not in body["error"]
    assert password not in body["error"]
    assert "weak_password" in caplog.text
    assert password not in caplog.text
    assert "[REDACTED]" in caplog.text


def test_student_signup_does_not_return_or_log_raw_provider_error(client, monkeypatch, caplog):
    code = _send_student_code(client, monkeypatch)
    _mock_db(monkeypatch, [[]])
    password = "Sunshine42Blue"
    raw_error = f"provider outage detail for {password}"

    fake_supabase = MagicMock()
    fake_supabase.auth.admin.create_user.side_effect = Exception(raw_error)
    monkeypatch.setattr(auth, "supabase", fake_supabase)

    with caplog.at_level(logging.ERROR):
        response = client.post(
            "/api/auth/signup",
            json={
                "email": STUDENT_EMAIL,
                "code": code,
                "password": password,
                "confirmPassword": password,
            },
        )

    body = response.get_json()
    assert response.status_code == 500
    assert "provider outage" not in body["error"]
    assert password not in body["error"]
    assert password not in caplog.text
    assert "[REDACTED]" in caplog.text


def test_forgot_reset_reports_supabase_weak_password_safely(client, monkeypatch):
    code = _send_forgot_code(client, monkeypatch, STUDENT_EMAIL)
    password = "Sunshine42Blue"
    raw_error = "weak_password: Password is too weak"

    fake_supabase = MagicMock()
    fake_supabase.auth.admin.list_users.return_value = [
        MagicMock(id="auth-test-id", email=STUDENT_EMAIL)
    ]
    fake_supabase.auth.admin.update_user_by_id.side_effect = Exception(raw_error)
    monkeypatch.setattr(auth, "supabase", fake_supabase)

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": code,
            "password": password,
            "confirmPassword": password,
        },
    )

    body = response.get_json()
    assert response.status_code == 400
    assert body["error"] == password_policy.SUPABASE_WEAK_PASSWORD_MESSAGE
    assert "weak_password" not in body["error"]
    assert auth._forgot_codes[STUDENT_EMAIL][0] == code


def _prepare_admin_weak_password(monkeypatch, client, side_effect):
    code = _send_admin_code(client, monkeypatch)
    responses = iter([[], [], [{"admin_id": "admin-test-id"}], []])
    monkeypatch.setattr(auth, "execute_with_retry", lambda query: MagicMock(data=next(responses)))

    fake_supabase = MagicMock()
    fake_supabase.auth.admin.create_user.side_effect = side_effect
    monkeypatch.setattr(auth, "supabase", fake_supabase)
    return code, fake_supabase


def test_admin_signup_rolls_back_when_supabase_rejects_password(client, monkeypatch, caplog):
    password = "Sunshine42Blue"
    code, fake_supabase = _prepare_admin_weak_password(
        monkeypatch, client, Exception(f"weak_password: invalid password {password}")
    )

    with caplog.at_level(logging.ERROR):
        response = client.post(
            "/api/auth/admin/signup",
            json={
                "email": ADMIN_EMAIL,
                "code": code,
                "password": password,
                "confirmPassword": password,
                "first_name": "Kenneth",
                "last_name": "Bautista",
                "role": "admin",
            },
        )

    body = response.get_json()
    assert response.status_code == 400
    assert body["error"] == password_policy.SUPABASE_WEAK_PASSWORD_MESSAGE
    assert password not in body["error"]
    assert password not in caplog.text
    assert "[REDACTED]" in caplog.text

    fake_supabase.table.return_value.delete.assert_called_once()
    fake_supabase.table.return_value.delete.return_value.eq.assert_called_once_with(
        "admin_id", "admin-test-id"
    )
    assert any(
        call.args == ("admin_accounts",) for call in fake_supabase.table.call_args_list
    )


def test_admin_rollback_failure_does_not_hide_weak_password_error(client, monkeypatch):
    code, fake_supabase = _prepare_admin_weak_password(
        monkeypatch, client, Exception("weak_password: Password is too weak")
    )
    fake_supabase.table.return_value.delete.side_effect = Exception("delete boom")

    response = client.post(
        "/api/auth/admin/signup",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "password": "Sunshine42Blue",
            "confirmPassword": "Sunshine42Blue",
            "first_name": "Kenneth",
            "last_name": "Bautista",
            "role": "admin",
        },
    )

    body = response.get_json()
    assert response.status_code == 400
    assert body["error"] == password_policy.SUPABASE_WEAK_PASSWORD_MESSAGE
    assert "delete boom" not in body["error"]
