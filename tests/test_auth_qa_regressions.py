import secrets
import time
from unittest.mock import MagicMock

import pytest

import routers.auth as auth
import routers.auth_guard as guard
from main import app

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


def test_generate_code_uses_cryptographic_randomness(monkeypatch):
    monkeypatch.setattr(secrets, "randbelow", lambda _n: 42)

    assert auth._generate_code() == "000042"


@pytest.mark.parametrize(
    "email",
    [
        "student@gordoncollege.edu.ph",
        "202311330@gmail.com",
        "bautista.kenneth@gmail.com",
    ],
)
@pytest.mark.parametrize(
    "endpoint",
    [
        "/api/auth/forgot/check-email",
        "/api/auth/forgot/send-code",
    ],
)
def test_forgot_endpoints_reject_non_role_formats(client, monkeypatch, endpoint, email):
    monkeypatch.setattr(auth, "execute_with_retry", lambda _q: MagicMock(data=[]))

    response = client.post(endpoint, json={"email": email})

    assert response.status_code == 400
    assert "email" in response.get_json()["error"].lower()


@pytest.mark.parametrize(
    "endpoint,email,expected_status",
    [
        ("/api/auth/forgot/check-email", STUDENT_EMAIL, 200),
        ("/api/auth/forgot/check-email", ADMIN_EMAIL, 200),
        ("/api/auth/forgot/send-code", ADMIN_EMAIL, 200),
        ("/api/auth/forgot/send-code", STUDENT_EMAIL, 404),
    ],
)
def test_forgot_endpoints_accept_valid_role_formats(
    client, monkeypatch, endpoint, email, expected_status
):
    monkeypatch.setattr(auth, "execute_with_retry", lambda _q: MagicMock(data=[]))

    response = client.post(endpoint, json={"email": email})

    body = response.get_json()
    assert response.status_code == expected_status
    assert response.status_code != 400
    if endpoint.endswith("/send-code") and email == STUDENT_EMAIL:
        assert body["success"] is False
        assert body["error"] == auth.STUDENT_FORGOT_ACCOUNT_NOT_FOUND_MESSAGE
    else:
        assert body["success"] is True
        assert body["message"] == auth.FORGOT_GENERIC_MESSAGE
        assert "exists" not in body


def test_forgot_reset_rejects_non_role_formats(client, monkeypatch):
    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": "student@gordoncollege.edu.ph",
            "code": "123456",
            "password": "Password123",
            "confirmPassword": "Password123",
        },
    )

    assert response.status_code == 400
    assert "email" in response.get_json()["error"].lower()


@pytest.mark.parametrize(
    "endpoint,email",
    [
        ("/api/auth/forgot/check-email", "202399991@gordoncollege.edu.ph"),
        ("/api/auth/forgot/check-email", ADMIN_EMAIL),
        ("/api/auth/forgot/send-code", ADMIN_EMAIL),
    ],
)
def test_forgot_endpoints_do_not_reveal_missing_account(
    client, monkeypatch, endpoint, email
):
    monkeypatch.setattr(auth, "execute_with_retry", lambda _q: MagicMock(data=[]))

    response = client.post(endpoint, json={"email": email})
    body = response.get_json()
    text = f"{body.get('error', '')} {body.get('message', '')}".lower()

    assert response.status_code == 200
    assert body.get("success") is True
    assert body["message"] == auth.FORGOT_GENERIC_MESSAGE
    assert "exists" not in body
    assert "no account" not in text
    assert "sign up" not in text


def test_forgot_reset_does_not_reveal_missing_auth_user(client, monkeypatch):
    auth._forgot_codes[STUDENT_EMAIL] = ("123456", time.time())
    monkeypatch.setattr(auth, "_find_auth_user_by_email", lambda _email: None)

    response = client.post(
        "/api/auth/forgot/reset",
        json={
            "email": STUDENT_EMAIL,
            "code": "123456",
            "password": "NewPassword123",
            "confirmPassword": "NewPassword123",
        },
    )
    body = response.get_json()
    text = f"{body.get('error', '')} {body.get('message', '')}".lower()

    assert response.status_code == 400
    assert "account" not in text
    assert "not found" not in text


def test_pending_admin_is_not_authorised(monkeypatch):
    responses = iter([
        MagicMock(data=[{"admin_id": "admin-1"}]),
        MagicMock(data=[{"is_active": False}]),
    ])
    monkeypatch.setattr(guard, "execute_with_retry", lambda _q: next(responses))
    user = MagicMock(id="auth-1", email=ADMIN_EMAIL)

    assert guard.is_admin_user(user) is False


def test_active_admin_is_authorised(monkeypatch):
    responses = iter([
        MagicMock(data=[{"admin_id": "admin-1"}]),
        MagicMock(data=[{"is_active": True}]),
    ])
    monkeypatch.setattr(guard, "execute_with_retry", lambda _q: next(responses))
    user = MagicMock(id="auth-1", email=ADMIN_EMAIL)

    assert guard.is_admin_user(user) is True
