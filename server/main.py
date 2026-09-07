import argparse
import asyncio
import collections
from contextlib import asynccontextmanager
import io
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
from typing import Dict, List, Optional, Set
import speech_recognition as sr
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from server.conversations import list_conversations
from server.devices import (
    delete_device,
    get_devices,
    is_device_authorized,
    is_device_revoked,
    notify_device_event,
    pair_device,
    rename_device,
    revoke_device,
    touch_device,
)
from server.antigravity import agy_monitor
from server.network import get_or_create_token, get_tailscale_or_lan_ip, print_ascii_qr, revoke_and_create_token
from server.system import disable_sleep_inhibit, enable_sleep_inhibit, get_system_vitals
from server.terminal import TerminalSession, hub
from server.workspaces import list_directory

# Global State
server_token: str = ""
server_ip: str = ""
active_device_sockets: Dict[str, Set[WebSocket]] = collections.defaultdict(set)
sockets_lock = threading.Lock()


def get_online_device_ids() -> Set[str]:
    """Returns the set of device IDs with currently connected streaming WebSockets."""
    with sockets_lock:
        return {d_id for d_id, sockets in active_device_sockets.items() if len(sockets) > 0}


def kick_device_sockets(device_id: str) -> None:
    """Closes all active streaming WebSocket connections for a revoked device."""
    with sockets_lock:
        sockets = list(active_device_sockets.get(device_id, set()))
        if device_id in active_device_sockets:
            del active_device_sockets[device_id]

    notify_device_event("disconnected", {"id": device_id})

    if not sockets:
        return

    for ws in sockets:
        if hub.loop and hub.loop.is_running():
            asyncio.run_coroutine_threadsafe(_close_socket_async(ws), hub.loop)


def kick_all_device_sockets() -> None:
    """Closes all active streaming WebSocket connections across all devices."""
    with sockets_lock:
        all_sockets: List[WebSocket] = []
        for sockets in active_device_sockets.values():
            all_sockets.extend(sockets)
        active_device_sockets.clear()

    notify_device_event("disconnected_all", {})

    for ws in all_sockets:
        if hub.loop and hub.loop.is_running():
            asyncio.run_coroutine_threadsafe(_close_socket_async(ws), hub.loop)


async def _close_socket_async(ws: WebSocket) -> None:
    try:
        await ws.send_json({"type": "revoked", "message": "Device access has been revoked from host."})
        await ws.close(code=4001, reason="Device Revoked")
    except Exception:
        pass


def update_server_token(new_token: str) -> None:
    """Dynamically updates active authentication token without restarting server."""
    global server_token
    server_token = new_token


def display_startup_banner(ip: str, port: int, token: str) -> None:
    """Prints the connection URLs and terminal ASCII QR code."""
    pair_qr_payload = f"gravitydesk://pair?host={ip}:{port}&token={token}"
    daemon_url = f"http://{ip}:{port}"

    print("\n" + "=" * 60)
    print("[*] GRAVITYDESK SERVER READY")
    print("=" * 60)
    print(f"[*] Daemon Host:  {daemon_url}")
    print(f"[*] Tailscale IP: {ip}")
    print(f"[*] Pairing:      Scan QR Code on screen with Android App")
    print("\nScan this QR Code to pair device:")
    try:
        print_ascii_qr(pair_qr_payload)
    except Exception as e:
        print(f"[Warning] Could not print ASCII QR: {e}")
    print("=" * 60 + "\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global server_token, server_ip
    server_token = get_or_create_token()
    server_ip = get_tailscale_or_lan_ip()
    port = int(os.environ.get("PORT", 8000))

    loop = asyncio.get_running_loop()
    hub.set_loop(loop)
    hub.current_cwd = os.environ.get("DEFAULT_WORKSPACE", str(Path.home()))

    # Inhibit Windows Sleep while daemon is active
    enable_sleep_inhibit()

    # Pre-cache Antigravity active model and usage limits
    agy_monitor.trigger_refresh_async()

    # Terminal Startup Banner & QR (suppressed in GUI mode)
    if os.environ.get("GRAVITYDESK_GUI") != "1":
        display_startup_banner(server_ip, port, server_token)

    yield

    # Teardown
    if os.environ.get("GRAVITYDESK_GUI") != "1":
        print("[Server] Shutting down GravityDesk...")
    disable_sleep_inhibit()
    hub.stop_session()


app = FastAPI(title="GravityDesk Daemon", lifespan=lifespan)

# Allow CORS for mobile app and web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_token(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    device_id: Optional[str] = Query(None),
) -> str:
    """
    Timing-attack-safe authentication validator.
    1. Paired devices: Authenticated directly via registered device ID.
    2. Master Token: Authenticated via Bearer token or query parameter. Auto-registers active device if provided.
    3. Revoked devices: Blocked with 403 Forbidden.
    """
    active_id = x_device_id or device_id

    # Extract client token if present
    client_token = token
    if authorization and authorization.startswith("Bearer "):
        client_token = authorization.split("Bearer ", 1)[1].strip()

    has_valid_master = bool(client_token and secrets.compare_digest(client_token, server_token))

    if active_id:
        if is_device_revoked(active_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device access has been revoked",
            )
        if is_device_authorized(active_id):
            touch_device(active_id)
            return "device-authorized"
        if has_valid_master:
            pair_device(active_id, "Android Device", "android", "remote")
            touch_device(active_id)
            return "master-and-device-authorized"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device access has been revoked or is not registered",
        )

    # Master Token Authentication (when no device ID is provided)
    if has_valid_master:
        return client_token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Device is not registered or pairing token is invalid. Please scan QR Code on desktop.",
    )


