import io
import os
import secrets
import sys
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
    Detects the best IP address for remote access:
    1. Tailscale adapter or CGNAT 100.x.y.z IP
    2. Active Wi-Fi / Ethernet LAN IP
    3. Loopback 127.0.0.1 fallback
    """
    addrs = psutil.net_if_addrs()

    # Pass 1: Look for interface named 'tailscale' with valid IPv4
    for iface_name, iface_addrs in addrs.items():
        if "tailscale" in iface_name.lower():
            for addr in iface_addrs:
                if addr.family.name == "AF_INET":
                    ip = addr.address
                    if ip.startswith("100."):
                        return ip

    # Pass 2: Look for any interface with 100.x.y.z IP (Tailscale CGNAT range)
    for iface_name, iface_addrs in addrs.items():
        for addr in iface_addrs:
            if addr.family.name == "AF_INET" and addr.address.startswith("100."):
                return addr.address

    # Pass 3: Look for Wi-Fi or Ethernet LAN IP (192.168.x.x or 10.x.x.x)
    for iface_name, iface_addrs in addrs.items():
        lname = iface_name.lower()
        if "wi-fi" in lname or "ethernet" in lname or "wlan" in lname:
            for addr in iface_addrs:
                if addr.family.name == "AF_INET" and not addr.address.startswith("169.254."):
                    return addr.address

    # Pass 4: Any non-loopback, non-APIPA IPv4
    for iface_name, iface_addrs in addrs.items():
        for addr in iface_addrs:
            if addr.family.name == "AF_INET" and not addr.address.startswith("127.") and not addr.address.startswith("169.254."):
                return addr.address

    return "127.0.0.1"


def get_or_create_token(env_path: str = ".env") -> str:
    """Reads or generates a 256-bit pairing secret token in .env."""
    token_key = "GRAVITYDESK_TOKEN"
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith(f"{token_key}="):
                    token = line.strip().split("=", 1)[1].strip()
                    if token:
                        return token

    # Generate new token
    token = secrets.token_hex(16)
    with open(env_path, "a", encoding="utf-8") as f:
        f.write(f"\n{token_key}={token}\n")
    return token


def print_ascii_qr(payload: str) -> None:
    """Prints a clear ASCII QR code directly into the terminal console."""
    qr = qrcode.QRCode(border=1)
    qr.add_data(payload)
    qr.make(fit=True)

    f = io.StringIO()
    qr.print_ascii(out=f, invert=True)
    f.seek(0)
    print(f.read())
