import asyncio
import collections
import os
import shutil
import threading
import time
from typing import Dict, List, Optional, Set
import winpty

DEFAULT_AGY_PATH = r"C:\Users\bagas\AppData\Local\agy\bin\agy.exe"

# Whitelist of executables permitted to be spawned
PERMITTED_COMMANDS = {"agy", "powershell.exe", "cmd.exe"}


class TerminalSession:
    """
    Manages an interactive Windows PTY process, routing output to SessionHub.
    """

    def __init__(
        self,
        cwd: str,
        command: Optional[str] = None,
        cols: int = 100,
        rows: int = 30,
        hub: Optional["SessionHub"] = None,
    ):
        self.cwd = os.path.abspath(cwd) if os.path.isdir(cwd) else os.getcwd()
        self.cols = cols
        self.rows = rows
        self.command = self._resolve_and_validate_command(command)
        self.hub = hub

        self.pty: Optional[winpty.PTY] = None
        self.is_alive = False
        self.pid: Optional[int] = None
        self._reader_thread: Optional[threading.Thread] = None

    def _resolve_and_validate_command(self, requested_command: Optional[str]) -> str:
        """Resolves binary path with AGY_BIN_PATH support and allowlist check."""
        env_agy_path = os.environ.get("AGY_BIN_PATH")
        if env_agy_path and os.path.exists(env_agy_path):
            agy_cmd = env_agy_path
        elif os.path.exists(DEFAULT_AGY_PATH):
            agy_cmd = DEFAULT_AGY_PATH
        else:
            agy_cmd = shutil.which("agy") or r"C:\Windows\System32\cmd.exe"

        default_shell = r"C:\Windows\System32\cmd.exe"
        if not os.path.exists(default_shell):
            default_shell = shutil.which("cmd.exe") or shutil.which("powershell.exe") or "cmd.exe"

        if not requested_command:
            return default_shell

        if requested_command == "agy":
            return agy_cmd

        cmd_base = os.path.basename(requested_command).lower()
        if cmd_base not in PERMITTED_COMMANDS and requested_command not in (agy_cmd, default_shell):
            raise ValueError(f"Command execution of '{requested_command}' is not permitted.")

        return requested_command

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Spawns the PTY and starts the background reader loop."""
        if loop and self.hub and not self.hub.loop:
            self.hub.set_loop(loop)

        if self.is_alive:
            return

        # Spawn with WinPTY backend for maximum Windows 11 compatibility
        try:
            self.pty = winpty.PTY(self.cols, self.rows, backend=winpty.Backend.WinPTY)
            self.pty.spawn(self.command, cwd=self.cwd)
        except Exception as e:
            print(f"[Terminal] WinPTY fallback to ConPTY due to: {e}")
            self.pty = winpty.PTY(self.cols, self.rows, backend=winpty.Backend.ConPTY)
            self.pty.spawn(self.command, cwd=self.cwd)

        self.is_alive = True
        self.pid = getattr(self.pty, "pid", None)

        self._reader_thread = threading.Thread(
            target=self._reader_loop, daemon=True, name="ConPTY-Reader"
        )
        self._reader_thread.start()
        print(f"[Terminal] Started {self.command} (PID: {self.pid}) in {self.cwd}")

    def _reader_loop(self) -> None:
        """Continuously reads stdout from PTY and dispatches to Hub."""
        while self.is_alive and self.pty:
            try:
                chunk = self.pty.read(blocking=True)
                if not chunk:
                    time.sleep(0.01)
                    continue

                if self.hub:
                    self.hub.broadcast_chunk(chunk)

            except Exception as e:
                print(f"[Terminal] Process output stream ended: {e}")
                break

        self.is_alive = False
        if self.hub:
            self.hub.broadcast_status("STOPPED")

    def write(self, data: str) -> None:
        """Writes input to terminal stdin."""
        if self.is_alive and self.pty:
            self.pty.write(data)

    def send_ctrl_c(self) -> None:
        """Sends SIGINT (ASCII 0x03) to process."""
        self.write("\x03")

    def resize(self, cols: int, rows: int) -> None:
        if self.is_alive and self.pty:
            self.cols = cols
            self.rows = rows
            try:
                self.pty.set_size(cols, rows)
            except Exception:
                pass

    def stop(self) -> None:
        """Gracefully closes PTY."""
        self.is_alive = False
        if self.pty:
            try:
                self.send_ctrl_c()
                time.sleep(0.05)
                self.pty.write("exit\r\n")
            except Exception:
                pass
            self.pty = None

    def to_dict(self) -> Dict:
        return {
            "is_alive": self.is_alive,
            "cwd": self.cwd,
            "command": self.command,
            "pid": self.pid,
        }


class SessionHub:
    """
    Central Pub/Sub Hub managing active terminal session and WebSocket subscribers.
    Decouples WebSocket lifecycle from child process lifecycle so switching folders
    never disconnects listeners or blanks the screen.
    """

    def __init__(self, capacity: int = 3000):
        self.active_session: Optional[TerminalSession] = None
        self.listeners: Set[asyncio.Queue] = set()
        self.current_cwd: str = os.getcwd()
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.ring_buffer = collections.deque(maxlen=capacity)
        self.current_seq = 0
        self.lock = threading.Lock()

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def add_listener(self, queue: asyncio.Queue) -> None:
        self.listeners.add(queue)

    def remove_listener(self, queue: asyncio.Queue) -> None:
        self.listeners.discard(queue)

    def broadcast_chunk(self, chunk_data: str) -> None:
        """Buffers chunk and broadcasts to all connected WebSocket clients."""
        with self.lock:
            self.current_seq += 1
            payload = {
                "type": "output",
                "seq": self.current_seq,
                "data": chunk_data,
                "ts": time.time(),
            }
            self.ring_buffer.append(payload)

        if self.loop and not self.loop.is_closed():
            for listener_queue in list(self.listeners):
                self.loop.call_soon_threadsafe(listener_queue.put_nowait, payload)

    def broadcast_status(self, state: str) -> None:
        """Broadcasts process state change."""
        payload = {
            "type": "status",
            "state": state,
            "cwd": self.current_cwd,
            "seq": self.current_seq,
        }
        if self.loop and not self.loop.is_closed():
            for listener_queue in list(self.listeners):
                self.loop.call_soon_threadsafe(listener_queue.put_nowait, payload)

    def get_backlog_since(self, last_seq: int) -> List[dict]:
        with self.lock:
            return [chunk for chunk in self.ring_buffer if chunk["seq"] > last_seq]

    def start_session(
        self, cwd: Optional[str] = None, command: Optional[str] = None
    ) -> TerminalSession:
        """Starts a session in the specified workspace."""
        if self.active_session and self.active_session.is_alive:
            self.active_session.stop()

        target_cwd = cwd or self.current_cwd
        self.current_cwd = target_cwd
        self.active_session = TerminalSession(
            cwd=target_cwd, command=command, hub=self
        )
        self.active_session.start()
        self.broadcast_status("RUNNING")
        return self.active_session

    def stop_session(self) -> None:
        """Stops active session without clearing WebSocket listeners."""
        if self.active_session:
            self.active_session.stop()
            self.active_session = None
        self.broadcast_status("STOPPED")

    def change_directory(self, new_dir: str) -> None:
        """Updates active workspace directory without killing the connection."""
        clean_dir = os.path.realpath(new_dir)
        self.current_cwd = clean_dir

        # Print clean notification into terminal feed
        self.broadcast_chunk(f"\r\n\x1b[36m[*] Workspace switched to: {clean_dir}\x1b[0m\r\n")

        # Start shell session in the new workspace directory
        self.start_session(cwd=clean_dir)

    def send_input(self, data: str) -> None:
        """Sends input, auto-starting session if idle."""
        if not self.active_session or not self.active_session.is_alive:
            self.start_session(cwd=self.current_cwd)
            time.sleep(0.1)
        self.active_session.write(data)

    def send_signal(self, signal: str) -> None:
        if self.active_session and self.active_session.is_alive:
            if signal == "SIGINT":
                self.active_session.send_ctrl_c()

    def to_dict(self) -> Dict:
        return {
            "is_alive": bool(self.active_session and self.active_session.is_alive),
            "cwd": self.current_cwd,
            "command": self.active_session.command if self.active_session else None,
            "pid": self.active_session.pid if self.active_session else None,
            "current_seq": self.current_seq,
        }


# Global Singleton Hub
hub = SessionHub()
