# Mobile Subsystem Context

## Role
The GravityDesk Mobile client is a React Native (Expo) TypeScript application providing remote management of the `agy` CLI daemon over Tailscale.

## Responsibilities
1. **Status & Vitals**: Displays real-time connection state (Online/Offline) and laptop telemetry (Battery percentage, charging state, CPU, RAM).
2. **QR Code Pairing**: Uses device camera to scan terminal QR code, extracts host URL and authentication token, and persists credentials in `expo-secure-store`.
3. **Workspace Explorer**: Interactive breadcrumb folder navigator and one-tap favorite directory switcher.
4. **Streaming Terminal UI**: Virtualized ANSI-colored terminal view receiving WebSocket output with 50ms batch throttling for smooth rendering.
5. **Input & Voice Prompting**: On-device Android speech-to-text dictation into an editable text field, plus quick-action buttons (`Ctrl+C`, `y`, `n`, `Enter`).
6. **Resilient Reconnection**: Automatically catches up on missed output after backgrounding or network handovers using monotonic sequence requests.
