"""
GravityDesk Desktop GUI Application Launcher
Provides desktop GUI control center, pairing QR code, access revocation,
and live telemetry for the mobile companion.
"""
import os
import sys

# Signal daemon and terminal hub to suppress CLI console banners when running in GUI mode
os.environ["GRAVITYDESK_GUI"] = "1"

if __name__ == "__main__":
    try:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    except Exception:
        pass

    from server.gui import main

    main()
