"""
GravityDesk Application Launcher
Provides desktop GUI Control Center by default, with an optional --headless flag
for headless CLI servers (e.g. Linux VPS / homelab).
"""
import sys
from server.cli import main

if __name__ == "__main__":
    main()

