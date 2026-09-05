import os
import sys
import pytest
from fastapi.testclient import TestClient

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
from server.main import app, server_token
from server.network import get_or_create_token


def test_health_unauthorized():
    with TestClient(app) as client:
        res = client.get("/api/health")
        assert res.status_code == 401


def test_health_authorized():
    token = get_or_create_token()
    with TestClient(app) as client:
        res = client.get(f"/api/health?token={token}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "online"
        assert "cpu_percent" in data
        assert "memory_percent" in data
        assert "tailscale_ip" in data


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
        test_dir = os.path.abspath(os.getcwd())
        res = client.post(f"/api/favorites/toggle?path={test_dir}&token={token}")
        assert res.status_code == 200
        favs = res.json()
        assert isinstance(favs, list)


def test_session_lifecycle():
    token = get_or_create_token()
    with TestClient(app) as client:
        # Start session with cmd.exe for quick test
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


if __name__ == "__main__":
    print("Running PoC integration tests...")
    test_health_unauthorized()
    print("[PASS] test_health_unauthorized passed")
    test_health_authorized()
    print("[PASS] test_health_authorized passed")
    test_workspaces_navigation()
    print("[PASS] test_workspaces_navigation passed")
    test_favorites_toggle()
    print("[PASS] test_favorites_toggle passed")
    test_session_lifecycle()
    print("[PASS] test_session_lifecycle passed")
    print("\nALL POC INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀")
