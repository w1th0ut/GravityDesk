<div align="center">

# 🚀 GravityDesk

### **Self-Hosted Remote Control System for Google Antigravity (`agy`) CLI & Windows Workstations over Tailscale**

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Windows ConPTY](https://img.shields.io/badge/Windows-ConPTY-0078D6.svg?logo=windows&logoColor=white)](https://docs.microsoft.com/en-us/windows/console/)
[![Tailscale](https://img.shields.io/badge/Network-Tailscale%20WireGuard-231F20.svg?logo=tailscale&logoColor=white)](https://tailscale.com/)
[![React Native](https://img.shields.io/badge/Mobile-React%20Native%20%2F%20Expo-61DAFB.svg?logo=react&logoColor=black)](https://reactnative.dev/)
[![Zero Cloud](https://img.shields.io/badge/Privacy-100%25%20Self--Hosted-success.svg)](#security-architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*Control, prompt, and monitor autonomous Google Antigravity AI coding sessions on your Windows workstation straight from your Android phone — wherever you are, zero cloud intermediaries required.*

</div>

---

## 🌟 Highlights

- 🖥️ **Modern Desktop GUI Control Center**: Clean dark-mode Tkinter management window showing host status, detected Tailscale IPv4, dynamic high-resolution QR pairing code, 1-click token copy, workspace picker, and real-time activity log.
- ⚡ **Zero-Lag ConPTY Virtual Terminal**: Native Windows Pseudo Console (`pywinpty`) integration streaming ANSI output directly over WebSocket with a 3,000-chunk ring buffer for lossless session catch-up.
- 🧠 **Google Antigravity (`agy`) First-Class Citizen**: Autonomous session continuity with `--dangerously-skip-permissions`, mobile-responsive ASCII welcome banner, and real-time conversation resume synchronized directly with local Antigravity SQLite storage.
- 📱 **Native Android Companion App**: Auto-expanding WhatsApp-style multiline prompt input, native Android voice-to-text dictation, quick signals (`Ctrl+C`), and live workstation vitals (CPU %, RAM %, Battery %, Charging status).
- 🚫 **Instant Access Revocation**: One-click 256-bit cryptographic token rotation instantly locks out stale or lost mobile sessions and invalidates active connections in real time.
- 🔒 **Zero-Trust Defense-in-Depth**: Operates exclusively over encrypted Tailscale WireGuard mesh tunnels, timing-safe authentication (`hmac.compare_digest`), path-traversal safeguards, and strict command execution allowlists.
- 🔋 **Windows Sleep Inhibit**: Prevents host laptops from entering standby or suspend mode during active remote sessions using the native Win32 API (`kernel32.SetThreadExecutionState`).
---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Host Workstation** | Windows 10 / 11, Python 3.12+, Tkinter, Pillow, Win32 API |
| **Backend Daemon** | FastAPI, Uvicorn, `pywinpty`, `psutil`, `qrcode`, SQLite |
| **Networking** | Tailscale (WireGuard Mesh), WebSocket (`/ws/terminal`), HTTP REST |
| **Mobile Native** | React Native, Expo, TypeScript, `expo-secure-store` |
| **Target Engine** | Google Antigravity CLI (`agy`) |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Windows Workstation**: Windows 10 or 11.
- **Python**: Version `3.12+` installed and added to `PATH`.
- **Google Antigravity**: `agy` CLI installed globally and authenticated.
- **Tailscale**: Installed and signed in on both your Windows PC and your Android phone on the same tailnet.

### 2. Installation

Clone the repository and install the verified dependencies:

```bash
git clone https://github.com/your-username/GravityDesk.git
cd GravityDesk
pip install -r requirements.txt
```

### 3. Launching the Control Center

Start the Desktop GUI Control Center using the batch launcher or Python:

```bash
# Option A: One-click launcher
run_gui.bat

# Option B: Direct Python invocation
python gui.py
```

The GravityDesk Control Center will launch:
1. Automatically resolves your workstation's **Tailscale IPv4 address**.
2. Loads (or generates) your **256-bit cryptographic auth token**.
3. Renders a high-contrast **QR Code** directly in the desktop window.
4. Starts the background FastAPI server on port `8000`.

### 4. Pairing from Mobile

1. Open your Android device camera or mobile browser.
2. Scan the QR code shown on your laptop desktop screen (or tap **Copy URL** in the desktop app and send it to your phone).
3. The GravityDesk Web Terminal will launch instantly:
   - Displays real-time **CPU, RAM, and Battery** vitals.
   - Greets you with the **ASCII AGY** welcome terminal.
   - Allows instant workspace switching and conversation resumption.

---

## 🔒 Security Architecture

GravityDesk is engineered with institutional-grade security principles for remote execution:

- **Private WireGuard Mesh**: The server binds exclusively within your private Tailscale network (`100.x.y.z`). No ports are forwarded to the public internet, completely eliminating external attack surfaces.
- **Cryptographic Token Handshake**: Authentication requires a 256-bit token generated via Python's `secrets.token_hex(32)`. Requests are validated using constant-time comparison (`hmac.compare_digest`) to protect against side-channel timing attacks.
- **Instant Revocation**: Compromised your phone or lost access? Tap **🚫 Revoke Access** in the Desktop GUI. GravityDesk generates a new 256-bit secret, overwrites `.env`, and invalidates all existing sessions immediately.
- **Binary Allowlist**: Spawning arbitrary executables is prohibited. Only pre-vetted shells (`cmd.exe`, `powershell.exe`) and Google Antigravity (`agy.exe`) are permitted.
- **Path Traversal Protection**: Folder browsing requests are sanitized via `os.path.realpath`, validating paths against physical drive roots (`C:\`, `D:\`) to block traversal exploits.

---

## 📱 Mobile UI Features

| Feature | Description |
|---|---|
| **WhatsApp-Style Input** | Auto-expanding textarea up to 130px that scrolls naturally and preserves multi-line prompts without obstructing the terminal viewport. |
| **Voice-to-Text Dictation** | One-tap voice prompt bar utilizing native on-device speech recognition for hands-free agent steering. |
| **Workspace Selector** | Interactive directory navigation modal to effortlessly switch project folders without touching your workstation. |
| **Session Resume** | Direct integration with Antigravity SQLite database to resume prior chat conversations by summary and timestamp. |
| **Quick Action Toolbar** | Dedicated touch buttons for `Ctrl+C` (SIGINT interrupt), `Enter`, and workspace/resume management. |

---

## 🧪 Testing & Verification

GravityDesk includes an automated integration test suite verifying authentication entropy, ConPTY process lifecycle, path traversal boundaries, and endpoint security:

```bash
# Run the integration test suite
python -m tests.test_server
```

All tests execute synchronously against the FastAPI test harness with zero network overhead.

---

## 📂 Project Structure

```
GravityDesk/
├── server/                    # Backend daemon bounded context
│   ├── main.py                # FastAPI app, endpoints, WebSocket hub
│   ├── terminal.py            # Windows ConPTY runner & sequence ring buffer
│   ├── system.py              # Telemetry vitals & Win32 sleep inhibitor
│   ├── network.py             # Tailscale IP resolver, token generator & QR
│   ├── conversations.py       # AGY SQLite resume & session sync
│   ├── workspaces.py          # Directory explorer & path safety validation
│   └── gui.py                 # Desktop GUI Control Center (Tkinter)
├── mobile/                    # React Native / Expo client bounded context
│   ├── App.tsx                # Main mobile application entrypoint
│   └── src/                   # Native components, hooks, and secure storage
├── tests/                     # Test suite
│   └── test_server.py         # Integration & security test harness
├── gui.py                     # Desktop GUI root launcher
├── run_gui.bat                # Windows 1-click execution batch script
├── requirements.txt           # Python package dependencies
├── LICENSE                    # MIT Open Source License
└── AGENTS.md                  # Autonomous agent operational manual
```

---

## 🛣️ Roadmap

- [x] Windows ConPTY terminal runner with async WebSocket streaming
- [x] Tailscale auto-detection & 256-bit token authentication
- [x] Real-time hardware vitals (CPU, RAM, Battery, AC status)
- [x] Dynamic QR Code pairing & Instant Access Revocation
- [x] Modern Tkinter Desktop Control Center
- [x] AGY conversation history sync from SQLite
- [x] Mobile WhatsApp-style multiline prompt bar & Voice STT
- [ ] Standalone Android APK build (`expo prebuild` / Android Studio)
- [ ] Push notification alerts on AGY prompt completion or error
- [ ] Biometric fingerprint authentication on mobile app

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Developed as a high-performance developer tool for the Google Antigravity ecosystem.
