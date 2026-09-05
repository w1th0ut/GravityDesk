/**
 * WebSocket Terminal Stream Lifecycle
 */
import { state } from './state.js';
import { getWebDeviceId } from './pairing.js';
import { setTerminalActiveState, updateSessionBtnState } from './vitals.js';
import { processIncomingData } from './terminal.js';

export function connectWS() {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const devId = getWebDeviceId();
  const wsUrl = `${proto}//${loc.host}/ws/terminal?token=${state.token}&device_id=${encodeURIComponent(devId)}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    const statusDot = document.getElementById("status-dot");
    if (statusDot) statusDot.className = "status-dot online";
    setTerminalActiveState(true);
    state.ws.send(JSON.stringify({ type: "subscribe", last_seq: state.currentSeq }));
  };

  state.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "revoked") {
      setTerminalActiveState(false);
      const devStatusEl = document.getElementById("web-dev-status");
      if (devStatusEl) {
        devStatusEl.innerText = "REVOKED";
        devStatusEl.style.color = "var(--danger)";
      }
      return;
    }
    if (msg.type === "status") {
      updateSessionBtnState(msg.state === "RUNNING");
    }
    if (msg.type === "output") {
      const sendBtn = document.getElementById("send-btn");
      if (sendBtn && sendBtn.innerText === "Thinking...") {
        sendBtn.innerText = "Send";
        sendBtn.disabled = false;
      }
      if (msg.seq <= state.currentSeq) return;
      state.currentSeq = msg.seq;
      processIncomingData(msg.data);
    }
  };

  state.ws.onclose = (event) => {
    const statusDot = document.getElementById("status-dot");
    if (statusDot) statusDot.className = "status-dot";
    setTerminalActiveState(false);
    if (event && event.code === 4001) {
      const devStatusEl = document.getElementById("web-dev-status");
      if (devStatusEl) {
        devStatusEl.innerText = "REVOKED";
        devStatusEl.style.color = "var(--danger)";
      }
      return;
    }
    setTimeout(connectWS, 2000);
  };

  state.ws.onerror = () => {
    setTerminalActiveState(false);
    if (state.ws) state.ws.close();
  };
}
