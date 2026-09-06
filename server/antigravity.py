"""
GravityDesk - Google Antigravity (AGY) Telemetry & Usage Monitor
Provides active model detection and background-cached /usage limits.
"""
import os
import json
import shutil
import subprocess
import threading
import time
from typing import Optional, Dict, Any

DEFAULT_SETTINGS_PATH = os.path.expanduser("~/.gemini/antigravity-cli/settings.json")
DEFAULT_AGY_PATH = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local")),
    "agy",
    "bin",
    "agy.exe",
)


def get_active_model() -> str:
    """Reads current active model from ~/.gemini/antigravity-cli/settings.json."""
    settings_path = os.environ.get("AGY_SETTINGS_PATH", DEFAULT_SETTINGS_PATH)
    try:
        if os.path.exists(settings_path):
            with open(settings_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("model", "Gemini 3.8 Flash (High)")
    except Exception as e:
        print(f"[Antigravity] Warning reading settings.json: {e}")
    return "Gemini 3.8 Flash (High)"


def find_agy_binary() -> Optional[str]:
    """Resolves path to agy CLI executable."""
    candidate = os.environ.get("AGY_BIN_PATH")
    if candidate and os.path.exists(candidate):
        return candidate
    which_agy = shutil.which("agy") or shutil.which("agy.exe")
    if which_agy:
        return which_agy
    if os.path.exists(DEFAULT_AGY_PATH):
        return DEFAULT_AGY_PATH
    return None


def parse_usage_output(text: str) -> Dict[str, Any]:
    """Parses tab-separated /usage output from agy CLI."""
    data: Dict[str, Any] = {
        "gemini": {
            "hourly_percent": None,
            "hourly_reset": None,
            "weekly_percent": None,
            "weekly_reset": None,
        },
        "claude_gpt": {
            "hourly_percent": None,
            "hourly_reset": None,
            "weekly_percent": None,
            "weekly_reset": None,
        },
    }

    for line in text.strip().splitlines():
        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) >= 3:
            category = parts[0].lower()
            limit_type = parts[1].lower()
            pct_raw = parts[2].replace("%", "").strip()
            try:
                pct = int(pct_raw)
            except ValueError:
                pct = None
            reset_ts = parts[3] if len(parts) >= 4 else None

            target = (
                "gemini"
                if "gemini" in category
                else "claude_gpt"
                if ("claude" in category or "gpt" in category)
                else None
            )

            if target:
                if "hour" in limit_type or "session" in limit_type:
                    data[target]["hourly_percent"] = pct
                    data[target]["hourly_reset"] = reset_ts
                elif "week" in limit_type:
                    data[target]["weekly_percent"] = pct
                    data[target]["weekly_reset"] = reset_ts

    return data


class AntigravityMonitor:
    """Manages cached AGY model status and background rate limit refreshes."""

    def __init__(self, cache_ttl: int = 300):
        self.cache_ttl = cache_ttl
        self._lock = threading.Lock()
        self._is_refreshing = False
        self._last_updated: Optional[float] = None
        self._cached_usage: Dict[str, Any] = {
            "gemini": {
                "hourly_percent": None,
                "hourly_reset": None,
                "weekly_percent": None,
                "weekly_reset": None,
            },
            "claude_gpt": {
                "hourly_percent": None,
                "hourly_reset": None,
                "weekly_percent": None,
                "weekly_reset": None,
            },
        }

    @property
    def is_refreshing(self) -> bool:
        with self._lock:
            return self._is_refreshing

    def get_status(self) -> Dict[str, Any]:
        """Returns current model and cached usage information."""
        model = get_active_model()
        with self._lock:
            usage_copy = {
                "gemini": dict(self._cached_usage["gemini"]),
                "claude_gpt": dict(self._cached_usage["claude_gpt"]),
            }
            last_up = self._last_updated
            refreshing = self._is_refreshing

        return {
            "model": model,
            "usage": usage_copy,
            "last_updated": last_up,
            "is_refreshing": refreshing,
        }

    def trigger_refresh_async(self) -> bool:
        """Launches a background thread to update /usage if not already in flight."""
        with self._lock:
            if self._is_refreshing:
                return False
            self._is_refreshing = True

        thread = threading.Thread(target=self._refresh_worker, daemon=True, name="AGY-Usage-Worker")
        thread.start()
        return True

    def _refresh_worker(self) -> None:
        """Executes agy -p /usage in headless background subprocess."""
        agy_bin = find_agy_binary()
        parsed: Optional[Dict[str, Any]] = None

        if agy_bin:
            create_no_window = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            try:
                result = subprocess.run(
                    [agy_bin, "-p", "/usage"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=20,
                    creationflags=create_no_window,
                )
                if result.returncode == 0 and result.stdout:
                    parsed = parse_usage_output(result.stdout)
            except Exception as e:
                print(f"[Antigravity] Usage refresh failed: {e}")

        with self._lock:
            if parsed:
                self._cached_usage = parsed
                self._last_updated = time.time()
            self._is_refreshing = False


# Singleton monitor instance
agy_monitor = AntigravityMonitor(cache_ttl=300)
