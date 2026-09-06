"""
GravityDesk Application Launcher
Provides desktop GUI Control Center by default, with an optional --headless flag
for headless CLI servers (e.g. Linux VPS / homelab).
"""
import os
import sys

if __name__ == "__main__":
    if "--headless" in sys.argv or "--cli" in sys.argv:
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

        from server.gui import main
        main()
