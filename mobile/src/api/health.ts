import { apiFetch } from "./client";
import { HealthResponse } from "../types";

/**
 * Pings laptop daemon for telemetry and online state
 */
export async function fetchHealth(customHost?: string, customToken?: string): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health", { method: "GET" }, customHost, customToken);
}
