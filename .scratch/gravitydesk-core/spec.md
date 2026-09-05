# Specification: GravityDesk Core Remote Control System

**Status:** `ready-for-agent`  
**Date:** 2026-09-05  

## Problem Statement

Software engineers using Anti-Gravity (`agy`) CLI need to monitor, prompt, and interact with autonomous development agents when away from their laptops (e.g. commuting, outside the house, or in meetings). Existing remote access tools like standard SSH clients or full desktop remotes (AnyDesk/TeamViewer) are cumbersome on mobile touchscreens, consume excessive battery and mobile data, lack native speech-to-text integration, and fail to provide quick, persistent project context switching without risking process termination when network connections switch between cellular and Wi-Fi.

## Solution

GravityDesk is a lightweight, mobile-first remote control system for `agy` CLI operating securely over a Tailscale P2P mesh network. It consists of a Windows FastAPI daemon hosting a persistent Windows ConPTY pseudo-terminal session, and a React Native (Expo) Android mobile client. The mobile app provides instant pairing via an in-terminal QR code, real-time laptop health monitoring (battery, CPU, RAM, Tailscale IP), a remote directory and favorite projects picker, native on-device speech-to-text for prompt input, and a high-performance virtualized ANSI streaming terminal with quick action buttons (`Ctrl+C`, `y`, `n`, `Enter`). Sockets are buffered with a sequence ring-buffer to guarantee zero output loss across mobile reconnections.

## User Stories

1. As a developer on the go, I want to see whether my laptop is currently online or offline, so that I know if I can issue commands to agy.
2. As a developer, I want to pair my mobile device with my laptop by scanning a QR code displayed on my laptop's terminal, so that I can establish a secure connection without manually typing IP addresses or auth tokens.
3. As a developer, I want my pairing credentials saved securely in my device's secure storage, so that I do not need to re-pair every time I launch the app.
4. As a developer, I want to view laptop system vitals (battery level, charging status, CPU utilization, and RAM usage), so that I don't accidentally drain my laptop battery or overwhelm the machine while away.
5. As a developer, I want my laptop to automatically prevent sleep while the GravityDesk daemon is active, so that my remote connection remains alive with the laptop lid closed.
6. As a developer, I want to view a list of my pinned favorite project directories, so that I can immediately switch to active codebases with one tap.
7. As a developer, I want to navigate the laptop's filesystem via a breadcrumb folder explorer, so that I can select any project repository on my laptop.
8. As a developer, I want to start an interactive agy CLI session in my selected project directory, so that agy executes with the proper workspace context.
9. As a developer, I want to see real-time streaming output from agy with preserved ANSI colors, so that I get the exact terminal experience as if I were sitting at my laptop.
10. As a developer, I want to dictate prompts using native Android voice-to-text, so that I can quickly give complex coding instructions to agy hands-free.
11. As a developer, I want to review and edit transcribed voice text in the input bar before sending it, so that I can fix speech recognition typos or adjust code terminology.
12. As a developer, I want quick-action terminal buttons (such as `Ctrl+C`, `y`, `n`, `Enter`, and `Clear`), so that I can answer agy tool-approval prompts without fighting the mobile software keyboard.
13. As a developer, I want the terminal output to be maintained continuously on the laptop even if my phone screen locks or my phone loses cellular signal, so that long-running agent tasks never crash.
14. As a developer, I want the mobile terminal to automatically catch up and replay missed logs upon reconnecting, so that I don't miss important agent progress messages or error outputs.
15. As a developer, I want to send a SIGINT (`Ctrl+C`) or emergency stop command to agy, so that I can interrupt rogue or runaway agent execution immediately.
16. As a developer, I want terminal log streams to be throttled and virtualized on mobile, so that my phone's interface stays butter-smooth even during massive log output.
17. As a developer, I want to copy snippets or error messages from the mobile terminal, so that I can share or inspect them elsewhere on my phone.
18. As a developer, I want to manually adjust or test the Tailscale IP and port settings in the app, so that I can troubleshoot network routes if needed.

## Implementation Decisions

1. **Architecture Layout**: Multi-context monorepo containing `server/` (Python FastAPI backend) and `mobile/` (React Native Expo TypeScript client).
2. **Terminal Subprocess Isolation**: Windows ConPTY (`pywinpty`) spawned in a background process. To prevent blocking the FastAPI `asyncio` event loop on Windows, stdout reading is executed in a dedicated worker thread that pushes log chunks into an `asyncio.Queue` via `loop.call_soon_threadsafe`.
3. **Session Ring-Buffer**: Sockets stream log chunks tagged with monotonic integers (`seq`). An in-memory ring buffer (default capacity: 3,000 chunks) buffers recent output so reconnecting clients can request catch-up replay via `{"type": "subscribe", "last_seq": N}`.
4. **Tailscale & Network Discovery**: The server automatically inspects active network adapters for Tailscale CGNAT IPs (`100.64.0.0/10` address range) and binds securely.
5. **Zero-Trust Ephemeral Pairing**: The server generates a 256-bit cryptographically secure token saved in a local `.env` and renders a terminal ASCII QR code (`gravitydesk://pair?host=...&token=...`) on startup. WebSocket connections require token verification before handshake acceptance.
6. **Sleep Inhibit**: Windows Power API `ctypes.windll.kernel32.SetThreadExecutionState` is called with `ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED` while the server runs.
7. **Mobile Terminal Rendering**: React Native virtualized list rendering ANSI-colored segments with 50ms batch throttling to maintain 60 FPS on mobile.
8. **Speech-to-Text**: Native on-device Android Speech Recognizer integration with an editable text prompt bar.

## Testing Decisions

1. **Definition of a Good Test**: Tests must verify observable behavior at high seams (REST endpoints, WebSocket message contracts, and UI interactions) rather than mocking internal helper methods or coupling to implementation details.
2. **Backend Testing Seam**: FastAPI `TestClient` and `websockets` async client testing the public API boundary:
   - Health status and metric reporting.
   - Filesystem navigation and favorites validation.
   - PTY session lifecycle: start, input delivery, sequence-tagged streaming output, reconnect replay, and SIGINT termination.
3. **Frontend Testing Seam**: React Native Testing Library testing the Terminal View & Prompt Controller:
   - Rendering incoming WebSocket packets into colored text spans.
   - Verifying shortcut buttons send expected protocol payloads.
   - Verifying voice input sets text in the prompt field.

## Out of Scope

- Multi-user authentication or role-based access control (this is a single-user personal remote tool).
- Running on Linux or macOS laptop hosts (v1 targets Windows host specifically due to ConPTY integration).
- Custom cloud relay servers (Tailscale P2P mesh network is the sole network transport).
- File upload/download editor beyond directory selection and CLI terminal control.

## Further Notes

- `agy` CLI binary must be present in the Windows host `PATH` or configured via `AGY_BIN_PATH` in `server/.env`.
- Pairing QR code can be rescanned at any time by running `python -m server.main --show-qr` or viewing the server console output.
