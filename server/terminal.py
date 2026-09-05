import asyncio
import collections
import os
import shutil
import threading
import time
from typing import Callable, List, Optional, Tuple
import winpty

DEFAULT_AGY_PATH = r"C:\Users\bagas\AppData\Local\agy\bin\agy.exe"


class LogChunk:
    def __init__(self, seq: int, data: str, timestamp: float):
        self.seq = seq
        self.data = data
        self.timestamp = timestamp

    def to_dict(self) -> dict:
        return {
            "type": "output",
            "seq": self.seq,
            "data": self.data,
            "ts": self.timestamp,
        }


class TerminalSession:
    """
    Manages an interactive Windows PTY session with thread-safe asyncio integration.
    """

    def __init__(
        self,
        cwd: str,
        command: Optional[str] = None,
        cols: int = 100,
        rows: int = 30,
        buffer_capacity: int = 3000,
    ):
        self.cwd = os.path.abspath(cwd) if os.path.isdir(cwd) else os.getcwd()
        self.cols = cols
        self.rows = rows
        self.command = command or self._find_default_command()

        self.pty: Optional[winpty.PTY] = None
        self.is_alive = False
        self.pid: Optional[int] = None

        # Sequence-based Ring Buffer
        self.buffer_capacity = buffer_capacity
        self.ring_buffer = collections.deque(maxlen=buffer_capacity)
        self.current_seq = 0
        self.lock = threading.Lock()

        # Threading & Asyncio Queue
        self._reader_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listeners: List[asyncio.Queue] = []

    def _find_default_command(self) -> str:
        """Finds agy.exe or falls back to PowerShell/CMD."""
        if os.path.exists(DEFAULT_AGY_PATH):
            return DEFAULT_AGY_PATH

        which_agy = shutil.which("agy")
        if which_agy:
            return which_agy

        which_powershell = shutil.which("powershell.exe")
        if which_powershell:
            return which_powershell

        return r"C:\Windows\System32\cmd.exe"

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Spawns the PTY and starts the background reader thread."""
        if self.is_alive:
            return

        self._loop = loop

        # Spawn with WinPTY backend for maximum Windows 11 compatibility
        try:
            self.pty = winpty.PTY(self.cols, self.rows, backend=winpty.Backend.WinPTY)
            self.pty.spawn(self.command, cwd=self.cwd)
        except Exception as e:
            # Fallback to ConPTY backend if WinPTY fails
            print(f"[Terminal] WinPTY spawn fallback to ConPTY due to: {e}")
            self.pty = winpty.PTY(self.cols, self.rows, backend=winpty.Backend.ConPTY)
            self.pty.spawn(self.command, cwd=self.cwd)

        self.is_alive = True
        self.pid = getattr(self.pty, "pid", None)

        # Start dedicated background reader thread
        self._reader_thread = threading.Thread(
            target=self._reader_loop, daemon=True, name="ConPTY-Reader"
        )
        self._reader_thread.start()
        print(f"[Terminal] Session started for: {self.command} (CWD: {self.cwd})")

    def _reader_loop(self) -> None:
        """Continuously reads stdout from PTY and pushes into asyncio queues."""
        while self.is_alive and self.pty:
            try:
                chunk = self.pty.read(blocking=True)
                if not chunk:
                    time.sleep(0.01)
                    continue

                with self.lock:
                    self.current_seq += 1
                    log_item = LogChunk(self.current_seq, chunk, time.time())
                    self.ring_buffer.append(log_item)

                # Broadcast to connected WebSocket queues in asyncio loop
                if self._loop and not self._loop.is_closed():
                    payload = log_item.to_dict()
                    for q in list(self._listeners):
                        self._loop.call_soon_threadsafe(q.put_nowait, payload)

            except Exception as e:
                print(f"[Terminal] Reader thread ended: {e}")
                break

        self.is_alive = False
        # Broadcast termination status
        if self._loop and not self._loop.is_closed():
            exit_msg = {"type": "status", "state": "TERMINATED", "seq": self.current_seq}
            for q in list(self._listeners):
                self._loop.call_soon_threadsafe(q.put_nowait, exit_msg)

    def write(self, data: str) -> None:
        """Writes input characters / prompt into the terminal stdin."""
        if self.is_alive and self.pty:
            self.pty.write(data)

    def send_ctrl_c(self) -> None:
        """Sends SIGINT / Ctrl+C interrupt (ASCII 0x03) to child process."""
        self.write("\x03")

    def resize(self, cols: int, rows: int) -> None:
        """Updates PTY dimensions."""
        if self.is_alive and self.pty:
            self.cols = cols
            self.rows = rows
            try:
                self.pty.set_size(cols, rows)
            except Exception as e:
                print(f"[Terminal] Resize failed: {e}")

    def add_listener(self, queue: asyncio.Queue) -> None:
        """Registers an active WebSocket queue listener."""
        if queue not in self._listeners:
            self._listeners.append(queue)

    def remove_listener(self, queue: asyncio.Queue) -> None:
        """Unregisters a WebSocket queue listener."""
        if queue in self._listeners:
            self._listeners.remove(queue)

    def get_backlog_since(self, last_seq: int) -> List[dict]:
        """Returns missed log chunks since last_seq for seamless reconnect."""
        with self.lock:
            return [chunk.to_dict() for chunk in self.ring_buffer if chunk.seq > last_seq]

    def stop(self) -> None:
        """Gracefully interrupts and closes the PTY session."""
        self.is_alive = False
        if self.pty:
            try:
                self.send_ctrl_c()
                time.sleep(0.1)
                self.pty.write("exit\r\n")
            except Exception:
                pass
            self.pty = None
