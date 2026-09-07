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
from pathlib import Path
import shutil
import subprocess
import sys
from typing import List, Optional

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def run_update() -> None:
    """
    Updates GravityDesk to the latest version from GitHub.
    - If running inside a git clone, executes `git pull` and `pip install -e .`.
    - Otherwise, executes `pip install --upgrade --no-cache-dir git+https://github.com/w1th0ut/GravityDesk.git`.
    """
    print("=" * 60, flush=True)
    print("[*] GravityDesk Self-Updater", flush=True)
    print("=" * 60, flush=True)

    # 1. Check if running inside a local git clone
    repo_root = Path(__file__).resolve().parent.parent
    git_dir = repo_root / ".git"

    if git_dir.exists() and shutil.which("git"):
        try:
            check_git = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            if check_git.returncode == 0 and "true" in check_git.stdout.lower():
                print(f"[*] Detected local git repository at: {repo_root}", flush=True)
                print("[*] Pulling latest updates from GitHub...", flush=True)
                pull_res = subprocess.run(["git", "pull"], cwd=repo_root)
                if pull_res.returncode == 0:
                    print("[*] Updating package dependencies in editable mode...", flush=True)
                    pip_res = subprocess.run(
                        [sys.executable, "-m", "pip", "install", "-e", "."],
                        cwd=repo_root,
                    )
                    if pip_res.returncode == 0:
                        from server import __version__
                        print(f"\n[OK] Successfully updated GravityDesk to latest version (v{__version__})!", flush=True)
                        return
                    else:
                        print("\n[!] 'pip install -e .' returned an error. Please check your Python environment.", flush=True)
                        return
                else:
                    print("[!] 'git pull' failed. Falling back to global pip upgrade...", flush=True)
        except Exception as e:
            print(f"[!] Git check failed: {e}. Falling back to pip upgrade...", flush=True)

    # 2. Pip upgrade fallback for global / pip-installed environments
    repo_url = "git+https://github.com/w1th0ut/GravityDesk.git"
    print(f"[*] Upgrading GravityDesk via pip ({repo_url})...", flush=True)
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--no-cache-dir",
        repo_url,
    ]
    try:
        pip_res = subprocess.run(cmd)
        if pip_res.returncode == 0:
            print("\n[OK] Successfully updated GravityDesk to latest version!", flush=True)
        else:
            print("\n[ERROR] Automated update failed. Please run manually:", flush=True)
            print(f"        pip install --upgrade {repo_url}", flush=True)
    except Exception as e:
        print(f"\n[ERROR] Error during update: {e}", flush=True)
        print(f"        Please run manually: pip install --upgrade {repo_url}", flush=True)


def main(args: Optional[List[str]] = None) -> None:
    if args is None:
        args = sys.argv[1:]

    if "--version" in args or "-v" in args:
        from server import __version__
        print(f"GravityDesk v{__version__}")
        return

    if "--help" in args or "-h" in args:
        print("GravityDesk - Remote Control & Telemetry System for Google Antigravity (agy)")
        print("\nUsage: gravitydesk [OPTIONS] [COMMAND]")
        print("\nCommands:")
        print("  update              Update GravityDesk to the latest version from GitHub")
        print("\nOptions:")
        print("  --headless, --cli   Run as a headless background daemon (no GUI)")
        print("  --version, -v       Show GravityDesk version")
        print("  --help, -h          Show this help message")
        return

    if "update" in args or "--update" in args:
        run_update()
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
