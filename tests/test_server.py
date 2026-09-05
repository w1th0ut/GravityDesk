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
    fav_file = "favorites.json"
    try:
        with TestClient(app) as client:
            test_dir = os.path.realpath(os.getcwd())
            res = client.post(f"/api/favorites/toggle?path={test_dir}&token={token}")
            assert res.status_code == 200
            favs = res.json()
            assert isinstance(favs, list)
    finally:
        if os.path.exists(fav_file):
            try:
                os.remove(fav_file)
            except Exception:
                pass



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


def test_conversations_list_and_select():
    token = get_or_create_token()
    with TestClient(app) as client:
        res = client.get(f"/api/conversations?token={token}")
        assert res.status_code == 200
        data = res.json()
        assert "conversations" in data
        assert isinstance(data["conversations"], list)
        assert "active_id" in data

        res_sel = client.post(f"/api/conversations/select?id=new&token={token}")
        assert res_sel.status_code == 200
        assert res_sel.json()["status"] == "resumed"
        assert res_sel.json()["active_id"] is None


def test_device_pairing_and_revocation():
    """Verifies complete device management lifecycle: pairing, auth, revocation, and re-pairing."""
    token = get_or_create_token()
    test_device_id = "test-device-uuid-9999"
    test_device_name = "Samsung Galaxy S24 Test"
    devices_file = "devices.json"

    with TestClient(app) as client:
        # 1. Invalid token returns 401
        bad_pair = client.post(
            "/api/devices/pair",
            json={
                "device_id": test_device_id,
                "device_name": test_device_name,
                "platform": "android",
                "pair_token": "wrong-token",
            },
        )
        assert bad_pair.status_code == 401

        # 2. Valid token successfully pairs device
        pair_res = client.post(
            "/api/devices/pair",
            json={
                "device_id": test_device_id,
                "device_name": test_device_name,
                "platform": "android",
                "pair_token": token,
            },
        )
        assert pair_res.status_code == 200
        data = pair_res.json()
        assert data["status"] == "paired"
        assert data["device"]["id"] == test_device_id
        assert data["device"]["status"] == "active"

        # 3. Active device passes health check with X-Device-Id header
        health_res = client.get(
            f"/api/health?token={token}",
            headers={"X-Device-Id": test_device_id},
        )
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "online"

        # 4. Device appears in device list
        list_res = client.get(f"/api/devices?token={token}")
        assert list_res.status_code == 200
        dev_list = list_res.json()
        assert any(d["id"] == test_device_id and d["status"] == "active" for d in dev_list)

        # 5. Revoke the device
        revoke_res = client.post(
            f"/api/devices/revoke?token={token}",
            json={"device_id": test_device_id},
        )
        assert revoke_res.status_code == 200
        assert revoke_res.json()["status"] == "revoked"

        # 6. Revoked device is blocked from API endpoints with 403 Forbidden
        blocked_res = client.get(
            f"/api/health?token={token}",
            headers={"X-Device-Id": test_device_id},
        )
        assert blocked_res.status_code == 403
        assert "dicabut" in blocked_res.json()["detail"].lower()

        # 7. Re-pairing the device re-authorizes it seamlessly
        repair_res = client.post(
            "/api/devices/pair",
            json={
                "device_id": test_device_id,
                "device_name": test_device_name,
                "platform": "android",
                "pair_token": token,
            },
        )
        assert repair_res.status_code == 200
        assert repair_res.json()["device"]["status"] == "active"

        # 8. Re-authorized device passes health check again
        ok_res = client.get(
            f"/api/health?token={token}",
            headers={"X-Device-Id": test_device_id},
        )
        assert ok_res.status_code == 200

        # 9. Rename device
        rename_res = client.post(
            f"/api/devices/rename?token={token}",
            json={"device_id": test_device_id, "name": "HP Utama"},
        )
        assert rename_res.status_code == 200
        assert rename_res.json()["device"]["name"] == "HP Utama"

        # 10. Delete device
        delete_res = client.post(
            f"/api/devices/delete?token={token}",
            json={"device_id": test_device_id},
        )
        assert delete_res.status_code == 200
        assert delete_res.json()["status"] == "deleted"

        list_after = client.get(f"/api/devices?token={token}")
        assert not any(d["id"] == test_device_id for d in list_after.json())


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
    test_conversations_list_and_select()
    print("[PASS] test_conversations_list_and_select (Conversation discovery and resumption)")
    test_favorites_toggle()
    print("[PASS] test_favorites_toggle (Favorites persistence)")
    test_command_allowlist_enforcement()
    print("[PASS] test_command_allowlist_enforcement (Blocked Remote Code Execution)")
    test_session_lifecycle()
    print("[PASS] test_session_lifecycle (PTY lifecycle & atomic state)")
    test_device_pairing_and_revocation()
    print("[PASS] test_device_pairing_and_revocation (Device pairing, revocation & re-pairing)")
    print("\nALL HARDENED INTEGRATION TESTS PASSED WITH ZERO ERRORS! 🚀")
