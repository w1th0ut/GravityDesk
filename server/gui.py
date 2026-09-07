import asyncio
import os
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Optional

from PIL import Image, ImageTk
import psutil
import qrcode
import uvicorn

from server.devices import (
    add_device_listener,
    delete_device,
    get_devices,
    revoke_all_devices,
    revoke_device,
)
from server.main import (
    app,
    get_online_device_ids,
    kick_all_device_sockets,
    kick_device_sockets,
    update_server_token,
)
from server.config import get_assets_dir
from server.network import get_or_create_token, get_tailscale_or_lan_ip, revoke_and_create_token
from server.system import disable_sleep_inhibit, enable_sleep_inhibit, get_system_vitals
from server.terminal import hub


# Theme Palette
C_BG = "#0d1117"
C_CARD = "#161b22"
C_BORDER = "#30363d"
C_TEXT = "#f0f6fc"
C_MUTED = "#8b949e"
C_ACCENT = "#58a6ff"
C_SUCCESS = "#3fb950"
C_DANGER = "#f85149"
C_WARNING = "#d29922"
C_INPUT_BG = "#040d21"


def ensure_app_icon() -> tuple[Optional[str], Optional[str]]:
    """Ensures logo.ico and logo.png paths exist for window & taskbar icon setup."""
    assets_dir = str(get_assets_dir())
    ico_path = os.path.join(assets_dir, "logo.ico")
    png_path = os.path.join(assets_dir, "logo.png")

    if not os.path.exists(ico_path) and os.path.exists(png_path):
        try:
            img = Image.open(png_path)
            icon_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
            img.save(ico_path, format="ICO", sizes=icon_sizes)
        except Exception:
            pass

    return (ico_path if os.path.exists(ico_path) else None,
            png_path if os.path.exists(png_path) else None)


