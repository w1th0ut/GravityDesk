# Domain Documentation Layout

## Structure
Multi-context layout for GravityDesk monorepo:
- `CONTEXT-MAP.md` at the repository root maps workspaces to their domain contexts.
- `server/CONTEXT.md` describes the FastAPI backend, Windows ConPTY daemon, Tailscale networking, and agy process management.
- `mobile/CONTEXT.md` describes the React Native (Expo) mobile frontend, Android speech-to-text, WebSocket terminal streaming, and UI state.
- `docs/adr/` stores Architecture Decision Records for significant technical choices.

## Consumer Rules
- Skills (`improve-codebase-architecture`, `diagnosing-bugs`, `tdd`, etc.) must consult `CONTEXT-MAP.md` first to locate the relevant subsystem context before reading or modifying code.
