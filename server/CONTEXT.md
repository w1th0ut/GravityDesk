# Server Subsystem Context

## Role
The GravityDesk Server is an async Python FastAPI daemon executing on the Windows host machine.

## Responsibilities
1. **ConPTY Terminal Management**: Spawns interactive CLI sessions (`agy.exe` or shell) inside Windows pseudo-terminal (`pywinpty`). Dedicated background reader thread pushes output chunks into `asyncio.Queue` without blocking the event loop.
2. **Session Ring Buffer**: Retains up to 3,000 recent log chunks tagged with monotonic sequence numbers (`seq`). Handles reconnection replay when the client sends `{"type": "subscribe", "last_seq": N}`.
3. **Network & Security**: Detects Tailscale IP (`100.x.y.z`), binds to port 8000, and generates an ephemeral/persisted 256-bit token displayed in terminal via ASCII QR code. Enforces token auth on REST and WebSocket endpoints.
4. **Laptop Power Inhibit**: Invokes Windows API `kernel32.SetThreadExecutionState` to prevent the laptop from entering standby while remote connections are expected.
5. **Filesystem Explorer**: Provides directory navigation, drive detection, and favorite project shortcuts.

## Key Files
- `server/main.py`: Application entrypoint, FastAPI routing, and WebSocket endpoint.
- `server/terminal.py`: PTY lifecycle, background reader thread, and sequence ring-buffer.
- `server/system.py`: System vitals (CPU, RAM, Battery) and Windows power inhibit.
- `server/network.py`: IP address resolution and QR code rendering.
- `server/workspaces.py`: Filesystem explorer and favorites management.
