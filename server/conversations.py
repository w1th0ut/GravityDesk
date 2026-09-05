import glob
import json
import os
import re
import sqlite3
import urllib.parse
from datetime import datetime
from typing import Dict, List, Optional


def _parse_workspace_uri(uris_json: Optional[str]) -> tuple[str, str]:
    """Parses workspace name and local absolute filesystem path from workspace_uris JSON string."""
    if not uris_json:
        return "", ""
    try:
        uris = json.loads(uris_json)
        if isinstance(uris, list) and uris:
            raw = uris[0]
            if raw.startswith("file:///"):
                clean = urllib.parse.unquote(raw[8:])
                clean = clean.replace("/", "\\")
                name = os.path.basename(clean.rstrip("\\"))
                return name, clean
            elif raw.startswith("file://"):
                clean = urllib.parse.unquote(raw[7:])
                clean = clean.replace("/", "\\")
                name = os.path.basename(clean.rstrip("\\"))
                return name, clean
    except Exception:
        pass
    return "", ""


def _format_time(iso_str: str) -> str:
    """Formats ISO datetime string into human readable 'DD Mon HH:MM' in local timezone."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        local_dt = dt.astimezone()
        return local_dt.strftime("%d %b %H:%M")
    except Exception:
        return iso_str[:16] if iso_str else ""


def list_conversations(current_cwd: Optional[str] = None, limit: int = 50) -> List[Dict]:
    """
    Returns the authoritative list of past conversations matching desktop agy /resume:
    1. Queries ~/.gemini/antigravity-cli/conversation_summaries.db (desktop agy database).
    2. Filters out subagents (nesting_depth > 0, parent_conversation_id != '').
    3. Filters out trivial empty/exit sessions.
    4. Extracts clean titles, step count, local modification time, and workspace association.
    5. Falls back to scanning brain/ if database is unavailable.
    """
    db_path = os.path.expanduser("~/.gemini/antigravity-cli/conversation_summaries.db")
    normalized_cwd = os.path.realpath(current_cwd).lower() if current_cwd else None

    if os.path.isfile(db_path):
        try:
            # Use read-only URI connection to prevent locking conflicts with running agy instances
            uri_path = f"file:{urllib.parse.quote(os.path.abspath(db_path))}?mode=ro"
            conn = sqlite3.connect(uri_path, uri=True, timeout=3.0)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            query = """
                SELECT 
                    conversation_id,
                    title,
                    preview,
                    step_count,
                    last_modified_time,
                    workspace_uris
                FROM conversation_summaries
                WHERE nesting_depth = 0
                  AND (parent_conversation_id IS NULL OR parent_conversation_id = '')
                  AND step_count > 0
                  AND NOT (title = '' AND preview IN ('exit', 'quit', ''))
                ORDER BY last_modified_time DESC
                LIMIT ?
            """
            rows = cursor.execute(query, (limit,)).fetchall()
            conn.close()

            items = []
            for r in rows:
                cid = r["conversation_id"]
                raw_title = (r["title"] or "").strip()
                preview = (r["preview"] or "").strip()

                if raw_title:
                    title = raw_title
                elif preview:
                    title = (preview[:60] + "...") if len(preview) > 60 else preview
                else:
                    title = f"Chat {cid[:8]}"

                ws_name, ws_path = _parse_workspace_uri(r["workspace_uris"])
                time_str = _format_time(r["last_modified_time"])

                is_current = False
                if normalized_cwd and ws_path:
                    try:
                        is_current = os.path.realpath(ws_path).lower() == normalized_cwd
                    except Exception:
                        pass

                items.append({
                    "id": cid,
                    "title": title,
                    "preview": preview,
                    "steps": r["step_count"],
                    "time_str": time_str,
                    "workspace_name": ws_name,
                    "workspace_path": ws_path,
                    "is_current": is_current,
                })

            if items:
                return items
        except Exception as e:
            print(f"[Conversations] SQLite query error: {e}, falling back to file scan.")

    # Fallback to brain/ directory scan if SQLite is unavailable
    base = os.path.expanduser("~/.gemini/antigravity-cli/brain")
    if not os.path.exists(base):
        return []

    pattern = os.path.join(base, "*", ".system_generated", "logs", "transcript.jsonl")
    transcripts = glob.glob(pattern)

    items = []
    for p in transcripts:
        try:
            parts = p.split(os.sep)
            cid = parts[-4]
            mtime = os.path.getmtime(p)
            title = f"Chat {cid[:8]}"
            preview = ""

            with open(p, "r", encoding="utf-8", errors="replace") as f:
                for _ in range(12):
                    line = f.readline()
                    if not line:
                        break
                    try:
                        d = json.loads(line)
                        if d.get("thinking") and "reviewer" in str(d.get("thinking")).lower():
                            break
                        if d.get("type") == "USER_INPUT" and d.get("content"):
                            raw = str(d["content"])
                            if "You are the " in raw and "Reviewer" in raw:
                                break
                            cleaned = re.sub(r"<ADDITIONAL_METADATA>.*?</ADDITIONAL_METADATA>", "", raw, flags=re.DOTALL)
                            cleaned = re.sub(r"<[^>]+>", "", cleaned).strip()
                            first_line = cleaned.split("\n")[0].strip()
                            if first_line and first_line.lower() not in ("exit", "quit"):
                                title = (first_line[:55] + "...") if len(first_line) > 55 else first_line
                                preview = first_line
                                break
                    except Exception:
                        continue

            if title.lower() in ("exit", "quit"):
                continue

            items.append({
                "id": cid,
                "title": title,
                "preview": preview,
                "steps": 1,
                "time_str": datetime.fromtimestamp(mtime).strftime("%d %b %H:%M"),
                "workspace_name": "",
                "workspace_path": "",
                "is_current": False,
                "updated_at": mtime,
            })
        except Exception:
            continue

    items.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return items[:limit]
