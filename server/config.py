"""
Centralized Configuration and Path Management for GravityDesk.
Ensures universal path resolution across Windows, macOS, and Linux,
storing persistent runtime state in ~/.gravitydesk/.
"""
import json
import os
import shutil
from pathlib import Path
from typing import Optional

CONFIG_DIR_ENV = "GRAVITYDESK_CONFIG_DIR"


def get_config_dir() -> Path:
    """
    Returns the centralized configuration directory:
    - Custom override via GRAVITYDESK_CONFIG_DIR environment variable if set.
    - Default: ~/.gravitydesk/ (cross-platform: Windows, macOS, Linux).
    Guarantees the directory exists.
    """
    custom_dir = os.environ.get(CONFIG_DIR_ENV)
    if custom_dir:
        config_path = Path(custom_dir).expanduser().resolve()
    else:
        config_path = (Path.home() / ".gravitydesk").resolve()

    config_path.mkdir(parents=True, exist_ok=True)
    return config_path


def get_env_path(override_path: Optional[str] = None) -> str:
    """
    Returns the path to the .env file.
    If override_path is provided, uses that.
    Otherwise defaults to ~/.gravitydesk/.env.
    If ~/.gravitydesk/.env does not exist yet but a local .env exists in cwd,
    seamlessly migrates the local .env to ~/.gravitydesk/.env.
    """
    if override_path:
        return override_path

    target_env = get_config_dir() / ".env"
    if not target_env.exists():
        # Check if legacy local .env exists in current working directory
        local_env = Path(".env").resolve()
        if local_env.exists() and local_env.is_file():
            try:
                shutil.copy2(local_env, target_env)
            except Exception:
                pass

    return str(target_env)


def get_devices_path(override_path: Optional[str] = None) -> str:
    """
    Returns the path to the devices.json file.
    If override_path is provided, uses that.
    Otherwise defaults to ~/.gravitydesk/devices.json.
    If ~/.gravitydesk/devices.json does not exist yet but a local devices.json exists in cwd,
    seamlessly migrates the local devices.json to ~/.gravitydesk/devices.json.
    """
    if override_path:
        return override_path

    target_devices = get_config_dir() / "devices.json"
    if not target_devices.exists():
        # Check if legacy local devices.json exists in current working directory
        local_devices = Path("devices.json").resolve()
        if local_devices.exists() and local_devices.is_file():
            try:
                shutil.copy2(local_devices, target_devices)
            except Exception:
                pass

    return str(target_devices)


def get_assets_dir() -> Path:
    """
    Locates the assets directory containing logo.ico and logo.png:
    1. Package-internal assets directory (server/assets/).
    2. Repository root assets directory (../assets/).
    3. User config assets directory (~/.gravitydesk/assets/).
    """
    pkg_assets = Path(__file__).resolve().parent / "assets"
    if pkg_assets.exists():
        return pkg_assets

    repo_assets = Path(__file__).resolve().parent.parent / "assets"
    if repo_assets.exists():
        return repo_assets

    user_assets = get_config_dir() / "assets"
    user_assets.mkdir(parents=True, exist_ok=True)
    return user_assets


def get_session_state_path(override_path: Optional[str] = None) -> str:
    """
    Returns the path to the session_state.json file.
    If override_path is provided, uses that.
    Otherwise defaults to ~/.gravitydesk/session_state.json.
    """
    if override_path:
        return override_path
    return str(get_config_dir() / "session_state.json")


def load_session_state() -> dict:
    """
    Loads saved session state (cwd, active_conversation_id, active_conversation_title).
    Returns an empty dict if not found or corrupted.
    """
    path = get_session_state_path()
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
    return {}


def save_session_state(
    cwd: str,
    active_conversation_id: Optional[str] = None,
    active_conversation_title: Optional[str] = None,
) -> None:
    """
    Atomically writes active session state to ~/.gravitydesk/session_state.json.
    """
    path = get_session_state_path()
    data = {
        "cwd": cwd,
        "active_conversation_id": active_conversation_id,
        "active_conversation_title": active_conversation_title,
    }
    try:
        temp_path = f"{path}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(temp_path, path)
    except Exception:
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

