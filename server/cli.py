"""
GravityDesk Command-Line Entry Point
Launched via the `gravitydesk` global command or `python -m server.cli`.
Supports:
  gravitydesk            -> Launches Desktop GUI Control Center
  gravitydesk --headless -> Launches Headless Daemon CLI
  gravitydesk --version  -> Displays current version
  gravitydesk --help     -> Displays help instructions
"""
import os
import sys
from typing import List, Optional


def main(args: Optional[List[str]] = None) -> None:
    if args is None:
        args = sys.argv[1:]

    if "--version" in args or "-v" in args:
        from server import __version__
        print(f"GravityDesk v{__version__}")
        return

    if "--help" in args or "-h" in args:
        print("GravityDesk - Remote Control & Telemetry System for Google Antigravity (agy)")
        print("\nUsage: gravitydesk [OPTIONS]")
        print("\nOptions:")
        print("  --headless, --cli   Run as a headless background daemon (no GUI)")
        print("  --version, -v       Show GravityDesk version")
        print("  --help, -h          Show this help message")
        return

    if "--headless" in args or "--cli" in args:
        from server.main import run_cli
        run_cli()
    else:
        # Signal daemon and terminal hub to suppress CLI console banners when running in GUI mode
        os.environ["GRAVITYDESK_GUI"] = "1"

        if os.name == "nt":
            try:
                import ctypes
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("w1th0ut.gravitydesk.controlcenter.1.0")
            except Exception:
                pass

        try:
            sys.stdout = open(os.devnull, "w", encoding="utf-8")
        except Exception:
            pass

        from server.gui import main as gui_main
        gui_main()


if __name__ == "__main__":
    main()