class GravityDeskGUI:
    def __init__(self, root: tk.Tk):
        # Set Windows AppUserModelID so Windows taskbar treats this as a distinct app
        # and displays our custom icon instead of the default Python / cmd icon
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("w1th0ut.gravitydesk.controlcenter.1.0")
        except Exception:
            pass

        self.root = root
        self.root.title("GravityDesk — Server & Pairing Control")
        self.root.geometry("960x760")
        self.root.minsize(900, 700)
        self.root.configure(bg=C_BG)

        # Apply Astro-Orb icon (replaces Tkinter feather on title bar and Python icon on taskbar)
        self._apply_app_icon()

        # Server state
        self.server: Optional[uvicorn.Server] = None
        self.server_thread: Optional[threading.Thread] = None
        self.is_running = False
        self.port = 8000
        self.token = get_or_create_token()
        self.ip = get_tailscale_or_lan_ip()
        update_server_token(self.token)

        self.qr_image_tk: Optional[ImageTk.PhotoImage] = None
        self._last_rendered_device_state = None

        # Build UI
        self._setup_styles()
        self._build_header()
        self._build_body()

        # Connect Hub activity logger
        hub.add_event_callback(self.log_event_threadsafe)

        # Connect Device pairing/revocation listener
        add_device_listener(lambda event, dev: self.root.after(0, lambda: self.refresh_devices_ui(force=True)))

        # Intercept window close
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Start server automatically on launch
        self.root.after(100, self.start_server)

        # Start background telemetry polling
        self.root.after(1000, self._poll_telemetry)

    def _apply_app_icon(self):
        """Sets custom Astro-Orb icon on window title bar and Windows taskbar."""
        ico_path, png_path = ensure_app_icon()
        if ico_path:
            try:
                self.root.iconbitmap(default=ico_path)
            except Exception:
                try:
                    self.root.iconbitmap(ico_path)
                except Exception:
                    pass

        if png_path:
            try:
                self._app_icon_image = Image.open(png_path)
                self._app_icon_photo = ImageTk.PhotoImage(self._app_icon_image)
                self.root.iconphoto(True, self._app_icon_photo)
            except Exception:
                pass

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(".", background=C_BG, foreground=C_TEXT)

    def _build_header(self):
        header_frame = tk.Frame(self.root, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        header_frame.pack(fill=tk.X, padx=14, pady=(12, 6))

        # Brand / Title with Astro-Orb Logo
        brand_frame = tk.Frame(header_frame, bg=C_CARD)
        brand_frame.pack(side=tk.LEFT, padx=14, pady=10)

        _, png_path = ensure_app_icon()
        if png_path:
            try:
                raw_logo = Image.open(png_path).resize((38, 38), Image.Resampling.LANCZOS)
                self._header_logo_tk = ImageTk.PhotoImage(raw_logo)
                logo_lbl = tk.Label(brand_frame, image=self._header_logo_tk, bg=C_CARD)
                logo_lbl.pack(side=tk.LEFT, padx=(0, 10))
            except Exception:
                pass

        text_frame = tk.Frame(brand_frame, bg=C_CARD)
        text_frame.pack(side=tk.LEFT)

        title_lbl = tk.Label(
            text_frame,
            text="GravityDesk",
            font=("Segoe UI", 15, "bold"),
            fg=C_TEXT,
            bg=C_CARD,
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            text_frame,
            text="Antigravity (CLI) Remote Bridge",
            font=("Segoe UI", 9),
            fg=C_MUTED,
            bg=C_CARD,
        )
        sub_lbl.pack(anchor="w")

        # Controls & Status Pill
        right_frame = tk.Frame(header_frame, bg=C_CARD)
        right_frame.pack(side=tk.RIGHT, padx=14, pady=10)

        self.status_dot = tk.Label(
            right_frame,
            text="● STOPPED",
            font=("Segoe UI", 10, "bold"),
            fg=C_DANGER,
            bg=C_CARD,
        )
        self.status_dot.pack(side=tk.LEFT, padx=(0, 12))

        self.toggle_btn = tk.Button(
            right_frame,
            text="Start Server",
            font=("Segoe UI", 9, "bold"),
            bg=C_SUCCESS,
            fg="#ffffff",
            activebackground="#2ea043",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            padx=12,
            pady=4,
            cursor="hand2",
            command=self.toggle_server,
        )
        self.toggle_btn.pack(side=tk.LEFT)

    def _build_body(self):
        body_frame = tk.Frame(self.root, bg=C_BG)
        body_frame.pack(fill=tk.BOTH, expand=True, padx=14, pady=6)

        # Left Column (Pairing & Devices)
        left_col = tk.Frame(body_frame, bg=C_BG, width=370)
        left_col.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 7))
        left_col.pack_propagate(False)

        self._build_pairing_card(left_col)
        self._build_devices_card(left_col)

        # Right Column (Session, Vitals, Logs)
        right_col = tk.Frame(body_frame, bg=C_BG)
        right_col.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(7, 0))

        self._build_session_card(right_col)
        self._build_vitals_card(right_col)
        self._build_log_card(right_col)

    def _build_pairing_card(self, parent):
        card = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        card.pack(fill=tk.X, pady=(0, 10))

        lbl = tk.Label(
            card,
            text="MOBILE PAIRING",
            font=("Segoe UI", 9, "bold"),
            fg=C_MUTED,
            bg=C_CARD,
        )
        lbl.pack(anchor="w", padx=12, pady=(8, 2))

        sub_lbl = tk.Label(
            card,
            text="Scan QR code with GravityDesk Android app",
            font=("Segoe UI", 8),
            fg=C_MUTED,
            bg=C_CARD,
        )
        sub_lbl.pack(anchor="w", padx=12, pady=(0, 6))

        # QR Canvas
        qr_container = tk.Frame(card, bg="#ffffff", padx=6, pady=6)
        qr_container.pack(pady=2)

        self.qr_canvas = tk.Label(qr_container, bg="#ffffff")
        self.qr_canvas.pack()

        # Host and Revoke Action Bar
        action_frame = tk.Frame(card, bg=C_CARD)
        action_frame.pack(fill=tk.X, padx=12, pady=(8, 10))

        self.host_lbl = tk.Label(
            action_frame,
            text=f"Host: {self.ip}:{self.port}",
            font=("Cascadia Code", 8),
            fg=C_ACCENT,
            bg=C_CARD,
        )
        self.host_lbl.pack(anchor="center", pady=(0, 6))

        reset_token_btn = tk.Button(
            action_frame,
            text="Reset Pairing Token",
            font=("Segoe UI", 8, "bold"),
            bg="#3b1219",
            fg=C_DANGER,
            activebackground=C_DANGER,
            activeforeground="#ffffff",
            relief=tk.FLAT,
            padx=8,
            pady=4,
            cursor="hand2",
            command=self.revoke_token,
        )
        reset_token_btn.pack(fill=tk.X)

    def _build_devices_card(self, parent):
        self.devices_card = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        self.devices_card.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        top_row = tk.Frame(self.devices_card, bg=C_CARD)
        top_row.pack(fill=tk.X, padx=12, pady=(10, 6))

        lbl = tk.Label(
            top_row,
            text="REGISTERED DEVICES",
            font=("Segoe UI", 9, "bold"),
            fg=C_MUTED,
            bg=C_CARD,
        )
        lbl.pack(side=tk.LEFT)

        refresh_btn = tk.Button(
            top_row,
            text="Refresh",
            font=("Segoe UI", 7),
            bg=C_CARD,
            fg=C_MUTED,
            activebackground=C_BORDER,
            activeforeground=C_TEXT,
            relief=tk.FLAT,
            cursor="hand2",
            command=lambda: self.refresh_devices_ui(force=True),
        )
        refresh_btn.pack(side=tk.RIGHT)

        self.devices_container = tk.Frame(self.devices_card, bg=C_CARD)
        self.devices_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        self.refresh_devices_ui(force=True)

    def refresh_devices_ui(self, force: bool = False):
        if not hasattr(self, "devices_container"):
            return

        # Filter out revoked devices: only active devices appear in the list
        all_devices = get_devices()
        devices = [d for d in all_devices if d.get("status") == "active"]
        online_ids = get_online_device_ids()

        current_state = tuple(
            (
                d.get("id"),
                d.get("name"),
                d.get("ip"),
                d.get("id") in online_ids,
            )
            for d in devices
        )

        if not force and getattr(self, "_last_rendered_device_state", None) == current_state:
            return

        self._last_rendered_device_state = current_state

        for w in self.devices_container.winfo_children():
            w.destroy()

        if not devices:
            empty_box = tk.Frame(self.devices_container, bg=C_INPUT_BG, highlightthickness=1, highlightbackground=C_BORDER)
            empty_box.pack(fill=tk.X, pady=8)
            tk.Label(
                empty_box,
                text="No devices registered.\nScan QR code above with your mobile phone to pair.",
                font=("Segoe UI", 8),
                fg=C_MUTED,
                bg=C_INPUT_BG,
                justify=tk.CENTER,
                pady=14,
            ).pack()
            return

        for dev in devices:
            d_id = dev.get("id", "")
            d_name = dev.get("name", "Unknown Device")
            d_platform = dev.get("platform", "android")
            d_ip = dev.get("ip", "127.0.0.1")
            is_online = (d_id in online_ids)

            item_card = tk.Frame(self.devices_container, bg=C_INPUT_BG, highlightthickness=1, highlightbackground=C_BORDER)
            item_card.pack(fill=tk.X, pady=3)

            left_box = tk.Frame(item_card, bg=C_INPUT_BG)
            left_box.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=8, pady=6)

            title_row = tk.Frame(left_box, bg=C_INPUT_BG)
            title_row.pack(fill=tk.X)

            # Device Name (Clean, NO EMOJI)
            name_color = C_TEXT if is_online else C_MUTED
            tk.Label(
                title_row,
                text=d_name,
                font=("Segoe UI", 9, "bold"),
                fg=name_color,
                bg=C_INPUT_BG,
                anchor="w",
            ).pack(side=tk.LEFT)

            # Status pill (● ONLINE / ○ OFFLINE)
            status_text = "● ONLINE" if is_online else "○ OFFLINE"
            status_color = C_SUCCESS if is_online else C_MUTED

            tk.Label(
                title_row,
                text=status_text,
                font=("Segoe UI", 7, "bold"),
                fg=status_color,
                bg=C_INPUT_BG,
            ).pack(side=tk.RIGHT)

            meta_text = f"{d_platform.upper()} • {d_ip} • ID: {d_id[:8]}..."
            tk.Label(
                left_box,
                text=meta_text,
                font=("Cascadia Code", 7),
                fg=C_MUTED,
                bg=C_INPUT_BG,
                anchor="w",
            ).pack(fill=tk.X, pady=(2, 0))

            # Action Buttons Box
            btn_box = tk.Frame(item_card, bg=C_INPUT_BG)
            btn_box.pack(side=tk.RIGHT, padx=6, pady=6)

            # Revoke button
            revoke_btn = tk.Button(
                btn_box,
                text="Revoke",
                font=("Segoe UI", 7, "bold"),
                bg="#3b1219",
                fg=C_DANGER,
                activebackground=C_DANGER,
                activeforeground="#ffffff",
                relief=tk.FLAT,
                padx=6,
                pady=2,
                cursor="hand2",
                command=lambda i=d_id, n=d_name: self.revoke_single_device(i, n),
            )
            revoke_btn.pack(side=tk.LEFT)

    def revoke_single_device(self, dev_id: str, dev_name: str):
        confirm = messagebox.askyesno(
            "Revoke Device Access",
            f"Are you sure you want to revoke access for device:\n\n'{dev_name}' (ID: {dev_id[:8]}...)?\n\n"
            "This will immediately disconnect the device from the host and remove it from the registered devices list.",
            icon="warning",
            parent=self.root,
        )
        if not confirm:
            return

        revoke_device(dev_id)
        kick_device_sockets(dev_id)
        self.log_event(f"Device '{dev_name}' access revoked and disconnected.")
        self.refresh_devices_ui(force=True)
        active_devs = [d for d in get_devices() if d.get("status") == "active"]
        online_count = len(get_online_device_ids())
        if hasattr(self, "clients_lbl"):
            self.clients_lbl.config(text=f"{len(active_devs)} registered ({online_count} online)")


    def _build_session_card(self, parent):
        card = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        card.pack(fill=tk.X, pady=(0, 10))

        lbl = tk.Label(
            card,
            text="ACTIVE AGY SESSION",
            font=("Segoe UI", 9, "bold"),
            fg=C_MUTED,
            bg=C_CARD,
        )
        lbl.pack(anchor="w", padx=12, pady=(10, 4))

        info_grid = tk.Frame(card, bg=C_CARD)
        info_grid.pack(fill=tk.X, padx=12, pady=(0, 10))

        # Row 1: Workspace Folder
        tk.Label(info_grid, text="Workspace:", font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD).grid(
            row=0, column=0, sticky="w", pady=3
        )
        self.ws_lbl = tk.Label(
            info_grid,
            text=hub.current_cwd,
            font=("Cascadia Code", 8),
            fg=C_ACCENT,
            bg=C_CARD,
            anchor="w",
        )
        self.ws_lbl.grid(row=0, column=1, sticky="w", padx=8, pady=3)

        change_folder_btn = tk.Button(
            info_grid,
            text="Change",
            font=("Segoe UI", 8),
            bg="#21262d",
            fg=C_TEXT,
            relief=tk.FLAT,
            padx=6,
            pady=1,
            cursor="hand2",
            command=self.change_workspace,
        )
        change_folder_btn.grid(row=0, column=2, sticky="e", pady=3)

        # Row 2: Active Chat
        tk.Label(info_grid, text="Active Chat:", font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD).grid(
            row=1, column=0, sticky="w", pady=3
        )
        self.chat_lbl = tk.Label(
            info_grid,
            text="New Chat",
            font=("Segoe UI", 9),
            fg=C_TEXT,
            bg=C_CARD,
            anchor="w",
        )
        self.chat_lbl.grid(row=1, column=1, sticky="w", padx=8, pady=3)

        # Row 3: Connected Clients
        tk.Label(info_grid, text="Connected:", font=("Segoe UI", 9), fg=C_MUTED, bg=C_CARD).grid(
            row=2, column=0, sticky="w", pady=3
        )
        self.clients_lbl = tk.Label(
            info_grid,
            text="0 registered (0 online)",
            font=("Segoe UI", 9),
            fg=C_SUCCESS,
            bg=C_CARD,
            anchor="w",
        )
        self.clients_lbl.grid(row=2, column=1, sticky="w", padx=8, pady=3)

    def _build_vitals_card(self, parent):
        card = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        card.pack(fill=tk.X, pady=(0, 10))

        top_row = tk.Frame(card, bg=C_CARD)
        top_row.pack(fill=tk.X, padx=12, pady=(10, 6))

        lbl = tk.Label(
            top_row,
            text="LAPTOP VITALS & POWER",
            font=("Segoe UI", 9, "bold"),
            fg=C_MUTED,
            bg=C_CARD,
        )
        lbl.pack(side=tk.LEFT)

        # Sleep Inhibit Checkbox
        self.sleep_var = tk.BooleanVar(value=True)
        sleep_cb = tk.Checkbutton(
            top_row,
            text="Keep Laptop Awake",
            variable=self.sleep_var,
            font=("Segoe UI", 8),
            fg=C_TEXT,
            bg=C_CARD,
            selectcolor=C_INPUT_BG,
            activebackground=C_CARD,
            activeforeground=C_TEXT,
            command=self.toggle_sleep_inhibit,
        )
        sleep_cb.pack(side=tk.RIGHT)

        # Telemetry metrics row
        metrics_frame = tk.Frame(card, bg=C_CARD)
        metrics_frame.pack(fill=tk.X, padx=12, pady=(0, 10))

        # Battery
        self.v_bat_lbl = tk.Label(
            metrics_frame, text="Bat: --%", font=("Cascadia Code", 9), fg=C_TEXT, bg=C_CARD
        )
        self.v_bat_lbl.pack(side=tk.LEFT, padx=(0, 18))

        # CPU
        self.v_cpu_lbl = tk.Label(
            metrics_frame, text="CPU: --%", font=("Cascadia Code", 9), fg=C_TEXT, bg=C_CARD
        )
        self.v_cpu_lbl.pack(side=tk.LEFT, padx=(0, 18))

        # RAM
        self.v_ram_lbl = tk.Label(
            metrics_frame, text="RAM: --%", font=("Cascadia Code", 9), fg=C_TEXT, bg=C_CARD
        )
        self.v_ram_lbl.pack(side=tk.LEFT)

    def _build_log_card(self, parent):
        card = tk.Frame(parent, bg=C_CARD, highlightthickness=1, highlightbackground=C_BORDER)
        card.pack(fill=tk.BOTH, expand=True)

        head = tk.Frame(card, bg=C_CARD)
        head.pack(fill=tk.X, padx=12, pady=(8, 4))

        lbl = tk.Label(
            head,
            text="ACTIVITY LOG",
            font=("Segoe UI", 9, "bold"),
            fg=C_MUTED,
            bg=C_CARD,
        )
        lbl.pack(side=tk.LEFT)

        clear_log_btn = tk.Button(
            head,
            text="Clear",
            font=("Segoe UI", 8),
            bg=C_CARD,
            fg=C_MUTED,
            activebackground=C_BORDER,
            activeforeground=C_TEXT,
            relief=tk.FLAT,
            cursor="hand2",
            command=self.clear_log,
        )
        clear_log_btn.pack(side=tk.RIGHT)

        self.log_text = tk.Text(
            card,
            bg=C_INPUT_BG,
            fg="#c9d1d9",
            font=("Cascadia Code", 8),
            relief=tk.FLAT,
            wrap=tk.WORD,
            height=8,
            padx=8,
            pady=8,
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 10))

    def update_qr(self):
        pair_url = f"http://{self.ip}:{self.port}/?token={self.token}"
        if hasattr(self, "host_lbl"):
            self.host_lbl.config(text=f"Host: {self.ip}:{self.port}")

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=5,
            border=1,
        )
        qr.add_data(pair_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#000000", back_color="#ffffff").convert("RGBA")
        img = img.resize((150, 150), Image.Resampling.NEAREST)

        self.qr_image_tk = ImageTk.PhotoImage(img)
        self.qr_canvas.config(image=self.qr_image_tk)

    def log_event(self, text: str):
        ts = time.strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{ts}] {text}\n")
        self.log_text.see(tk.END)

    def log_event_threadsafe(self, text: str):
        self.root.after(0, lambda: self.log_event(text))

    def clear_log(self):
        self.log_text.delete("1.0", tk.END)

    def copy_token(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.token)
        self.log_event("Copied token to clipboard")

    def revoke_token(self):
        confirm = messagebox.askyesno(
            "Reset Pairing Token",
            "Are you sure you want to reset the current pairing token?\n\n"
            "This generates a fresh 256-bit token and immediately revokes all registered devices and active sessions.",
            icon="warning",
        )
        if not confirm:
            return

        self.token = revoke_and_create_token()
        update_server_token(self.token)
        revoke_all_devices()
        kick_all_device_sockets()
        self.update_qr()
        self.refresh_devices_ui(force=True)
        active_devs = [d for d in get_devices() if d.get("status") == "active"]
        if hasattr(self, "clients_lbl"):
            self.clients_lbl.config(text=f"{len(active_devs)} registered (0 online)")
        self.log_event("Pairing token reset. All devices disconnected. Generated new access key.")

    def change_workspace(self):
        target = filedialog.askdirectory(initialdir=hub.current_cwd, title="Select Project Directory")
        if target and os.path.isdir(target):
            hub.change_directory(target)
            self.ws_lbl.config(text=hub.current_cwd)

    def toggle_sleep_inhibit(self):
        if self.sleep_var.get():
            enable_sleep_inhibit()
            self.log_event("Sleep inhibit enabled (Laptop kept awake)")
        else:
            disable_sleep_inhibit()
            self.log_event("Sleep inhibit disabled")

    def toggle_server(self):
        if self.is_running:
            self.stop_server()
        else:
            self.start_server()

    def start_server(self):
        if self.is_running:
            return

        self.ip = get_tailscale_or_lan_ip()
        self.update_qr()

        config = uvicorn.Config(
            app,
            host="0.0.0.0",
            port=self.port,
            log_level="error",
            access_log=False,
        )
        self.server = uvicorn.Server(config)

        def _run():
            try:
                self.server.run()
            except Exception as e:
                self.log_event_threadsafe(f"Server error: {e}")
            finally:
                self.is_running = False
                self.root.after(0, self._on_server_stopped)

        self.server_thread = threading.Thread(target=_run, daemon=True)
        self.server_thread.start()
        self.is_running = True

        if self.sleep_var.get():
            enable_sleep_inhibit()

        self.status_dot.config(text="● ONLINE", fg=C_SUCCESS)
        self.toggle_btn.config(text="Stop Server", bg=C_DANGER, activebackground="#da3633")
        self.log_event(f"Server started on http://{self.ip}:{self.port}")

    def stop_server(self):
        if not self.is_running or not self.server:
            return

        self.log_event("Stopping server...")
        self.server.should_exit = True
        self.is_running = False
        self._on_server_stopped()

    def _on_server_stopped(self):
        disable_sleep_inhibit()
        self.status_dot.config(text="● STOPPED", fg=C_DANGER)
        self.toggle_btn.config(text="Start Server", bg=C_SUCCESS, activebackground="#2ea043")
        self.log_event("Server stopped")

    def _poll_telemetry(self):
        try:
            v = get_system_vitals()
            cpu = v.get("cpu_percent", 0)
            ram = v.get("memory_percent", 0)
            bat = v.get("battery")

            self.v_cpu_lbl.config(text=f"CPU: {cpu}%")
            self.v_ram_lbl.config(text=f"RAM: {ram}%")

            if bat:
                chg = "[CHG] " if bat.get("is_charging") else ""
                self.v_bat_lbl.config(text=f"{chg}Bat: {bat.get('percent')}%")
            else:
                self.v_bat_lbl.config(text="AC Power")

            # Update session info
            if self.ws_lbl["text"] != hub.current_cwd:
                self.ws_lbl.config(text=hub.current_cwd)

            active_devs = [d for d in get_devices() if d.get("status") == "active"]
            online_count = len(get_online_device_ids())
            self.clients_lbl.config(text=f"{len(active_devs)} registered ({online_count} online)")

            chat_name = "New Chat"
            if hub.active_conversation_id:
                chat_name = f"Chat: {hub.active_conversation_id[:12]}..."
            self.chat_lbl.config(text=chat_name)

            # Keep device list and online/offline status updated in real-time
            self.refresh_devices_ui()

        except Exception:
            pass

        # Schedule next poll (1000ms for high responsiveness)
        self.root.after(1000, self._poll_telemetry)

    def on_close(self):
        if self.is_running and self.server:
            self.server.should_exit = True
        disable_sleep_inhibit()
        self.root.destroy()


def main():
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("w1th0ut.gravitydesk.controlcenter.1.0")
    except Exception:
        pass

    root = tk.Tk()
    app_gui = GravityDeskGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
