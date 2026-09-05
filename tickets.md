# Tickets: GravityDesk Core Remote Control System

Building a mobile remote control system for `agy` CLI on Windows over Tailscale.
Source specification: [spec.md](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/spec.md)

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

## 1. Foundation Scaffolding & Health Ping Tracer Bullet

**What to build:** An initial end-to-end slice containing the FastAPI backend daemon with Tailscale IP detection and `/api/health` system metric reporting (CPU, RAM, Battery, OS), paired with a baseline mobile status screen that pings the host and displays live online/offline indicators.

**Blocked by:** None — can start immediately.

- [x] Backend FastAPI application created with `/api/health` returning machine vitals and detected Tailscale IP.
- [x] Laptop Tailscale IPv4 auto-detection utility inspecting local network interfaces.
- [x] Mobile client connecting to `/api/health` with visual green/red connection status indicator and telemetry card.
- [x] Integration test verifying the `/api/health` response contract.

## 2. QR Code Pairing & Secure Token Handshake

**What to build:** Server-side cryptographic pairing token generator that renders an ASCII QR code in the terminal on startup, coupled with mobile QR code camera scanner that stores the token in secure storage and attaches it to authenticated requests.

**Blocked by:** 1. Foundation Scaffolding & Health Ping Tracer Bullet.

- [x] Backend generates 256-bit secret token on startup and prints terminal ASCII QR code `gravitydesk://pair?host=...&token=...`.
- [x] Backend FastAPI dependency validating `Bearer` token on protected endpoints.
- [x] Mobile client scans QR code or accepts manual token entry, saving credentials into `expo-secure-store`.
- [x] Unauthenticated requests return `401 Unauthorized`.

## 3. Workspace Explorer & Favorites Directory Picker

**What to build:** Laptop filesystem navigator enabling the mobile user to browse project folders on Windows, view active breadcrumbs, and maintain a list of pinned favorite projects.

**Blocked by:** 2. QR Code Pairing & Secure Token Handshake.

- [x] Backend `/api/workspaces` endpoint listing subdirectories, drive roots, and validating folder existence.
- [x] Backend `/api/workspaces/favorite` endpoint storing and retrieving user-pinned folders from `favorites.json`.
- [x] Mobile Directory Picker modal with breadcrumb navigation, quick folder jump, and favorite pinning toggle.
- [x] Integration tests for filesystem directory traversal security (preventing path traversal outside existing drives).

## 4. Interactive ConPTY Terminal & WebSocket Stream

**What to build:** Persistent Windows ConPTY terminal runner that spawns interactive CLI processes (`agy` or shell) without blocking the `asyncio` event loop, streaming sequence-tagged ANSI output over WebSocket to a mobile virtualized terminal view.

**Blocked by:** 3. Workspace Explorer & Favorites Directory Picker.

- [x] Backend ConPTY manager running a dedicated background thread reading from `pywinpty` and pushing to `asyncio.Queue`.
- [x] WebSocket endpoint `/ws/terminal` broadcasting live ANSI stream chunks with monotonic sequence numbers.
- [x] Mobile virtualized ANSI terminal screen rendering colored logs with 50ms batch throttling for smooth 60 FPS scrolling.
- [x] Bidirectional user keyboard input and `Enter` key transmission from mobile to the running CLI process.

## 5. Voice-to-Text Input & Session Resiliency (Signals & Reconnect Replay)

**What to build:** Native Android speech-to-text prompt input bar with pre-send editing, quick terminal action buttons (`Ctrl+C` / SIGINT signal, `y`, `n`, `Clear`), automatic WebSocket reconnect with sequence catch-up replay, and Windows sleep prevention.

**Blocked by:** 4. Interactive ConPTY Terminal & WebSocket Stream.

- [x] On-device Android voice recognition button transcribing speech directly into the prompt text field for editing.
- [x] Quick-action toolbar firing `SIGINT` (Ctrl+C), `y`, `n`, `Clear`, and emergency process termination.
- [x] Sequence ring-buffer replaying missed logs on mobile reconnect (`{"type": "subscribe", "last_seq": N}`).
- [x] Windows power management integration (`SetThreadExecutionState`) preventing laptop sleep while daemon runs.
