# tests/test_student_id_case_normalization.py
#
# S-1: case-sensitive student lookups. The DB stores student ids in
# their canonical UPPERCASE form (e.g. TEST001), while URLs carry the
# lowercase email local part (test001). `ensure_student_access` already
# compares case-insensitively (normalize_student_id uppercases both
# sides), but the DOWNSTREAM data lookups passed the raw path id into a
# case-sensitive Postgres .eq() — so a student could pass the
# authorization guard and still get "Student not found".
#
# Contract pinned here: a lowercase path id finds the stored uppercase
# row (200) and the response echoes the canonical stored id; an
# all-numeric id (no case) keeps working; a genuinely missing id still
# 404s.

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

TEST001_LOWER = "test001"
TEST001_UPPER = "TEST001"
NUMERIC_ID = "202310130"

# _verify_token is stubbed, but the header must still be present or
# _get_bearer_token() rejects the request before verification runs.
_AUTH = {"Authorization": "Bearer fake-token"}


def _user(email):
    user = MagicMock()
    user.id = f"uid-{email}"
    user.email = email
    return user


def _login(stack, email, student_id):
    """Authenticate a fake student caller and stub the role resolvers."""
    stack.enter_context(
        patch("routers.auth_guard._verify_token", return_value=_user(email))
    )
    stack.enter_context(
        patch("routers.auth_guard.is_admin_user", return_value=False)
    )
    stack.enter_context(
        patch("routers.auth_guard.resolve_student_id", return_value=student_id)
    )


def _test001(stack):
    _login(stack, f"{TEST001_LOWER}@gordoncollege.edu.ph", TEST001_UPPER)


def _single_row_when_normalized(row, expected_id=TEST001_UPPER):
    """execute_with_retry stand-in for .maybe_single() lookups: return
    the row only when the query's student_id filter carries the
    normalized (canonical) id — a raw mismatched-case id gets the empty
    sentinel, exactly like the real case-sensitive Postgres .eq()."""
    def side_effect(query):
        params = str(getattr(query, "params", ""))
        if f"student_id=eq.{expected_id}" in params:
            return MagicMock(data=row)
        return MagicMock(data=None)
    return side_effect


# ---------------------------------------------------------------------------
# GET /api/masterlist/students/<sid> — lowercase id finds TEST001
# ---------------------------------------------------------------------------

