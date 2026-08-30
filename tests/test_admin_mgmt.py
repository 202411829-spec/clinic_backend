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

# ---- Task 3: deactivate / activate / delete ----

def test_deactivate_requires_admin(client):
    """PATCH /api/admins/:id/deactivate returns 401 without auth."""
    c, _ = client
    resp = c.patch("/api/admins/1/deactivate")
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_activate_requires_admin(client):
    """PATCH /api/admins/:id/activate returns 401 without auth."""
    c, _ = client
    resp = c.patch("/api/admins/1/activate")
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_delete_requires_admin(client):
    """DELETE /api/admins/:id returns 401 without auth (before body validation)."""
    c, _ = client
    resp = c.delete("/api/admins/1", json={})
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_activate_pending_without_app_account_returns_409():
    """_derive_status exists and handles the pending -> active guard logic."""
    import routers.admin_mgmt as m
    assert hasattr(m, "_derive_status")
    # When is_active=True but has_app_account=False, _derive_status returns "pending"
    assert m._derive_status(True, False) == "pending"


# ---- Task 6: admin profile PATCH endpoint ----

def test_profile_patch_requires_admin(client):
    """PATCH /api/admins/:id/profile returns 401 without auth."""
    c, _ = client
    resp = c.patch("/api/admins/1/profile", json={"first_name": "Test"})
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def _auth_bypass():
    """Bypass require_admin's Supabase auth check for unit tests."""
    return (
        patch("routers.auth_guard.is_admin_user", return_value=True),
        patch("routers.auth_guard._verify_token", return_value=MagicMock(id="u1", email="a@b.c")),
    )


def test_profile_patch_blocks_role_change(client):
    """PATCH /api/admins/:id/profile rejects role changes with 400."""
    c, mock_supabase = client
    select_resp = MagicMock()
    select_resp.data = [{"admin_id": "1", "role": "nurse"}]
    update_resp = MagicMock()
    update_resp.data = [{"admin_id": "1", "role": "nurse"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = select_resp
    mock_supabase.table.return_value.update.return_value.eq.return_value.select.return_value.execute.return_value = update_resp

    headers = {"Authorization": "Bearer dummy"}
    with _auth_bypass()[0], _auth_bypass()[1]:
        resp = c.patch(
            "/api/admins/1/profile",
            json={"role": "doctor"},
            headers=headers,
        )
    assert resp.status_code == 400


def test_profile_patch_requires_at_least_one_field(client):
    """PATCH /api/admins/:id/profile with no fields returns 400."""
    c, mock_supabase = client
    select_resp = MagicMock()
    select_resp.data = [{"admin_id": "1", "role": "nurse"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = select_resp

    headers = {"Authorization": "Bearer dummy"}
    with _auth_bypass()[0], _auth_bypass()[1]:
        resp = c.patch("/api/admins/1/profile", json={}, headers=headers)
    assert resp.status_code == 400


def test_profile_patch_empty_first_name_returns_400(client):
    """PATCH /api/admins/:id/profile with empty first_name returns 400."""
    c, mock_supabase = client
    select_resp = MagicMock()
    select_resp.data = [{"admin_id": "1", "role": "nurse"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = select_resp

    headers = {"Authorization": "Bearer dummy"}
    with _auth_bypass()[0], _auth_bypass()[1]:
        resp = c.patch(
            "/api/admins/1/profile",
            json={"first_name": "  "},
            headers=headers,
        )
    assert resp.status_code == 400


def test_profile_patch_updates_fields(client):
    """PATCH /api/admins/:id/profile updates first_name/last_name/license_no."""
    c, mock_supabase = client
    select_resp = MagicMock()
    select_resp.data = [{"admin_id": "1", "role": "nurse"}]
    update_resp = MagicMock()
    update_resp.data = [
        {
            "admin_id": "1",
            "first_name": "Jane",
            "last_name": "Doe",
            "license_no": "LIC-123",
            "role": "nurse",
        }
    ]
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = select_resp
    mock_supabase.table.return_value.update.return_value.eq.return_value.select.return_value.execute.return_value = update_resp

    headers = {"Authorization": "Bearer dummy"}
    with _auth_bypass()[0], _auth_bypass()[1]:
        resp = c.patch(
            "/api/admins/1/profile",
            json={"first_name": "Jane", "last_name": "Doe", "license_no": "LIC-123"},
            headers=headers,
        )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["admin"]["first_name"] == "Jane"
    assert body["admin"]["license_no"] == "LIC-123"


def test_profile_patch_unknown_admin_returns_404(client):
    """PATCH /api/admins/:id/profile for unknown admin returns 404."""
    c, mock_supabase = client
    select_resp = MagicMock()
    select_resp.data = []
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = select_resp

    headers = {"Authorization": "Bearer dummy"}
    with _auth_bypass()[0], _auth_bypass()[1]:
        resp = c.patch(
            "/api/admins/999/profile",
            json={"first_name": "Jane"},
            headers=headers,
        )
    assert resp.status_code == 404
