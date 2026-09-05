import json
import os
import threading
import time
from typing import Any, Callable, Dict, List, Optional

DEVICES_FILE = "devices.json"
_lock = threading.Lock()
_device_listeners: List[Callable[[str, Dict[str, Any]], None]] = []


def add_device_listener(callback: Callable[[str, Dict[str, Any]], None]) -> None:
    """Registers a listener for device lifecycle events (paired, revoked)."""
    with _lock:
        if callback not in _device_listeners:
            _device_listeners.append(callback)


def _notify_listeners(event: str, device: Dict[str, Any]) -> None:
    """Invokes all registered listeners without holding the lock."""
    listeners = list(_device_listeners)
    for cb in listeners:
        try:
            cb(event, device)
        except Exception:
            pass


def get_devices(filepath: str = DEVICES_FILE) -> List[Dict[str, Any]]:
    """Loads all recorded devices from disk in a thread-safe manner."""
    with _lock:
        if not os.path.exists(filepath):
            return []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                return []
        except Exception:
            return []


def _save_devices_locked(devices: List[Dict[str, Any]], filepath: str = DEVICES_FILE) -> None:
    """Internal helper to serialize device state to disk with atomic write."""
    tmp_path = f"{filepath}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(devices, f, indent=2)
        if os.path.exists(filepath):
            os.replace(tmp_path, filepath)
        else:
            os.rename(tmp_path, filepath)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def pair_device(
    device_id: str,
    name: str,
    platform: str,
    ip: str,
    filepath: str = DEVICES_FILE,
) -> Dict[str, Any]:
    """
    Pairs or re-authorizes a device with unique device_id and metadata.
    If previously revoked, pairing re-authorizes the device immediately.
    """
    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")
    clean_id = device_id.strip()
    clean_name = name.strip() or f"Perangkat ({clean_id[:6]})"
    clean_platform = platform.strip().lower() or "android"

    target_device: Optional[Dict[str, Any]] = None

    with _lock:
        devices = []
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    devices = json.load(f)
            except Exception:
                devices = []

        for d in devices:
            if d.get("id") == clean_id:
                d["name"] = clean_name
                d["platform"] = clean_platform
                d["ip"] = ip
                d["status"] = "active"
                d["last_seen"] = now_iso
                target_device = d
                break

        if not target_device:
            target_device = {
                "id": clean_id,
                "name": clean_name,
                "platform": clean_platform,
                "ip": ip,
                "status": "active",
                "paired_at": now_iso,
                "last_seen": now_iso,
            }
            devices.append(target_device)

        _save_devices_locked(devices, filepath)

    if target_device:
        _notify_listeners("paired", target_device)

    return target_device


def revoke_device(device_id: str, filepath: str = DEVICES_FILE) -> Optional[Dict[str, Any]]:
    """Revokes access for a specific device, changing its status to 'revoked'."""
    clean_id = device_id.strip()
    target_device: Optional[Dict[str, Any]] = None

    with _lock:
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                devices = json.load(f)
        except Exception:
            return None

        for d in devices:
            if d.get("id") == clean_id:
                d["status"] = "revoked"
                d["last_seen"] = time.strftime("%Y-%m-%d %H:%M:%S")
                target_device = d
                break

        if target_device:
            _save_devices_locked(devices, filepath)

    if target_device:
        _notify_listeners("revoked", target_device)

    return target_device


def is_device_authorized(device_id: Optional[str], filepath: str = DEVICES_FILE) -> bool:
    """
    Checks if device exists and has 'active' status.
    If device_id is None or empty, returns True for backward-compatibility.
    """
    if not device_id:
        return True

    clean_id = device_id.strip()
    with _lock:
        if not os.path.exists(filepath):
            return False
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                devices = json.load(f)
        except Exception:
            return False

        for d in devices:
            if d.get("id") == clean_id:
                return d.get("status") == "active"

    return False


def touch_device(device_id: Optional[str], ip: Optional[str] = None, filepath: str = DEVICES_FILE) -> None:
    """Updates device's last_seen timestamp and IP in background."""
    if not device_id:
        return
    clean_id = device_id.strip()
    now_iso = time.strftime("%Y-%m-%d %H:%M:%S")

    with _lock:
        if not os.path.exists(filepath):
            return
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                devices = json.load(f)
        except Exception:
            return

        updated = False
        for d in devices:
            if d.get("id") == clean_id:
                d["last_seen"] = now_iso
                if ip:
                    d["ip"] = ip
                updated = True
                break

        if updated:
            _save_devices_locked(devices, filepath)


def rename_device(
    device_id: str,
    new_name: str,
    filepath: str = DEVICES_FILE,
) -> Optional[Dict[str, Any]]:
    """Renames a registered device."""
    clean_id = device_id.strip()
    clean_name = new_name.strip()
    if not clean_name:
        return None

    target_device: Optional[Dict[str, Any]] = None

    with _lock:
        if not os.path.exists(filepath):
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                devices = json.load(f)
        except Exception:
            return None

        for d in devices:
            if d.get("id") == clean_id:
                d["name"] = clean_name
                target_device = d
                break

        if target_device:
            _save_devices_locked(devices, filepath)

    if target_device:
        _notify_listeners("renamed", target_device)

    return target_device


def delete_device(device_id: str, filepath: str = DEVICES_FILE) -> bool:
    """Permanently removes a device from the paired devices list."""
    clean_id = device_id.strip()
    removed = False

    with _lock:
        if not os.path.exists(filepath):
            return False
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                devices = json.load(f)
        except Exception:
            return False

        original_len = len(devices)
        devices = [d for d in devices if d.get("id") != clean_id]
        if len(devices) < original_len:
            removed = True
            _save_devices_locked(devices, filepath)

    if removed:
        _notify_listeners("deleted", {"id": clean_id})

    return removed
