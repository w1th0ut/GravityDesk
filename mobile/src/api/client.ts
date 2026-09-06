import { loadCredentials } from "../storage/credentials";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Robust fetch wrapper appending authentication token and handling timeouts
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  customHost?: string,
  customToken?: string
): Promise<T> {
  const creds = await loadCredentials();
  const rawBase = customHost || creds?.hostUrl || "http://127.0.0.1:8000";
  const token = customToken || creds?.token || "";

  // Normalize URL with valid protocol
  let normalizedBase = rawBase.trim();
  if (!normalizedBase.startsWith("http://") && !normalizedBase.startsWith("https://")) {
    normalizedBase = `http://${normalizedBase}`;
  }
  const cleanBase = normalizedBase.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const urlObj = new URL(`${cleanBase}${cleanEndpoint}`);

  if (token && !urlObj.searchParams.has("token")) {
    urlObj.searchParams.set("token", token);
  }

  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (creds?.deviceId) {
    headers.set("X-Device-Id", creds.deviceId);
  }

  const controller = new AbortController();
  const timeoutMs = (options as any)?.timeoutMs || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlObj.toString(), {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText || `HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new ApiError(408, "Request timed out connecting to laptop");
    }
    throw err;
  }
}
