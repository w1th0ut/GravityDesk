import json
import os
import string
from pathlib import Path
from typing import List, Optional

FAVORITES_FILE = "favorites.json"

# Restricted system directories to protect host OS stability
FORBIDDEN_NAMES = {
    "system volume information",
    "$recycle.bin",
    "recovery",
    "$windows.~bt",
    "$windows.~ws",
}


def get_available_drives() -> List[str]:
    """Returns accessible drive letters on Windows."""
    drives = []
    for letter in string.ascii_uppercase:
        drive_path = f"{letter}:\\"
        if os.path.exists(drive_path):
            drives.append(drive_path)
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


def get_favorites() -> List[dict]:
    """Retrieves pinned favorite folders."""
    default_favs = [
        {"name": "GravityDesk", "path": os.path.realpath(os.getcwd())},
        {"name": "User Home", "path": str(Path.home())},
    ]

    if not os.path.exists(FAVORITES_FILE):
        save_favorites(default_favs)
        return default_favs

    try:
        with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_favs


def save_favorites(favs: List[dict]) -> None:
    """Saves favorites to disk."""
    with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
        json.dump(favs, f, indent=2)


def toggle_favorite(folder_path: str) -> List[dict]:
    """Adds or removes a directory from favorites."""
    favs = get_favorites()
    norm_path = os.path.realpath(folder_path)
    existing = next((f for f in favs if os.path.realpath(f["path"]) == norm_path), None)

    if existing:
        favs = [f for f in favs if os.path.realpath(f["path"]) != norm_path]
    else:
        name = os.path.basename(norm_path) or norm_path
        favs.append({"name": name, "path": norm_path})

    save_favorites(favs)
    return favs
