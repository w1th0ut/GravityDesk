# GravityDesk — Agent Operational Manual & Architecture Guide

Remote Control & Telemetry System for Google Antigravity (`agy`) CLI from Android to Windows Host over Tailscale WireGuard Mesh.

---

## 1. System Overview & Bounded Contexts

GravityDesk is organized as a multi-context monorepo engineered to strict Clean Architecture paradigms. The project bridges mobile devices to a Windows developer workstation, streaming bidirectional terminal I/O and telemetry with sub-50ms latency.

```
┌──────────────────────────────────────────────────────────┐
│                   Mobile Client (Android)                │
│   • Expo / React Native App (`mobile/`)                  │
│   • Native Voice-to-Text & Quick Action Bar              │
└────────────────────────────┬─────────────────────────────┘
                             │  Tailscale Mesh (WireGuard)
                             │  HTTP + WebSocket (Port 8000)
┌────────────────────────────▼─────────────────────────────┐
│              GravityDesk Daemon (`server/`)               │
│   • FastAPI REST Endpoints & WebSocket `/ws/terminal`     │
│   • Windows ConPTY Runner (`server/terminal.py`)         │
│   • SQLite / JSON Chat Resume (`conversations.py`)       │
│   • Windows Sleep Inhibit & Vitals (`system.py`)         │
└────────────────────────────┬─────────────────────────────┘
                             │  Local Subprocess / IPC
┌────────────────────────────▼─────────────────────────────┐
│          Google Antigravity CLI (`agy.exe`) / CMD        │
│   • Headless CLI with `--dangerously-skip-permissions`    │
│   • Active Workspace Directory                           │
└──────────────────────────────────────────────────────────┘
```

### Bounded Context Directory Layout

| Subsystem | Root Path | Primary Responsibilities | Domain Reference |
|---|---|---|---|
| **Backend Daemon** | `server/` | FastAPI REST/WebSocket endpoints, ConPTY runner, Tailscale resolver, process supervisor, system vitals, sleep inhibitor. | `server/main.py` |
| **Desktop Control Center** | `gui.py`, `server/gui.py` | Modern Tkinter desktop dashboard, dynamic QR Code pairing, 1-click token copy, workspace directory picker, Instant Access Revocation. | `server/gui.py` |
| **Mobile Client** | `mobile/` | React Native (Expo) TypeScript application, Android native voice dictation, virtualized ANSI terminal renderer. | `mobile/src/screens/TerminalScreen.tsx` |
| **Integration Tests** | `tests/` | End-to-end security, token entropy, ConPTY lifecycle, and endpoint contracts. | `tests/test_server.py` |

---

## 2. Operational Invariants for AI Agents

When operating within this codebase, all autonomous agents **MUST** comply with the following non-negotiable operational rules:

1. **NEVER RUN `python -m server.main` AUTONOMOUSLY**:
   - The user or the Desktop GUI runs the live server daemon. Do not launch background instances of `server.main` as it binds port 8000 and interferes with the user's active session.
2. **LAUNCHING THE DESKTOP GUI**:
   - Use `python gui.py` or execute `run_gui.bat`.
3. **RUNNING VERIFICATION & TESTS**:
   - Execute tests using `python -m tests.test_server` or `python -m pytest`.
   - Never consider a feature or refactor complete without verifying that all tests pass with exit code 0.
4. **NO UNCONTROLLED PROCESS SPAWNING**:
   - ConPTY handles (`pywinpty`) allocate unmanaged Windows pseudo-consoles. Any test or utility initializing terminal sessions must invoke `session.stop()` or utilize context-managed execution to guarantee no orphan handles.
5. **DETERMINISTIC CLEAN ARCHITECTURE**:
   - Do not leak presentation state into business domain models. Terminal ANSI parsing, session sequence buffering, and filesystem traversal logic must remain decoupled in their respective modules.

---

## 3. Security Invariants & Defense-in-Depth

GravityDesk provides remote terminal execution into the host workstation. The following security controls are strictly enforced:

### Cryptographic Authentication
- **Entropy**: Minimum 256-bit cryptographic entropy generated via `secrets.token_hex(32)`.
- **Timing Attacks**: Token verification must use `hmac.compare_digest` to eliminate timing-channel vulnerability.
- **Persistence**: Tokens are stored in `.env` (excluded by `.gitignore`).
- **Instant Revocation**: Triggered via Desktop GUI (`server/network.py:revoke_and_create_token()`). Overwrites `.env` with a newly generated 256-bit token and resets the runtime cache immediately.

### Remote Code Execution (RCE) Allowlist
- Arbitrary binary spawning is blocked with `400 Bad Request`.
- Only explicitly whitelisted binaries are allowed:
  - `cmd.exe`
  - `powershell.exe`
  - `agy.exe` (or `agy`)

### Path Traversal Mitigation
- All folder browsing and workspace selection endpoints validate paths via `os.path.realpath`.
- Input paths must resolve to an existing directory and validate against detected drive roots (`C:\`, `D:\`, etc.). Unsanitized paths are rejected with `400 Bad Request`.

---

## 4. Issue Tracking & Autonomous Triage

For complex multi-stage tasks or issue analysis, agents follow the canonical 5-role triage state machine:

| Status Label | Role / Intent | Execution Rule |
|---|---|---|
| `needs-triage` | Newly submitted feature or bug | Needs architectural assessment. |
| `needs-info` | Blocked on clarification | Ask user for required specifications. |
| `ready-for-agent` | Specification finalized | Ready for autonomous test-driven execution. |
| `ready-for-human` | Requires physical device or credentials | Blocked on human action (e.g., physical Android camera scan). |
| `wontfix` | Out of scope or obsolete | Discarded; do not implement. |


---

## 5. Development & Contribution Standards

- **Language Support**: Python 3.12+ (Backend & Desktop GUI), TypeScript / React Native Expo (Mobile Client).
- **Type Safety**:
  - Python: Explicit type annotations on all function signatures (`typing.List`, `typing.Optional`, `typing.Dict`).
  - TypeScript: Strict type mode enabled in `mobile/tsconfig.json`.
- **Git Commit Protocol**: Strict Conventional Commits standard:
  - `feat(<subsystem>): <description>`
  - `fix(<subsystem>): <description>`
  - `refactor(<subsystem>): <description>`
  - `docs(<subsystem>): <description>`
  - `test(<subsystem>): <description>`
