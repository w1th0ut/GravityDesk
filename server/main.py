import argparse
import asyncio
from contextlib import asynccontextmanager
import os
import secrets
import sys
from typing import Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server.conversations import list_conversations
from server.network import get_or_create_token, get_tailscale_or_lan_ip, print_ascii_qr
from server.system import disable_sleep_inhibit, enable_sleep_inhibit, get_system_vitals
from server.terminal import TerminalSession, hub
from server.workspaces import get_favorites, list_directory, toggle_favorite

# Global State
server_token: str = ""
server_ip: str = ""


def display_startup_banner(ip: str, port: int, token: str) -> None:
    """Prints the connection URLs and terminal ASCII QR code."""
    pair_url = f"http://{ip}:{port}/?token={token}"
    pair_qr_payload = f"gravitydesk://pair?host={ip}:{port}&token={token}"

    print("\n" + "=" * 60)
    print("[*] GRAVITYDESK SERVER READY")
    print("=" * 60)
    print(f"[*] Access URL:   {pair_url}")
    print(f"[*] Tailscale IP: {ip}")
    print(f"[*] Auth Token:   {token}")
    print("\nScan this QR Code from Android to pair:")
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
) -> str:
    """
    Timing-attack-safe authentication token validator.
    Supports either Bearer token in Authorization header or query parameter.
    """
    client_token = token
    if authorization and authorization.startswith("Bearer "):
        client_token = authorization.split("Bearer ", 1)[1].strip()

    if not client_token or not secrets.compare_digest(client_token, server_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing pairing token",
        )
    return client_token


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
async def terminal_websocket(websocket: WebSocket, token: Optional[str] = Query(None)):
    """Bidirectional streaming terminal WebSocket with reconnect catch-up."""
    if not token or not secrets.compare_digest(token, server_token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    client_queue: asyncio.Queue = asyncio.Queue()

    loop = asyncio.get_running_loop()
    if not hub.loop:
        hub.set_loop(loop)

    hub.add_listener(client_queue)

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
        sender_task.cancel()
        hub.remove_listener(client_queue)


# Mount static directory for mobile web view
static_dir = os.path.join(os.path.dirname(__file__), "static")
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
