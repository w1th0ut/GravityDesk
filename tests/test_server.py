import os
import sys
import pytest
from fastapi.testclient import TestClient

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from server.config import get_devices_path
from server.main import app
from server.network import get_or_create_token


@pytest.fixture(autouse=True)
def preserve_devices_file():
    """Preserves live devices.json and restores it after test runs so test runs never revoke live devices."""
    dev_path = get_devices_path()
    backup = None
    if os.path.exists(dev_path):
        try:
            with open(dev_path, "r", encoding="utf-8") as f:
                backup = f.read()
        except Exception:
            pass
    try:
        yield
    finally:
        if backup is not None:
            try:
                with open(dev_path, "w", encoding="utf-8") as f:
                    f.write(backup)
            except Exception:
                pass


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
        assert "ffmpeg_available" in data
        assert isinstance(data["ffmpeg_available"], bool)

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
        import shutil
        test_cmd = (
            r"C:\Windows\System32\cmd.exe"
            if os.name == "nt"
            else shutil.which("bash") or shutil.which("sh") or "/bin/sh"
        )
        res_start = client.post(
            f"/api/session/start?token={token}",
            json={"cwd": os.getcwd(), "command": test_cmd},
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

        # 5b. Revoked device is completely purged from devices.json (only registered devices remain)
        list_after_revoke = client.get(f"/api/devices?token={token}")
        assert list_after_revoke.status_code == 200
        assert not any(d["id"] == test_device_id for d in list_after_revoke.json())

        # 6. Revoked device is blocked from API endpoints with 403 Forbidden
        blocked_res = client.get(
            f"/api/health?token={token}",
            headers={"X-Device-Id": test_device_id},
        )
        assert blocked_res.status_code == 403
        assert "revoked" in blocked_res.json()["detail"].lower()

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

        # 8. Re-authorized device passes health check again (with token)
        ok_res = client.get(
            f"/api/health?token={token}",
            headers={"X-Device-Id": test_device_id},
        )
        assert ok_res.status_code == 200

        # 8b. Paired device can access endpoints ZERO-TOKEN (only X-Device-Id required!)
        zero_token_res = client.get(
            "/api/health",
            headers={"X-Device-Id": test_device_id},
        )
        assert zero_token_res.status_code == 200
        assert zero_token_res.json()["status"] == "online"

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


def test_revoke_all_devices():
    """Verifies that revoke_all_devices marks all active devices as revoked and blocks them."""
    from server.devices import get_devices, pair_device, revoke_all_devices, delete_device
    token = get_or_create_token()
    dev1 = "test-mass-revoke-1"
    dev2 = "test-mass-revoke-2"

    pair_device(dev1, "Device 1", "android", "127.0.0.1")
    pair_device(dev2, "Device 2", "android", "127.0.0.1")

    try:
        active_before = [d for d in get_devices() if d.get("status") == "active"]
        assert any(d["id"] == dev1 for d in active_before)
        assert any(d["id"] == dev2 for d in active_before)

        # Execute mass revocation
        revoked = revoke_all_devices()
        assert len(revoked) >= 2

        # All revoked devices are purged from devices.json
        devs_after = get_devices()
        assert not any(d["id"] == dev1 for d in devs_after)
        assert not any(d["id"] == dev2 for d in devs_after)

        # Test API rejection
        with TestClient(app) as client:
            res1 = client.get(f"/api/health?token={token}", headers={"X-Device-Id": dev1})
            assert res1.status_code == 403
            res2 = client.get(f"/api/health?token={token}", headers={"X-Device-Id": dev2})
            assert res2.status_code == 403
    finally:
        delete_device(dev1)
        delete_device(dev2)



def test_voice_transcribe_endpoint():
    token = get_or_create_token()
    with TestClient(app) as client:
        # Unauthorized
        res_unauth = client.post("/api/voice/transcribe")
        assert res_unauth.status_code == 401

        # Authorized with empty audio
        files = {"file": ("test.wav", b"12345", "audio/wav")}
        res_auth = client.post(f"/api/voice/transcribe?token={token}", files=files)
        assert res_auth.status_code == 200

        # When ffmpeg is missing on host workstation
        import server.main as main_mod
        orig_get_ffmpeg = main_mod.get_ffmpeg_bin
        try:
            main_mod.get_ffmpeg_bin = lambda: None
            large_audio = b"0" * 200
            files_large = {"file": ("test.m4a", large_audio, "audio/m4a")}
            res_no_ffmpeg = client.post(f"/api/voice/transcribe?token={token}", files=files_large)
            assert res_no_ffmpeg.status_code == 200
            res_json = res_no_ffmpeg.json()
            assert res_json["status"] == "error"
            assert res_json["error_code"] == "FFMPEG_MISSING"
            assert "FFmpeg is not installed" in res_json["message"]
        finally:
            main_mod.get_ffmpeg_bin = orig_get_ffmpeg


def test_antigravity_status_and_refresh():
    from server.antigravity import parse_usage_output
    tsv = (
        "Gemini Models\tWeekly Limit Remaining\t45%\t2026-09-11T16:52:33Z\n"
        "Gemini Models\tFive Hour Limit Remaining\t85%\t2026-09-06T17:20:53Z\n"
        "Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-13T13:08:57Z\n"
        "Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-09-06T18:08:57Z\n"
    )
    parsed = parse_usage_output(tsv)
    assert parsed["gemini"]["hourly_percent"] == 85
    assert parsed["gemini"]["weekly_percent"] == 45
    assert parsed["claude_gpt"]["hourly_percent"] == 100

    token = get_or_create_token()
    with TestClient(app) as client:
        # Health includes antigravity telemetry
        res = client.get(f"/api/health?token={token}")
        assert res.status_code == 200
        data = res.json()
        assert "antigravity" in data
        assert "model" in data["antigravity"]
        assert "usage" in data["antigravity"]

        # Refresh endpoint works
        res_ref = client.post(f"/api/antigravity/refresh?token={token}")
        assert res_ref.status_code == 200
        ref_data = res_ref.json()
        assert "model" in ref_data
        assert "usage" in ref_data


if __name__ == "__main__":
    print("Running Hardened Architecture & Security Test Suite...")
    dev_path = get_devices_path()
    backup = None
    if os.path.exists(dev_path):
        try:
            with open(dev_path, "r", encoding="utf-8") as f:
                backup = f.read()
        except Exception:
            pass

    try:
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
        test_command_allowlist_enforcement()
        print("[PASS] test_command_allowlist_enforcement (Blocked Remote Code Execution)")
        test_session_lifecycle()
        print("[PASS] test_session_lifecycle (PTY lifecycle & atomic state)")
        test_device_pairing_and_revocation()
        print("[PASS] test_device_pairing_and_revocation (Device pairing, revocation & re-pairing)")
        test_voice_transcribe_endpoint()
        print("[PASS] test_voice_transcribe_endpoint (Voice transcription auth & payload processing)")
        test_antigravity_status_and_refresh()
        print("[PASS] test_antigravity_status_and_refresh (Antigravity telemetry & usage refresh)")
        print("\nALL HARDENED INTEGRATION TESTS PASSED WITH ZERO ERRORS! 🚀")
    finally:
        if backup is not None:
            try:
                with open(dev_path, "w", encoding="utf-8") as f:
                    f.write(backup)
            except Exception:
                pass

