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
  const cleanBase = host.replace(/\/+$/, "");
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
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(txt || `Pairing failed (HTTP ${response.status})`);
  }

  return (await response.json()) as PairDeviceResult;
}

