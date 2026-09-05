# Map: GravityDesk Core Architecture & PoC

**Label:** `wayfinder:map`  
**Date:** 2026-09-05  

## Destination

A fully working, verifiable Proof-of-Concept (PoC) validating the core architectural hypothesis: Windows ConPTY terminal streaming over Tailscale WebSocket to a remote mobile/web client with pairing token security, health metrics, and responsive interactive bidirectional I/O.

## Notes

- **Domain:** Remote CLI Control (`agy`), Windows ConPTY, WebSocket, Tailscale Mesh VPN, Expo React Native.
- **Skills:** `/prototype`, `/domain-modeling`, `/grill-with-docs`, `/test-driven-development`.
- **Target Host:** Windows 10/11 with Python 3.10+ and `pywinpty`.

## Decisions so far

- [Interactive Terminal Session Model](file:///C:/Users/bagas/Downloads/GravityDesk/docs/agents/domain.md) — Windows ConPTY persistent session via worker thread + `asyncio.Queue` to support interactive prompts and ANSI escape codes without event-loop blocking.
- [On-Device Android Speech Recognizer](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/spec.md) — Fast, zero-cost, editable voice input prior to dispatching prompts.
- [Quick Favorites + Breadcrumb Workspace Explorer](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/spec.md) — Rapid access to pinned directories plus remote laptop filesystem navigation.
- [Terminal QR Code Pairing](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/spec.md) — Ephemeral/persisted 256-bit token displayed as ASCII QR code on server startup.

## Tickets

1. [Ticket: PoC Backend ConPTY & WebSocket Server](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/tickets/01-poc-backend.md) (`wayfinder:prototype`) — Build the FastAPI PoC daemon with Windows ConPTY worker, Tailscale IP auto-detection, QR code generation, and WebSocket streaming.
2. [Ticket: PoC Mobile/Web Interactive Terminal Client](file:///C:/Users/bagas/Downloads/GravityDesk/.scratch/gravitydesk-core/tickets/02-poc-client.md) (`wayfinder:prototype`) — Build an interactive web/mobile test harness with ANSI parsing, prompt input, and quick-action buttons to verify live streaming over Tailscale.

## Not yet specified

- Native Expo Camera QR scanning integration and SecureStore packaging for production Android APK.
- Background Android push notifications when an `agy` task completes.

## Out of scope

- Multi-tenant cloud relay servers (strictly peer-to-peer via Tailscale).
- Non-Windows daemon host platforms (v1 strictly targets Windows ConPTY).