class PairDeviceRequest(BaseModel):
    device_id: str
    device_name: str
    platform: Optional[str] = "android"
    pair_token: str


class RevokeDeviceRequest(BaseModel):
    device_id: str


@app.post("/api/devices/pair")
async def pair_device_endpoint(req: PairDeviceRequest, request: Request):
    """Pairs a device (Android / Web) using the QR scan pair token."""
    if not req.pair_token or not secrets.compare_digest(req.pair_token, server_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid pairing token",
        )

    client_ip = request.client.host if request.client else "127.0.0.1"
    device = pair_device(
        device_id=req.device_id,
        name=req.device_name,
        platform=req.platform or "android",
        ip=client_ip,
    )
    hub.notify_event(f"Device connected: {device['name']} ({device['platform']})")
    return {
        "status": "paired",
        "device": device,
        "token": server_token,
    }


@app.get("/api/devices")
async def get_devices_endpoint(_: str = Depends(verify_token)):
    """Returns list of registered devices."""
    return get_devices()


@app.post("/api/devices/revoke")
async def revoke_device_endpoint(req: RevokeDeviceRequest, _: str = Depends(verify_token)):
    """Revokes a specific device and immediately kicks its active sessions."""
    device = revoke_device(req.device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )

    kick_device_sockets(req.device_id)
    hub.notify_event(f"Device access revoked: {device['name']}")
    return {"status": "revoked", "device": device}


class RenameDeviceRequest(BaseModel):
    device_id: str
    name: str


@app.post("/api/devices/rename")
async def rename_device_endpoint(req: RenameDeviceRequest, _: str = Depends(verify_token)):
    """Renames a registered device."""
    device = rename_device(req.device_id, req.name)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )
    hub.notify_event(f"Device renamed: {device['name']}")
    return {"status": "renamed", "device": device}


class DeleteDeviceRequest(BaseModel):
    device_id: str


@app.post("/api/devices/delete")
async def delete_device_endpoint(req: DeleteDeviceRequest, _: str = Depends(verify_token)):
    """Deletes a device from the paired devices registry."""
    kick_device_sockets(req.device_id)
    success = delete_device(req.device_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )
    hub.notify_event(f"Device deleted: {req.device_id[:8]}")
    return {"status": "deleted", "device_id": req.device_id}


class SessionStartRequest(BaseModel):
    cwd: Optional[str] = None
    command: Optional[str] = None


@app.get("/api/health")
async def health(_: str = Depends(verify_token)):
    """Returns laptop telemetry, network state, session status, Antigravity status, and tool availability."""
    vitals = get_system_vitals()
    session_info = hub.to_dict()
    agy_status = agy_monitor.get_status()
    ffmpeg_bin = get_ffmpeg_bin()

    return {
        "status": "online",
        "tailscale_ip": server_ip,
        "active_session": session_info,
        "antigravity": agy_status,
        "ffmpeg_available": bool(ffmpeg_bin),
        **vitals,
    }


@app.post("/api/antigravity/refresh")
async def refresh_antigravity_usage_endpoint(_: str = Depends(verify_token)):
    """Triggers an async refresh of AGY /usage and returns current status."""
    agy_monitor.trigger_refresh_async()
    return agy_monitor.get_status()


