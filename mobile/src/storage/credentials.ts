import { ConnectionConfig } from "../types";

// In-memory cache for fast access
let cachedConfig: ConnectionConfig | null = null;

const STORAGE_KEYS = {
  HOST_URL: "gravitydesk_host_url",
  TOKEN: "gravitydesk_token",
};

/**
 * Retrieves saved credentials from storage (SecureStore or localStorage fallback)
 */
export async function loadCredentials(): Promise<ConnectionConfig | null> {
  if (cachedConfig) return cachedConfig;

  let hostUrl: string | null = null;
  let token: string | null = null;

  try {
    // Attempt Expo SecureStore dynamically
    const SecureStore = require("expo-secure-store");
    hostUrl = await SecureStore.getItemAsync(STORAGE_KEYS.HOST_URL);
    token = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
  } catch {
    // Fallback for Web / browser testing
    if (typeof window !== "undefined" && window.localStorage) {
      hostUrl = localStorage.getItem(STORAGE_KEYS.HOST_URL);
      token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    }
  }

  // Fallback defaults if URL query params exist
  if (typeof window !== "undefined" && window.location) {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token");
    if (queryToken) token = queryToken;
    if (!hostUrl) hostUrl = `${window.location.protocol}//${window.location.host}`;
  }

  if (hostUrl && token) {
    cachedConfig = { hostUrl, token };
    return cachedConfig;
  }

  return null;
}

/**
 * Persists pairing credentials securely
 */
export async function saveCredentials(config: ConnectionConfig): Promise<void> {
  cachedConfig = config;

  try {
    const SecureStore = require("expo-secure-store");
    await SecureStore.setItemAsync(STORAGE_KEYS.HOST_URL, config.hostUrl);
    await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, config.token);
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(STORAGE_KEYS.HOST_URL, config.hostUrl);
      localStorage.setItem(STORAGE_KEYS.TOKEN, config.token);
    }
  }
}

/**
 * Clears stored credentials
 */
export async function clearCredentials(): Promise<void> {
  cachedConfig = null;
  try {
    const SecureStore = require("expo-secure-store");
    await SecureStore.deleteItemAsync(STORAGE_KEYS.HOST_URL);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(STORAGE_KEYS.HOST_URL);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  }
}
