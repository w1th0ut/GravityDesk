import json
import os
import string
from pathlib import Path
from typing import List, Optional

FAVORITES_FILE = "favorites.json"


def get_available_drives() -> List[str]:
    """Returns available drive letters on Windows."""
    drives = []
    for letter in string.ascii_uppercase:
        drive_path = f"{letter}:\\"
        if os.path.exists(drive_path):
            drives.append(drive_path)
    return drives


def get_breadcrumbs(folder_path: str) -> List[dict]:
    """Splits an absolute path into breadcrumb items."""
    p = Path(os.path.abspath(folder_path))
    parts = []
    current = p
    while current != current.parent:
        parts.append({"name": current.name or str(current), "path": str(current)})
        current = current.parent
    parts.append({"name": str(current), "path": str(current)})
    parts.reverse()
    return parts


def list_directory(target_path: Optional[str] = None) -> dict:
    """Lists directories inside target_path with breadcrumbs and drive list."""
    if not target_path or not os.path.exists(target_path):
        target_path = str(Path.home())

    abs_path = os.path.abspath(target_path)
    entries = []

    try:
        with os.scandir(abs_path) as it:
            for entry in it:
                # Skip hidden/system directories
                if entry.name.startswith((".", "$")) or entry.name in {
                    "System Volume Information",
                    "$Recycle.Bin",
                    "Recovery",
                }:
                    continue
                try:
                    if entry.is_dir(follow_symlinks=False):
                        entries.append(
                            {
                                "name": entry.name,
                                "path": entry.path,
                                "is_dir": True,
                            }
                        )
                except PermissionError:
                    continue
    except PermissionError:
        return {
            "current_path": abs_path,
            "error": "Permission Denied",
            "entries": [],
            "breadcrumbs": get_breadcrumbs(abs_path),
            "drives": get_available_drives(),
        }

    # Sort folders alphabetically
    entries.sort(key=lambda x: x["name"].lower())

    return {
        "current_path": abs_path,
        "entries": entries,
        "breadcrumbs": get_breadcrumbs(abs_path),
        "drives": get_available_drives(),
    }


def get_favorites() -> List[dict]:
    """Retrieves pinned favorite folders."""
    default_favs = [
        {"name": "GravityDesk", "path": os.path.abspath(os.getcwd())},
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
    norm_path = os.path.abspath(folder_path)
    existing = next((f for f in favs if os.path.abspath(f["path"]) == norm_path), None)

    if existing:
        favs = [f for f in favs if os.path.abspath(f["path"]) != norm_path]
    else:
        name = os.path.basename(norm_path) or norm_path
        favs.append({"name": name, "path": norm_path})

    save_favorites(favs)
    return favs