@app.get("/api/workspaces")
async def get_workspaces(path: Optional[str] = Query(None), _: str = Depends(verify_token)):
    """Lists laptop directories, drives, and breadcrumbs with boundary checks."""
    return list_directory(path)

@app.post("/api/workspaces/select")
async def select_workspace(path: str = Query(...), _: str = Depends(verify_token)):
    """Switches active workspace directory and launches prompt."""
    if not os.path.isdir(path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Directory does not exist")
    hub.change_directory(path)
    return {"status": "changed", "cwd": hub.current_cwd}


@app.get("/api/conversations")
async def get_conversations(_: str = Depends(verify_token)):
    """Returns list of past agy conversations for resumption matching desktop agy /resume."""
    convs = list_conversations(current_cwd=hub.current_cwd)
    return {
        "active_id": hub.active_conversation_id,
        "current_cwd": hub.current_cwd,
        "current_repo": os.path.basename(hub.current_cwd.rstrip("\\/")) if hub.current_cwd else "",
        "conversations": convs,
    }


@app.post("/api/conversations/select")
async def select_conversation(
    id: str = Query(...),
    title: Optional[str] = Query(None),
    workspace_path: Optional[str] = Query(None),
    _: str = Depends(verify_token),
):
    """Switches active conversation session (resume chat) and optionally switches workspace folder."""
    if workspace_path and os.path.isdir(workspace_path) and id != "new":
        if os.path.realpath(workspace_path).lower() != os.path.realpath(hub.current_cwd).lower():
            hub.change_directory(workspace_path)

    hub.resume_conversation(id, title or "")
    return {
        "status": "resumed",
        "active_id": hub.active_conversation_id,
        "cwd": hub.current_cwd,
    }


@app.post("/api/session/start")
async def start_session(req: SessionStartRequest, _: str = Depends(verify_token)):
    """Spawns an interactive CLI session inside Windows PTY."""
    target_cwd = req.cwd or hub.current_cwd or os.environ.get("DEFAULT_WORKSPACE", str(Path.home()))
    try:
        session = hub.start_session(cwd=target_cwd, command=req.command)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))

    return {
        "status": "started",
        **session.to_dict(),
    }


@app.post("/api/session/stop")
async def stop_session(_: str = Depends(verify_token)):
    """Stops the running terminal session."""
    if hub.active_session and hub.active_session.is_alive:
        hub.stop_session()
        return {"status": "stopped"}
    return {"status": "no_active_session"}


def get_ffmpeg_bin() -> Optional[str]:
    """Resolves the ffmpeg executable location on the host system, or None if unavailable."""
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path
    winget_guess = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    if winget_guess.exists():
        matches = list(winget_guess.glob("**/bin/ffmpeg.exe"))
        if matches:
            return str(matches[0])
    return None


