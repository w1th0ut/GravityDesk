# GravityDesk Context Map

This monorepo is split into two primary bounded contexts:

| Subsystem | Path | Description | Domain Context File |
|---|---|---|---|
| Backend Daemon | `server/` | Python FastAPI + ConPTY (`pywinpty`) + WebSocket + Tailscale | `server/CONTEXT.md` |
| Mobile Client | `mobile/` | React Native (Expo) + TypeScript + Native STT + Terminal UI | `mobile/CONTEXT.md` |
| Architecture Docs | `docs/` | ADRs, system specs, and agent configurations | `docs/adr/` |
