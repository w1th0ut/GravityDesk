import os
import string
from pathlib import Path
from typing import List, Optional

# Restricted system directories to protect host OS stability
FORBIDDEN_NAMES = {
    "system volume information",
    "$recycle.bin",
    "recovery",
    "$windows.~bt",
    "$windows.~ws",
    "proc",
    "sys",
    "dev",
}


def get_available_drives() -> List[str]:
    """Returns accessible drive roots across operating systems (Windows drives, macOS/Linux roots & volumes)."""
    if os.name == "nt":
        drives = []
        for letter in string.ascii_uppercase:
            drive_path = f"{letter}:\\"
            if os.path.exists(drive_path):
                drives.append(drive_path)
        return drives

    # Unix (macOS / Linux)
    drives = ["/"]
    # Check macOS mounted volumes
    if os.path.exists("/Volumes"):
        try:
            for vol in os.listdir("/Volumes"):
                vol_path = os.path.join("/Volumes", vol)
                if os.path.isdir(vol_path) and not vol.startswith("."):
                    drives.append(vol_path)
        except Exception:
            pass

    # Check Linux /media or /mnt
    for media_root in ("/media", "/mnt"):
        if os.path.exists(media_root):
            try:
                for entry in os.listdir(media_root):
                    entry_path = os.path.join(media_root, entry)
                    if os.path.isdir(entry_path) and not entry.startswith("."):
                        drives.append(entry_path)
            except Exception:
                pass

    return drives


def get_breadcrumbs(folder_path: str) -> List[dict]:
    """Splits a sanitized absolute path into navigable breadcrumbs."""
    resolved_path = Path(os.path.realpath(folder_path))
    parts = []
    current = resolved_path
    while current != current.parent:
        parts.append({"name": current.name or str(current), "path": str(current)})
        current = current.parent
    parts.append({"name": str(current), "path": str(current)})
    parts.reverse()
    return parts


def list_directory(target_path: Optional[str] = None) -> dict:
    """
    Safely lists directories inside target_path with boundary checks
    and system folder isolation.
    """
    if not target_path or not os.path.exists(target_path):
        target_path = str(Path.home())

    canonical_path = os.path.realpath(target_path)
    entries = []

    try:
        with os.scandir(canonical_path) as dir_iterator:
            for entry in dir_iterator:
                # Filter hidden, system, and protected folders
                entry_name_lower = entry.name.lower()
                if entry.name.startswith((".", "$")) or entry_name_lower in FORBIDDEN_NAMES:
                    continue
                try:
                    if entry.is_dir(follow_symlinks=False):
                        entries.append(
                            {
                                "name": entry.name,
                                "path": os.path.realpath(entry.path),
                                "is_dir": True,
                            }
                        )
                except PermissionError:
                    continue
    except (PermissionError, OSError):
        return {
            "current_path": canonical_path,
            "error": "Permission Denied or Inaccessible Path",
            "entries": [],
            "breadcrumbs": get_breadcrumbs(canonical_path),
            "drives": get_available_drives(),
        }

    # Sort folders alphabetically
    entries.sort(key=lambda x: x["name"].lower())

    return {
        "current_path": canonical_path,
        "entries": entries,
        "breadcrumbs": get_breadcrumbs(canonical_path),
        "drives": get_available_drives(),
    }


