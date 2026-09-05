import asyncio
from contextlib import asynccontextmanager
import os
from typing import Optional
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server.network import get_or_create_token, get_tailscale_or_lan_ip, print_ascii_qr
from server.system import disable_sleep_inhibit, enable_sleep_inhibit, get_system_vitals
from server.terminal import TerminalSession
from server.workspaces import get_favorites, list_directory, toggle_favorite

# Global State
active_session: Optional[TerminalSession] = None
server_token: str = ""
server_ip: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global server_token, server_ip
    server_token = get_or_create_token()
    server_ip = get_tailscale_or_lan_ip()
    port = int(os.environ.get("PORT", 8000))

    # Inhibit Windows Sleep
    enable_sleep_inhibit()

    # Terminal Startup Banner & QR
    pair_url = f"http://{server_ip}:{port}/?token={server_token}"
    pair_qr_payload = f"gravitydesk://pair?host={server_ip}:{port}&token={server_token}"

    print("\n" + "=" * 60)
    print("[*] GRAVITYDESK SERVER READY")
    print("=" * 60)
    print(f"[*] Access URL:   {pair_url}")
    print(f"[*] Tailscale IP: {server_ip}")
    print(f"[*] Auth Token:   {server_token}")
    print("\nScan this QR Code from Android to pair:")
    try:
        print_ascii_qr(pair_qr_payload)
    except Exception as e:
        print(f"[Warning] Could not print ASCII QR: {e}")
    print("=" * 60 + "\n")

    yield

    # Teardown
    print("[Server] Shutting down GravityDesk...")
    disable_sleep_inhibit()
    if active_session:
        active_session.stop()


app = FastAPI(title="GravityDesk Daemon", lifespan=lifespan)

# Allow CORS for mobile web and Expo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_token(token: Optional[str] = Query(None)):
    """Validates authentication token from query string."""
    if not token or token != server_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing pairing token",
        )
    return token


class SessionStartRequest(BaseModel):
    cwd: Optional[str] = None
    command: Optional[str] = None


@app.get("/api/health")
async def health(token: str = Depends(verify_token)):
    """Returns laptop telemetry, network state, and session status."""
    vitals = get_system_vitals()
    session_info = None
    if active_session:
        session_info = {
            "is_alive": active_session.is_alive,
            "cwd": active_session.cwd,
            "command": active_session.command,
            "pid": active_session.pid,
            "current_seq": active_session.current_seq,
        }

    return {
        "status": "online",
        "tailscale_ip": server_ip,
        "active_session": session_info,
        **vitals,
    }


@app.get("/api/workspaces")
async def get_workspaces(path: Optional[str] = Query(None), token: str = Depends(verify_token)):
    """Lists laptop directories, drives, and breadcrumbs."""
    return list_directory(path)


@app.get("/api/favorites")
async def get_favs(token: str = Depends(verify_token)):
    """Returns pinned favorite folders."""
    return get_favorites()


@app.post("/api/favorites/toggle")
async def toggle_fav(path: str = Query(...), token: str = Depends(verify_token)):
    """Toggles folder pin in favorites."""
    return toggle_favorite(path)


@app.post("/api/session/start")
async def start_session(req: SessionStartRequest, token: str = Depends(verify_token)):
    """Spawns an interactive agy CLI session inside Windows PTY."""
    global active_session
    loop = asyncio.get_running_loop()

    if active_session and active_session.is_alive:
        active_session.stop()

    target_cwd = req.cwd or os.getcwd()
    active_session = TerminalSession(cwd=target_cwd, command=req.command)
    active_session.start(loop)

    return {
        "status": "started",
        "cwd": active_session.cwd,
        "command": active_session.command,
        "pid": active_session.pid,
    }


@app.post("/api/session/stop")
async def stop_session(token: str = Depends(verify_token)):
    """Stops the running terminal session."""
    global active_session
    if active_session:
        active_session.stop()
        return {"status": "stopped"}
    return {"status": "no_active_session"}


@app.websocket("/ws/terminal")
async def terminal_websocket(websocket: WebSocket, token: Optional[str] = Query(None)):
    """Bidirectional streaming terminal WebSocket with reconnect catch-up."""
    if not token or token != server_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    client_queue: asyncio.Queue = asyncio.Queue()

    # Ensure a session is active
    global active_session
    loop = asyncio.get_running_loop()
    if not active_session:
        active_session = TerminalSession(cwd=os.getcwd())
        active_session.start(loop)

    active_session.add_listener(client_queue)

    # Initial status notification
    await websocket.send_json(
        {
            "type": "status",
            "state": "RUNNING" if active_session.is_alive else "STOPPED",
            "cwd": active_session.cwd,
            "seq": active_session.current_seq,
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
                # Replay missed backlog chunks since last_seq
                last_seq = msg.get("last_seq", 0)
                backlog = active_session.get_backlog_since(last_seq)
                for chunk in backlog:
                    await websocket.send_json(chunk)

            elif mtype == "stdin":
                # Write user characters into terminal stdin
                data = msg.get("data", "")
                active_session.write(data)

            elif mtype == "signal":
                sig = msg.get("signal")
                if sig == "SIGINT":
                    active_session.send_ctrl_c()

            elif mtype == "resize":
                cols = msg.get("cols", 100)
                rows = msg.get("rows", 30)
                active_session.resize(cols, rows)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
    finally:
        sender_task.cancel()
        if active_session:
            active_session.remove_listener(client_queue)


# Mount static directory for mobile web view
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=False)
