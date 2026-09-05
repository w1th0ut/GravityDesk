import { apiFetch } from "./client";
import { HealthResponse } from "../types";

/**
 * Pings laptop daemon for telemetry and online state
 */
export async function fetchHealth(customHost?: string, customToken?: string): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health", { method: "GET" }, customHost, customToken);
}

export interface PairDeviceResult {
  status: string;
  device: any;
  token: string;
}

/**
 * Registers device with host daemon via QR scan payload
 */
export async function pairDeviceApi(
  host: string,
  pairToken: string,
  deviceId: string,
  deviceName: string,
  platform: string = "android"
): Promise<PairDeviceResult> {
  const rawBase = (host || "").trim().replace(/\/+$/, "");
  const cleanBase = rawBase.startsWith("http") ? rawBase : `http://${rawBase}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${cleanBase}/api/devices/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        device_id: deviceId,
        device_name: deviceName,
        platform,
        pair_token: pairToken,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(txt || `Pairing failed (HTTP ${response.status})`);
    }

    return (await response.json()) as PairDeviceResult;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Connection timed out reaching ${cleanBase}. Make sure Tailscale is connected.`);
    }
    if (err.message && err.message.toLowerCase().includes("network request failed")) {
      throw new Error(`Cannot reach host (${cleanBase}). Ensure Tailscale VPN is CONNECTED on your phone.`);
    }
    throw err;
  }
}

