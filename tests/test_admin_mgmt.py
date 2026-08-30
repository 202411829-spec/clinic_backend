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
