import glob
import json
import os
import re
import time
from typing import Dict, List


def list_conversations(limit: int = 30) -> List[Dict]:
    base = os.path.expanduser('~/.gemini/antigravity-cli/brain')
    if not os.path.exists(base):
        return []

    pattern = os.path.join(base, '*', '.system_generated', 'logs', 'transcript.jsonl')
    transcripts = glob.glob(pattern)

    items = []
    for p in transcripts:
        try:
            parts = p.split(os.sep)
            cid = parts[-4]
            mtime = os.path.getmtime(p)
            title = f'Chat {cid[:8]}'

            with open(p, 'r', encoding='utf-8', errors='replace') as f:
                for _ in range(10):
                    line = f.readline()
                    if not line:
                        break
                    try:
                        d = json.loads(line)
                        if d.get('type') == 'USER_INPUT' and d.get('content'):
                            raw = str(d['content'])
                            cleaned = re.sub(
                                r'<ADDITIONAL_METADATA>.*?</ADDITIONAL_METADATA>',
                                '',
                                raw,
                                flags=re.DOTALL,
                            )
                            cleaned = re.sub(r'<[^>]+>', '', cleaned).strip()
                            first_line = cleaned.split('\n')[0].strip()
                            if first_line:
                                title = (
                                    (first_line[:55] + '...')
                                    if len(first_line) > 55
                                    else first_line
                                )
                                break
                    except Exception:
                        continue

            items.append(
                {
                    'id': cid,
                    'title': title,
                    'updated_at': mtime,
                    'time_str': time.strftime('%d %b %H:%M', time.localtime(mtime)),
                }
            )
        except Exception:
            continue

    items.sort(key=lambda x: x['updated_at'], reverse=True)
    return items[:limit]
