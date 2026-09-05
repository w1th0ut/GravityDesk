/**
 * Device Pairing & QR Code Detection
 */
import { state } from './state.js';
import { fetchVitals } from './vitals.js';
import { connectWS } from './ws.js';

export function getWebDeviceId() {
  let id = localStorage.getItem("gravitydesk_web_device_id");
  if (!id) {
    id = "web-" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("gravitydesk_web_device_id", id);
  }
  return id;
}

export function getWebDeviceName() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isMobile ? "Mobile Web Browser" : "Desktop Web Browser";
}

export async function registerWebDevice() {
  const devNameEl = document.getElementById("web-dev-name");
  const devIdEl = document.getElementById("web-dev-id");
  const devStatusEl = document.getElementById("web-dev-status");
  const did = getWebDeviceId();
  const dname = getWebDeviceName();
  if (devNameEl) devNameEl.innerText = dname;
  if (devIdEl) devIdEl.innerText = `ID: ${did.slice(0, 12)}...`;

  if (!state.token) {
    if (devStatusEl) {
      devStatusEl.innerText = "READY TO PAIR";
      devStatusEl.style.color = "var(--warning)";
    }
    return;
  }

  try {
    const res = await fetch(`/api/devices/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: did,
        device_name: dname,
        platform: "web",
        pair_token: state.token,
      }),
    });
    if (res.ok) {
      if (devStatusEl) {
        devStatusEl.innerText = "REGISTERED";
        devStatusEl.style.color = "var(--success)";
      }
      const clearBtn = document.getElementById("web-clear-btn");
      if (clearBtn) clearBtn.style.display = "block";
    }
  } catch (e) {
    console.warn("Device registration error:", e);
  }
}

export function clearWebPairing() {
  localStorage.removeItem("gravitydesk_web_device_id");
  state.token = "";
  const devStatusEl = document.getElementById("web-dev-status");
  if (devStatusEl) {
    devStatusEl.innerText = "READY TO PAIR";
    devStatusEl.style.color = "var(--warning)";
  }
  const clearBtn = document.getElementById("web-clear-btn");
  if (clearBtn) clearBtn.style.display = "none";
  if (state.ws) state.ws.close();
  fetchVitals();
}

export function triggerQrScan() {
  const fileInput = document.getElementById("qr-file-input");
  if (fileInput) fileInput.click();
}

export async function handleQrImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const img = await createImageBitmap(file);
      const barcodes = await detector.detect(img);
      if (barcodes.length > 0) {
        const rawUrl = barcodes[0].rawValue;
        if (rawUrl) {
          try {
            const urlObj = new URL(rawUrl, window.location.origin);
            const qToken = urlObj.searchParams.get("token");
            if (qToken) {
              state.token = qToken;
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.set("token", state.token);
              window.history.replaceState({}, "", currentUrl.toString());
              await registerWebDevice();
              connectWS();
              fetchVitals();
              alert("Pairing successful! Web device registered to host.");
              return;
            }
          } catch (err) {}
          window.location.href = rawUrl;
          return;
        }
      } else {
        alert("QR Code not detected. Please take a clearer photo.");
      }
    } catch (e) {
      alert("Failed to process QR Code: " + e.message);
    }
  } else {
    alert("Browser does not support automatic QR processing. Use Android app camera or open pairing URL directly.");
  }
}