@app.post("/api/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    lang: str = Query("id-ID"),
    _: str = Depends(verify_token),
):
    """
    Transcribes audio uploaded from mobile client (e.g. m4a/aac/wav) using ffmpeg and Google Speech Recognition.
    """
    ffmpeg_bin = get_ffmpeg_bin()
    if not ffmpeg_bin:
        return {
            "status": "error",
            "error_code": "FFMPEG_MISSING",
            "message": "FFmpeg is not installed on the host workstation. Voice transcription requires FFmpeg to convert audio. Please install FFmpeg on the host PC (e.g. 'winget install Gyan.FFmpeg' or add it to PATH) to enable voice dictation.",
            "transcript": "",
        }

    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) < 100:
        return {"status": "ok", "transcript": ""}

    with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path + ".wav"
    create_no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        proc = subprocess.run(
            [ffmpeg_bin, "-y", "-i", tmp_in_path, "-ac", "1", "-ar", "16000", "-f", "wav", tmp_out_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
            creationflags=create_no_window,
        )
        if proc.returncode != 0 or not os.path.exists(tmp_out_path):
            return {
                "status": "error",
                "error_code": "CONVERSION_FAILED",
                "message": "Audio conversion failed during FFmpeg processing.",
                "transcript": "",
            }

        recognizer = sr.Recognizer()
        with sr.AudioFile(tmp_out_path) as source:
            audio_data = recognizer.record(source)

        text = ""
        try:
            text = recognizer.recognize_google(audio_data, language=lang)
        except sr.UnknownValueError:
            alt_lang = "en-US" if lang.startswith("id") else "id-ID"
            try:
                text = recognizer.recognize_google(audio_data, language=alt_lang)
            except sr.UnknownValueError:
                text = ""

        return {"status": "ok", "transcript": text.strip()}
    except FileNotFoundError:
        return {
            "status": "error",
            "error_code": "FFMPEG_MISSING",
            "message": "FFmpeg executable not found on the host system. Please install FFmpeg to enable voice dictation.",
            "transcript": "",
        }
    except sr.RequestError as req_err:
        return {"status": "error", "message": f"Speech service unavailable: {req_err}", "transcript": ""}
    except Exception as e:
        return {"status": "error", "message": str(e), "transcript": ""}
    finally:
        try:
            if os.path.exists(tmp_in_path):
                os.remove(tmp_in_path)
            if os.path.exists(tmp_out_path):
                os.remove(tmp_out_path)
        except Exception:
            pass



@app.websocket("/ws/terminal")
async def terminal_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
):
    """Bidirectional streaming terminal WebSocket with reconnect catch-up."""
    has_valid_master = bool(token and secrets.compare_digest(token, server_token))

    authorized = False
    if device_id:
        if is_device_revoked(device_id):
            await websocket.close(code=4001, reason="Device Revoked")
            return
        if is_device_authorized(device_id):
            authorized = True
        elif has_valid_master:
            pair_device(device_id, "Android Device", "android", "remote")
            authorized = True
        else:
            await websocket.close(code=4001, reason="Device Revoked")
            return
    elif has_valid_master:
        authorized = True

    if not authorized:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    client_queue: asyncio.Queue = asyncio.Queue()

    loop = asyncio.get_running_loop()
    if not hub.loop:
        hub.set_loop(loop)

    hub.add_listener(client_queue)
    client_host = websocket.client.host if websocket.client else "Client"
    hub.notify_event(f"Connected: {client_host}")

    if device_id:
        with sockets_lock:
            active_device_sockets[device_id].add(websocket)
        touch_device(device_id, client_host)
        notify_device_event("connected", {"id": device_id, "ip": client_host})

    # Initial status notification
    await websocket.send_json(
        {
            "type": "status",
            "state": "RUNNING" if (hub.active_session and hub.active_session.is_alive) else "STOPPED",
            "cwd": hub.current_cwd,
            "seq": hub.current_seq,
        }
    )

    async def sender():
        """Forwards output chunks from queue to WebSocket."""
        try:
            while True:
                payload = await client_queue.get()
                await websocket.send_json(payload)
        except Exception:
            pass

    sender_task = asyncio.create_task(sender())

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")

            if mtype == "subscribe":
                last_seq = msg.get("last_seq", 0)
                missed = hub.get_backlog_since(last_seq)
                for chunk in missed:
                    await websocket.send_json(chunk)

            elif mtype == "stdin":
                data = msg.get("data", "")
                hub.send_input(data)

            elif mtype == "signal":
                sig = msg.get("signal")
                if sig:
                    hub.send_signal(sig)

            elif mtype == "resize":
                cols = msg.get("cols", 100)
                rows = msg.get("rows", 30)
                if hub.active_session and hub.active_session.is_alive:
                    hub.active_session.resize(cols, rows)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
    finally:
        if device_id:
            with sockets_lock:
                if device_id in active_device_sockets:
                    active_device_sockets[device_id].discard(websocket)
                    if not active_device_sockets[device_id]:
                        del active_device_sockets[device_id]
            notify_device_event("disconnected", {"id": device_id})
        sender_task.cancel()
        hub.remove_listener(client_queue)
        hub.notify_event("Client disconnected")


@app.get("/")
async def root():
    """GravityDesk host daemon status endpoint."""
    return {
        "app": "GravityDesk Daemon",
        "status": "online",
        "mobile_companion": "GravityDesk Android App",
    }


def run_cli():
    """CLI runner supporting --show-qr and standard uvicorn execution."""
    parser = argparse.ArgumentParser(description="GravityDesk Remote agy Host Daemon")
    parser.add_argument("--show-qr", action="store_true", help="Display pairing QR code and exit")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind daemon (default: 8000)")
    args = parser.parse_args()

    token = get_or_create_token()
    ip = get_tailscale_or_lan_ip()

    if args.show_qr:
        display_startup_banner(ip, args.port, token)
        sys.exit(0)

    import uvicorn
    uvicorn.run("server.main:app", host="0.0.0.0", port=args.port, reload=False)


if __name__ == "__main__":
    run_cli()
