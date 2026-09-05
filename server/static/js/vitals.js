/**
 * System Vitals & Host Status Polling
 */
import { state } from './state.js';
import { getWebDeviceId } from './pairing.js';
import { updateFolderLabel } from './terminal.js';

export function setTerminalActiveState(isOnline) {
  const inactiveEl = document.getElementById("terminal-inactive");
  const activeContent = document.getElementById("terminal-active-content");
  if (!inactiveEl || !activeContent) return;
  if (isOnline) {
    inactiveEl.style.display = "none";
    activeContent.style.display = "flex";
  } else {
    inactiveEl.style.display = "flex";
    activeContent.style.display = "none";
  }
}

export function updateSessionBtnState(running) {
  state.isSessionRunning = running;
  const btn = document.getElementById("session-btn");
  if (!btn) return;
  if (running) {
    btn.innerText = "Stop agy";
    btn.style.color = "var(--danger)";
    btn.style.borderColor = "rgba(248, 81, 73, 0.4)";
  } else {
    btn.innerText = "Start agy";
    btn.style.color = "#ffffff";
    btn.style.borderColor = "var(--accent)";
  }
}

export async function fetchVitals() {
  try {
    const devId = getWebDeviceId();
    const res = await fetch(`/api/health?token=${state.token}`, {
      headers: { "X-Device-Id": devId }
    });
    if (res.ok) {
      const d = await res.json();
      setTerminalActiveState(d.status === "online");

      // Terminal bar vitals (if present in DOM)
      const vCpu = document.getElementById("v-cpu");
      if (vCpu) vCpu.innerText = `${d.cpu_percent}%`;
      const vRam = document.getElementById("v-ram");
      if (vRam && d.memory_percent !== undefined) {
        vRam.innerText = `${d.memory_percent}%`;
      }
      const vBat = document.getElementById("v-bat");
      if (vBat) {
        vBat.innerText = d.battery ? `${d.battery.is_charging ? "Chg " : ""}${d.battery.percent}%` : "AC";
      }

      // Home dashboard vitals
      const homeBat = document.getElementById("home-v-bat");
      if (homeBat) {
        homeBat.innerText = d.battery ? `${d.battery.is_charging ? "Charging " : ""}${d.battery.percent}%` : "AC Power";
      }
      const homeCpu = document.getElementById("home-v-cpu");
      if (homeCpu) homeCpu.innerText = `${d.cpu_percent}%`;
      const homeRam = document.getElementById("home-v-ram");
      if (homeRam) homeRam.innerText = d.memory_percent !== undefined ? `${d.memory_percent}%` : "--";
      const homeSleep = document.getElementById("home-v-sleep");
      if (homeSleep) homeSleep.innerText = d.sleep_inhibit_active ? "Active" : "Disabled";
      const homeStatusTitle = document.getElementById("home-status-title");
      if (homeStatusTitle) homeStatusTitle.innerText = "Connected to Host (Tailscale Online)";
      const homeStatusSub = document.getElementById("home-status-sub");
      if (homeStatusSub) homeStatusSub.innerText = `Host: ${d.tailscale_ip || window.location.host}`;
      const homeDot = document.getElementById("home-status-dot");
      if (homeDot) homeDot.className = "status-dot online";

      if (d.active_session) {
        updateSessionBtnState(d.active_session.is_alive === true);
      }
      const clearBtn = document.getElementById("web-clear-btn");
      if (clearBtn && d.status === "online") {
        clearBtn.style.display = "block";
      }

      if (d.active_session && d.active_session.cwd && !state.activePath) {
        state.activePath = d.active_session.cwd;
        updateFolderLabel(state.activePath);
      }
    } else {
      setTerminalActiveState(false);
      if (res.status === 403) {
        const devStatusEl = document.getElementById("web-dev-status");
        if (devStatusEl) {
          devStatusEl.innerText = "REVOKED";
          devStatusEl.style.color = "var(--danger)";
        }
      }
    }
  } catch (err) {
    setTerminalActiveState(false);
    const homeDot = document.getElementById("home-status-dot");
    if (homeDot) homeDot.className = "status-dot";
    const homeStatusTitle = document.getElementById("home-status-title");
    if (homeStatusTitle) homeStatusTitle.innerText = "Host Disconnected / Checking...";
  }
}
