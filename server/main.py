import argparse
import asyncio
import collections
from contextlib import asynccontextmanager
import os
import secrets
import sys
import threading
from typing import Dict, List, Optional, Set
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server.conversations import list_conversations
from server.devices import (
    delete_device,
    get_devices,
    is_device_authorized,
    notify_device_event,
    pair_device,
    rename_device,
    revoke_device,
    touch_device,
)
from server.network import get_or_create_token, get_tailscale_or_lan_ip, print_ascii_qr, revoke_and_create_token
from server.system import disable_sleep_inhibit, enable_sleep_inhibit, get_system_vitals
from server.terminal import TerminalSession, hub
from server.workspaces import get_favorites, list_directory, toggle_favorite

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


async def _close_socket_async(ws: WebSocket) -> None:
    try:
        await ws.send_json({"type": "revoked", "message": "Akses perangkat telah dicabut dari host."})
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
    web_url = f"http://{ip}:{port}"

    print("\n" + "=" * 60)
    print("[*] GRAVITYDESK SERVER READY")
    print("=" * 60)
    print(f"[*] Web URL:      {web_url}")
    print(f"[*] Tailscale IP: {ip}")
    print(f"[*] Pairing:      Scan QR Code on screen with Android App / Web Browser")
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
    hub.current_cwd = os.getcwd()

    # Inhibit Windows Sleep while daemon is active
    enable_sleep_inhibit()

    # Terminal Startup Banner & QR
    display_startup_banner(server_ip, port, server_token)

    yield

    # Teardown
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
    2. Revoked devices: Blocked with 403 Forbidden.
    3. Admin/Initial pairing: Authenticated via Bearer token or query parameter.
    """
    active_id = x_device_id or device_id

    # If device ID is specified:
    if active_id:
        if not is_device_authorized(active_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses perangkat telah dicabut atau belum terdaftar",
            )
        touch_device(active_id)
        return "device-authorized"

    # Admin / Direct Master Token Authentication (when no device ID is provided)
    client_token = token
    if authorization and authorization.startswith("Bearer "):
        client_token = authorization.split("Bearer ", 1)[1].strip()

    if client_token and secrets.compare_digest(client_token, server_token):
        return client_token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Perangkat belum terdaftar atau token pairing tidak valid. Silakan scan QR Code di laptop.",
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
            detail="Token pairing tidak valid",
        )

    client_ip = request.client.host if request.client else "127.0.0.1"
    device = pair_device(
        device_id=req.device_id,
        name=req.device_name,
        platform=req.platform or "android",
        ip=client_ip,
    )
    hub.notify_event(f"Perangkat terhubung: {device['name']} ({device['platform']})")
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
            detail="Perangkat tidak ditemukan",
        )

    kick_device_sockets(req.device_id)
    hub.notify_event(f"Akses perangkat dicabut: {device['name']}")
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
            detail="Perangkat tidak ditemukan",
        )
    hub.notify_event(f"Nama perangkat diubah: {device['name']}")
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
            detail="Perangkat tidak ditemukan",
        )
    hub.notify_event(f"Perangkat dihapus: {req.device_id[:8]}")
    return {"status": "deleted", "device_id": req.device_id}


class SessionStartRequest(BaseModel):
    cwd: Optional[str] = None
    command: Optional[str] = None


@app.get("/api/health")
async def health(_: str = Depends(verify_token)):
    """Returns laptop telemetry, network state, and session status."""
    vitals = get_system_vitals()
    session_info = hub.to_dict()

    return {
        "status": "online",
        "tailscale_ip": server_ip,
        "active_session": session_info,
        **vitals,
    }


@app.get("/api/workspaces")
async def get_workspaces(path: Optional[str] = Query(None), _: str = Depends(verify_token)):
    """Lists laptop directories, drives, and breadcrumbs with boundary checks."""
    return list_directory(path)


@app.get("/api/favorites")
async def get_favs(_: str = Depends(verify_token)):
    """Returns pinned favorite folders."""
    return get_favorites()


@app.post("/api/favorites/toggle")
async def toggle_fav(path: str = Query(...), _: str = Depends(verify_token)):
    """Toggles folder pin in favorites."""
    return toggle_favorite(path)


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
    target_cwd = req.cwd or hub.current_cwd or os.getcwd()
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


@app.websocket("/ws/terminal")
async def terminal_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
):
    """Bidirectional streaming terminal WebSocket with reconnect catch-up."""
    if device_id and not is_device_authorized(device_id):
        await websocket.close(code=4001, reason="Device Revoked")
        return

    authorized = False
    if device_id and is_device_authorized(device_id):
        authorized = True
    elif token and secrets.compare_digest(token, server_token):
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


# Serve index.html with strict no-cache headers to prevent mobile PWA stale cache
static_dir = os.path.join(os.path.dirname(__file__), "static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            content = f.read()
        resp = HTMLResponse(content=content)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp
    raise HTTPException(status_code=404, detail="Index file not found")


if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


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
