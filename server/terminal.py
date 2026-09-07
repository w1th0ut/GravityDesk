import asyncio
import collections
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from typing import Dict, List, Optional, Set
import winpty

DEFAULT_AGY_PATH = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local")),
    "agy",
    "bin",
    "agy.exe",
)

# Whitelist of executables permitted to be spawned
PERMITTED_COMMANDS = {"agy", "powershell.exe", "cmd.exe"}

ANSI_CONTROL_RE = re.compile(r"\x1b\[[0-9;?]*[A-LN-Za-ln-z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)")
WINDOWS_BOILERPLATE_RE = re.compile(
    r"(Microsoft Windows \[Version[^\]]+\]|\(c\) Microsoft Corporation[^\r\n]*|All rights reserved[^\r\n]*)",
    re.IGNORECASE,
)
WINDOWS_PROMPT_RE = re.compile(r"^[A-Za-z]:\\[^>\r\n]*>", re.MULTILINE)


def clean_output_chunk(chunk: str) -> str:
    """Strips terminal control codes, [0K, and Windows cmd boot noise."""
    cleaned = ANSI_CONTROL_RE.sub("", chunk)
    cleaned = WINDOWS_BOILERPLATE_RE.sub("", cleaned)
    cleaned = WINDOWS_PROMPT_RE.sub("", cleaned)
    return cleaned


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
        elif shutil.which("agy"):
            agy_cmd = shutil.which("agy")
        elif shutil.which("agy.exe"):
            agy_cmd = shutil.which("agy.exe")
        elif os.path.exists(DEFAULT_AGY_PATH):
            agy_cmd = DEFAULT_AGY_PATH
        else:
            agy_cmd = r"C:\Windows\System32\cmd.exe"

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
        """Continuously reads stdout from PTY, cleans noise, and dispatches to Hub."""
        while self.is_alive and self.pty:
            try:
                chunk = self.pty.read(blocking=True)
                if not chunk:
                    time.sleep(0.01)
                    continue

                cleaned = clean_output_chunk(chunk)
                if cleaned and self.hub:
                    self.hub.broadcast_chunk(cleaned)

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
        self.current_cwd: str = os.environ.get("DEFAULT_WORKSPACE", str(Path.home()))
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.ring_buffer = collections.deque(maxlen=capacity)
        self.current_seq = 0
        self.lock = threading.Lock()
        self.running_subprocess: Optional[subprocess.Popen] = None
        self.active_conversation_id: Optional[str] = None
        self.event_callbacks: list = []
        self._seed_initial_banner()

    def add_event_callback(self, cb) -> None:
        """Registers a callback for desktop GUI activity logs."""
        self.event_callbacks.append(cb)

    def notify_event(self, text: str) -> None:
        """Dispatches an event description to registered GUI listeners."""
        for cb in self.event_callbacks:
            try:
                cb(text)
            except Exception:
                pass

    def _seed_initial_banner(self) -> None:
        banner = (
            "\x1b[36m  ____                 _ _         ____            _   \x1b[0m\r\n"
            "\x1b[36m / ___|_ __ __ ___   _(_) |_ _   _|  _ \\  ___  ___| | __\x1b[0m\r\n"
            "\x1b[36m| |  _| '__/ _` \\ \\ / / | __| | | | | | |/ _ \\/ __| |/ /\x1b[0m\r\n"
            "\x1b[36m| |_| | | | (_| |\\ V /| | |_| |_| | |_| |  __/\\__ \\   < \x1b[0m\r\n"
            "\x1b[36m \\____|_|  \\__,_| \\_/ |_|\\__|\\__, |____/ \\___||___/_|\\_\\\x1b[0m\r\n"
            "\x1b[36m                             |___/                      \x1b[0m\r\n"
            "\x1b[90m────────────────────────────────────────────────────────\x1b[0m\r\n"
            "\x1b[36mGravityDesk\x1b[0m \x1b[37m• Remote Control & Telemetry for Antigravity\x1b[0m\r\n"
            "\x1b[90mReady for prompts & commands.\x1b[0m\r\n\r\n"
            "\x1b[32mprompt>\x1b[0m "
        )
        self.current_seq += 1
        self.ring_buffer.append(
            {
                "type": "output",
                "seq": self.current_seq,
                "data": banner,
                "ts": time.time(),
            }
        )

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

        # Broadcast via loop to queue listeners
        if self.loop and self.loop.is_running():
            for listener in list(self.listeners):
                try:
                    self.loop.call_soon_threadsafe(listener.put_nowait, payload)
                except Exception:
                    pass

    def broadcast_status(self, state: str) -> None:
        """Sends session status changes (RUNNING, STOPPED) to listeners."""
        payload = {
            "type": "status",
            "state": state,
            "cwd": self.current_cwd,
            "seq": self.current_seq,
        }
        if self.loop and self.loop.is_running():
            for listener in list(self.listeners):
                try:
                    self.loop.call_soon_threadsafe(listener.put_nowait, payload)
                except Exception:
                    pass

    def get_backlog_since(self, last_seq: int) -> list:
        """Returns missed chunks since last received sequence ID for resync."""
        with self.lock:
            return [chunk for chunk in self.ring_buffer if chunk["seq"] > last_seq]

    def start_session(
        self, cwd: Optional[str] = None, command: Optional[str] = None
    ) -> TerminalSession:
        """Launches a new interactive session inside Windows PTY."""
        session_cwd = cwd or self.current_cwd
        self.current_cwd = session_cwd

        if self.active_session and self.active_session.is_alive:
            self.active_session.stop()

        self.active_session = TerminalSession(
            hub=self,
            cwd=session_cwd,
            command=command,
        )
        self.active_session.start()
        self.broadcast_status("RUNNING")
        return self.active_session

    def stop_session(self) -> None:
        """Terminates running PTY session."""
        if self.active_session and self.active_session.is_alive:
            self.active_session.stop()
            self.active_session = None
        self.broadcast_status("STOPPED")

    def change_directory(self, new_dir: str) -> None:
        """Updates active workspace directory without killing the connection."""
        clean_dir = os.path.realpath(new_dir)
        self.current_cwd = clean_dir

        if self.active_session and self.active_session.is_alive:
            self.active_session.stop()
            self.active_session = None

        self.broadcast_chunk(f"\r\x1b[36mAGY>\x1b[0m Workspace: {clean_dir}\r\n\x1b[32mprompt>\x1b[0m ")
        self.notify_event(f"Workspace set to: {os.path.basename(clean_dir)}")

    def resume_conversation(self, conv_id: str, title: str = "") -> None:
        """Switches active conversation target for subsequent prompts."""
        self.active_conversation_id = conv_id if conv_id != "new" else None
        label = title or (f"Chat {conv_id[:8]}" if conv_id != "new" else "New Chat")
        self.broadcast_chunk(f"\r\x1b[36mAGY>\x1b[0m Resumed chat: {label}\r\n\x1b[32mprompt>\x1b[0m ")
        self.notify_event(f"Resumed conversation: {label}")

    def send_input(self, data: str) -> None:
        """Processes user input, routing prompts to agy and shell commands to cmd."""
        clean_text = data.strip()
        if not clean_text:
            return

        preview = clean_text if len(clean_text) <= 45 else clean_text[:42] + "..."
        self.notify_event(f"User prompt: {preview}")

        # 1. Echo prompt to terminal stream with Thinking indicator (overwriting idle prompt>)
        self.broadcast_chunk(f"\r\x1b[32mprompt>\x1b[0m {clean_text}\r\n\x1b[36mAGY>\x1b[0m \x1b[33mThinking...\x1b[0m\r\n")

        # 2. If an interactive session is actively running (e.g. spawned via /api/session/start), forward stdin
        if self.active_session and self.active_session.is_alive:
            self.active_session.write(data)
            return

        # Prevent duplicate subprocesses from spamming when one is already actively executing
        if self.running_subprocess and self.running_subprocess.poll() is None:
            self.broadcast_chunk(
                "\r\x1b[33mAGY>\x1b[0m A command or prompt is already executing. "
                "Please wait or press Ctrl+C to cancel.\r\n\x1b[32mprompt>\x1b[0m "
            )
            return

        # 3. Built-in navigation / shell helpers
        SHELL_CMDS = ("dir", "cls", "mkdir ", "rmdir ", "del ", "git ", "npm ", "node ", "python ", "cat ", "type ", "curl ")
        cmd_lower = clean_text.lower()

        if cmd_lower.startswith("cd "):
            target_path = clean_text[3:].strip().strip('"').strip("'")
            new_path = os.path.abspath(os.path.join(self.current_cwd, target_path))
            if os.path.isdir(new_path):
                self.change_directory(new_path)
            else:
                self.broadcast_chunk(f"\r\x1b[36mAGY>\x1b[0m Directory not found: {new_path}\r\n\x1b[32mprompt>\x1b[0m ")
            return

        if cmd_lower == "cls" or cmd_lower == "clear":
            self.broadcast_chunk("\x1b[2J\x1b[H\x1b[32mprompt>\x1b[0m ")
            return

        if cmd_lower.startswith(SHELL_CMDS):
            threading.Thread(
                target=self._run_shell_cmd,
                args=(clean_text, self.current_cwd),
                daemon=True,
            ).start()
            return

        # 4. Prompt to AGY CLI with conversation continuity (-c or --conversation) and workspace binding
        agy_bin = os.environ.get("AGY_BIN_PATH")
        if not agy_bin or not os.path.exists(agy_bin):
            agy_bin = DEFAULT_AGY_PATH if os.path.exists(DEFAULT_AGY_PATH) else shutil.which("agy")

        if agy_bin and os.path.exists(agy_bin):
            threading.Thread(
                target=self._run_agy_prompt,
                args=(agy_bin, clean_text, self.current_cwd),
                daemon=True,
            ).start()
        else:
            # Fallback to shell if agy binary not found
            threading.Thread(
                target=self._run_shell_cmd,
                args=(clean_text, self.current_cwd),
                daemon=True,
            ).start()

    def _run_agy_prompt(self, agy_bin: str, prompt_text: str, cwd: str) -> None:
        """Executes prompt via agy CLI with workspace binding and streams stdout chunks."""
        cmd = [
            agy_bin,
            "--add-dir",
            cwd,
            "--dangerously-skip-permissions",
        ]
        if self.active_conversation_id:
            cmd.extend(["--conversation", self.active_conversation_id])
        else:
            cmd.append("-c")

        cmd.extend([
            "-p",
            prompt_text,
            "--output-format",
            "text",
        ])
        create_no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=create_no_window,
            )
            self.running_subprocess = proc
            for line in proc.stdout:
                self.broadcast_chunk(line)
            proc.wait()
        except Exception as e:
            self.broadcast_chunk(f"\r\n[Error running agy: {e}]\r\n")
        finally:
            self.running_subprocess = None
            self.broadcast_chunk("\r\n\x1b[32mprompt>\x1b[0m ")

    def _run_shell_cmd(self, cmd_text: str, cwd: str) -> None:
        """Executes standard shell command and streams stdout."""
        create_no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        try:
            proc = subprocess.Popen(
                f"cmd.exe /c {cmd_text}",
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=create_no_window,
            )
            self.running_subprocess = proc
            for line in proc.stdout:
                cleaned = clean_output_chunk(line)
                if cleaned:
                    self.broadcast_chunk(cleaned)
            proc.wait()
        except Exception as e:
            self.broadcast_chunk(f"\r\n[Error: {e}]\r\n")
        finally:
            self.running_subprocess = None
            self.broadcast_chunk("\r\n\x1b[32mprompt>\x1b[0m ")

    def send_signal(self, signal: str) -> None:
        if signal == "SIGINT":
            if self.running_subprocess and self.running_subprocess.poll() is None:
                try:
                    self.running_subprocess.terminate()
                except Exception:
                    pass
                self.broadcast_chunk("\r\n\x1b[31m[Interrupted]\x1b[0m\r\n\x1b[32mprompt>\x1b[0m ")
            elif self.active_session and self.active_session.is_alive:
                self.active_session.send_ctrl_c()

    def to_dict(self) -> Dict:
        is_sub_running = bool(self.running_subprocess and self.running_subprocess.poll() is None)
        is_session_running = bool(self.active_session and self.active_session.is_alive)
        return {
            "is_alive": is_sub_running or is_session_running,
            "cwd": self.current_cwd,
            "active_conversation_id": self.active_conversation_id,
            "command": self.active_session.command if self.active_session else DEFAULT_AGY_PATH,
            "pid": (self.running_subprocess.pid if is_sub_running else (self.active_session.pid if self.active_session else None)),
            "current_seq": self.current_seq,
        }


# Global Singleton Hub
hub = SessionHub()
