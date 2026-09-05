/**
 * Session Lifecycle & Interactive Controls
 */
import { state } from './state.js';
import { fetchVitals } from './vitals.js';

export async function toggleSession() {
  const btn = document.getElementById("session-btn");
  if (!btn) return;
  btn.disabled = true;
  try {
    if (state.isSessionRunning) {
      await fetch(`/api/session/stop?token=${state.token}`, { method: "POST" });
    } else {
      await fetch(`/api/session/start?token=${state.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: state.activePath || undefined })
      });
    }
    await fetchVitals();
  } catch (err) {
    console.warn("Session toggle error:", err);
  } finally {
    btn.disabled = false;
  }
}

export function autoResizeInput() {
  const termInput = document.getElementById("term-input");
  if (!termInput) return;
  termInput.style.height = "auto";
  const nextHeight = Math.min(termInput.scrollHeight, 130);
  termInput.style.height = Math.max(36, nextHeight) + "px";
}

export function sendPrompt() {
  const termInput = document.getElementById("term-input");
  if (!termInput) return;
  const text = termInput.value.trim();
  if (!text) return;
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.innerText = "Thinking...";
      sendBtn.disabled = true;
    }
    state.ws.send(JSON.stringify({ type: "stdin", data: text + "\r\n" }));
    termInput.value = "";
    autoResizeInput();
  }
}

export function sendInput(data) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "stdin", data: data }));
  }
}

export function sendSignal(sig) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "signal", signal: sig }));
  }
}