def test_masterlist_lowercase_id_returns_canonical_uppercase():
    """test001 GETs their own masterlist summary -> 200 with the
    canonical stored id TEST001 (was 404 "Student not found")."""
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _test001(stack)
        stack.enter_context(
            patch(
                "routers.masterlist.execute_with_retry",
                side_effect=_single_row_when_normalized(
                    {"student_id": TEST001_UPPER, "full_name": "Test Student"}
                ),
            )
        )
        resp = app.test_client().get(
            f"/api/masterlist/students/{TEST001_LOWER}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["data"]["student_id"] == TEST001_UPPER


# ---------------------------------------------------------------------------
# GET /api/records/<sid> — regression pin (already normalizes)
# ---------------------------------------------------------------------------

def test_records_lowercase_id_200():
    """test001 GETs their own record header -> 200 (records already
    normalized; pinned here so the S-1 contract stays covered)."""
    from main import app
    app.config["TESTING"] = True

    def side_effect(query):
        path = str(getattr(query, "path", ""))
        params = str(getattr(query, "params", ""))
        if "annual_examinations" in path:
            return MagicMock(data=[])
        if f"student_id=eq.{TEST001_UPPER}" in params:
            return MagicMock(
                data={"student_id": TEST001_UPPER, "full_name": "Test Student"}
            )
        return MagicMock(data=None)

    with ExitStack() as stack:
        _test001(stack)
        stack.enter_context(
            patch("routers.student_record.execute_with_retry",
                  side_effect=side_effect)
        )
        resp = app.test_client().get(
            f"/api/records/{TEST001_LOWER}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)


# ---------------------------------------------------------------------------
# GET /students/<sid> — lowercase id finds TEST001
# ---------------------------------------------------------------------------

def test_student_route_lowercase_id_returns_canonical_uppercase():
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _test001(stack)
        stack.enter_context(
            patch(
                "routers.student.execute_with_retry",
                side_effect=_single_row_when_normalized(
                    {"student_id": TEST001_UPPER, "full_name": "Test Student"}
                ),
            )
        )
        resp = app.test_client().get(
            f"/students/{TEST001_LOWER}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["student"]["student_id"] == TEST001_UPPER


# ---------------------------------------------------------------------------
# GET /feedback/<sid> — lowercase id finds TEST001's rows
# ---------------------------------------------------------------------------

def test_feedback_lowercase_id_returns_rows():
    from main import app
    app.config["TESTING"] = True

    rows = [{
        "feedback_id": 1,
        "rating": 5,
        "message": "ok",
        "created_at": "2026-01-01T00:00:00+00",
    }]

    def side_effect(query):
        params = str(getattr(query, "params", ""))
        if f"student_id=eq.{TEST001_UPPER}" in params:
            return MagicMock(data=rows)
        return MagicMock(data=[])

    with ExitStack() as stack:
        _test001(stack)
        stack.enter_context(
            patch("routers.feedback.execute_with_retry", side_effect=side_effect)
        )
        resp = app.test_client().get(
            f"/feedback/{TEST001_LOWER}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["count"] == 1


# ---------------------------------------------------------------------------
# GET /notifications/<sid> — lowercase id finds TEST001's appointments
# ---------------------------------------------------------------------------

def test_notifications_lowercase_id_returns_rows():
    from main import app
    app.config["TESTING"] = True

    def side_effect(query):
        params = str(getattr(query, "params", ""))
        if f"student_id=eq.{TEST001_UPPER}" in params:
            return MagicMock(data=[{
                "appointment_id": 1,
                "appointment_date": "2026-01-01",
                "appointment_time": "09:00:00",
            }])
        # The status-history leg is an .in_() on appointment ids —
        # match the operator, not the bare column name (the first
        # query's select= list also mentions appointment_id).
        if "appointment_id=in." in params:
            return MagicMock(data=[{
                "status_id": 9,
                "appointment_id": 1,
                "new_status": "pending",
                "changed_at": "2026-01-01T10:00:00+00",
                "remarks": None,
            }])
        return MagicMock(data=[])

    with ExitStack() as stack:
        _test001(stack)
        stack.enter_context(
            patch("routers.notifications.execute_with_retry",
                  side_effect=side_effect)
        )
        resp = app.test_client().get(
            f"/notifications/{TEST001_LOWER}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["count"] == 1


# ---------------------------------------------------------------------------
# Regression: an all-numeric id has no case to normalize
# ---------------------------------------------------------------------------

def test_numeric_id_still_works():
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _login(stack, f"{NUMERIC_ID}@gordoncollege.edu.ph", NUMERIC_ID)
        stack.enter_context(
            patch(
                "routers.masterlist.execute_with_retry",
                side_effect=_single_row_when_normalized(
                    {"student_id": NUMERIC_ID, "full_name": "Numeric Student"},
                    expected_id=NUMERIC_ID,
                ),
            )
        )
        resp = app.test_client().get(
            f"/api/masterlist/students/{NUMERIC_ID}", headers=_AUTH
        )
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()["data"]["student_id"] == NUMERIC_ID


# ---------------------------------------------------------------------------
# A genuinely missing id still 404s (guard passes — caller "owns" the
# id — but the row doesn't exist in the masterlist).
# ---------------------------------------------------------------------------

def test_nonexistent_id_still_404():
    from main import app
    app.config["TESTING"] = True

    with ExitStack() as stack:
        _login(stack, "ghost999@gordoncollege.edu.ph", "GHOST999")
        stack.enter_context(
            patch("routers.masterlist.execute_with_retry",
                  return_value=MagicMock(data=None))
        )
        resp = app.test_client().get(
            "/api/masterlist/students/ghost999", headers=_AUTH
        )
        assert resp.status_code == 404, resp.get_data(as_text=True)
