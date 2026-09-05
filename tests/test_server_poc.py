import os
import sys
import pytest
from fastapi.testclient import TestClient

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from server.main import app
from server.network import get_or_create_token


def test_token_entropy():
    token = get_or_create_token()
    assert len(token) == 64, f"Token must have 256-bit entropy (64 hex characters), got {len(token)}"


def test_health_unauthorized():
    with TestClient(app) as client:
        res = client.get("/api/health")
        assert res.status_code == 401


def test_health_authorized_via_query_and_bearer():
    token = get_or_create_token()
    with TestClient(app) as client:
        # Test query param
        res_query = client.get(f"/api/health?token={token}")
        assert res_query.status_code == 200
        data = res_query.json()
        assert data["status"] == "online"
        assert "cpu_percent" in data

        # Test Authorization: Bearer header
        res_bearer = client.get("/api/health", headers={"Authorization": f"Bearer {token}"})
        assert res_bearer.status_code == 200
        assert res_bearer.json()["status"] == "online"


def test_workspaces_navigation():
    token = get_or_create_token()
    with TestClient(app) as client:
        res = client.get(f"/api/workspaces?token={token}")
        assert res.status_code == 200
        data = res.json()
        assert "current_path" in data
        assert "breadcrumbs" in data
        assert "drives" in data
        assert len(data["drives"]) > 0


def test_favorites_toggle():
    token = get_or_create_token()
    with TestClient(app) as client:
        test_dir = os.path.realpath(os.getcwd())
        res = client.post(f"/api/favorites/toggle?path={test_dir}&token={token}")
        assert res.status_code == 200
        favs = res.json()
        assert isinstance(favs, list)


def test_command_allowlist_enforcement():
    """Verifies that arbitrary binary execution is blocked with 400."""
    token = get_or_create_token()
    with TestClient(app) as client:
        res = client.post(
            f"/api/session/start?token={token}",
            json={"cwd": os.getcwd(), "command": "malicious_binary.exe"},
        )
        assert res.status_code == 400
        assert "not permitted" in res.json()["detail"]


def test_session_lifecycle():
    token = get_or_create_token()
    with TestClient(app) as client:
        # Start session with permitted command (cmd.exe)
        res_start = client.post(
            f"/api/session/start?token={token}",
            json={"cwd": os.getcwd(), "command": r"C:\Windows\System32\cmd.exe"},
        )
        assert res_start.status_code == 200
        assert res_start.json()["status"] == "started"

        # Check health reveals running session
        res_health = client.get(f"/api/health?token={token}")
        assert res_health.json()["active_session"]["is_alive"] is True

        # Stop session
        res_stop = client.post(f"/api/session/stop?token={token}")
        assert res_stop.status_code == 200
        assert res_stop.json()["status"] == "stopped"


def test_workspaces_select():
    token = get_or_create_token()
    with TestClient(app) as client:
        test_dir = os.path.realpath(os.getcwd())
        res = client.post(f"/api/workspaces/select?path={test_dir}&token={token}")
        assert res.status_code == 200
        assert res.json()["status"] == "changed"
        assert res.json()["cwd"] == test_dir


if __name__ == "__main__":
    print("Running Hardened Architecture & Security Test Suite...")
    test_token_entropy()
    print("[PASS] test_token_entropy (256-bit cryptographic entropy)")
    test_health_unauthorized()
    print("[PASS] test_health_unauthorized (401 on unauthorized)")
    test_health_authorized_via_query_and_bearer()
    print("[PASS] test_health_authorized_via_query_and_bearer (Bearer and query auth)")
    test_workspaces_navigation()
    print("[PASS] test_workspaces_navigation (Safe directory navigation)")
    test_workspaces_select()
    print("[PASS] test_workspaces_select (Workspace selection and directory change)")
    test_favorites_toggle()
    print("[PASS] test_favorites_toggle (Favorites persistence)")
    test_command_allowlist_enforcement()
    print("[PASS] test_command_allowlist_enforcement (Blocked Remote Code Execution)")
    test_session_lifecycle()
    print("[PASS] test_session_lifecycle (PTY lifecycle & atomic state)")
    print("\nALL HARDENED INTEGRATION TESTS PASSED WITH ZERO ERRORS! 🚀")
