import io
import os
import secrets
import sys
from typing import List, Tuple
import psutil
import qrcode

# Ensure Windows stdout supports UTF-8 characters
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def get_tailscale_or_lan_ip() -> str:
    """
    Detects the best IP address for remote access in a single clean pass:
    Priority:
    1. Tailscale adapter or CGNAT 100.x.y.z IP
    2. Active Wi-Fi / Ethernet LAN IP
    3. Any valid non-loopback, non-APIPA IPv4
    4. 127.0.0.1 fallback
    """
    interfaces = psutil.net_if_addrs()

    # Collect all valid IPv4 candidates
    tailscale_candidates: List[str] = []
    lan_candidates: List[str] = []
    other_candidates: List[str] = []

    for iface_name, addresses in interfaces.items():
        lname = iface_name.lower()
        for addr in addresses:
            if addr.family.name != "AF_INET":
                continue
            ip = addr.address
            if ip.startswith("127.") or ip.startswith("169.254."):
                continue

            if "tailscale" in lname or ip.startswith("100."):
                tailscale_candidates.append(ip)
            elif any(net in lname for net in ("wi-fi", "ethernet", "wlan")):
                lan_candidates.append(ip)
            else:
                other_candidates.append(ip)

    if tailscale_candidates:
        return tailscale_candidates[0]
    if lan_candidates:
        return lan_candidates[0]
    if other_candidates:
        return other_candidates[0]

    return "127.0.0.1"


def get_or_create_token(env_path: str = ".env") -> str:
    """Reads or generates a true 256-bit pairing secret token in .env (32 bytes / 64 hex chars)."""
    token_key = "GRAVITYDESK_TOKEN"
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith(f"{token_key}="):
                    token = line.strip().split("=", 1)[1].strip()
                    if token and len(token) >= 32:
                        return token

    # Generate 256-bit cryptographic token (32 bytes = 64 hex characters)
    token = secrets.token_hex(32)
    with open(env_path, "a", encoding="utf-8") as f:
        f.write(f"\n{token_key}={token}\n")
    return token


def revoke_and_create_token(env_path: str = ".env") -> str:
    """Generates a new 256-bit token and overwrites GRAVITYDESK_TOKEN in .env."""
    token_key = "GRAVITYDESK_TOKEN"
    new_token = secrets.token_hex(32)
    lines = []
    found = False
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith(f"{token_key}="):
                    lines.append(f"{token_key}={new_token}\n")
                    found = True
                else:
                    lines.append(line)
    if not found:
        lines.append(f"{token_key}={new_token}\n")
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    return new_token


def print_ascii_qr(payload: str) -> None:
    """Prints a clear ASCII QR code directly into the terminal console."""
    qr = qrcode.QRCode(border=1)
    qr.add_data(payload)
    qr.make(fit=True)

    buffer = io.StringIO()
    qr.print_ascii(out=buffer, invert=True)
    buffer.seek(0)
    print(buffer.read())
