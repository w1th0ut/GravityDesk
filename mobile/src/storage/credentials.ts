import { Platform } from "react-native";
import { ConnectionConfig } from "../types";

// In-memory cache for fast access
let cachedConfig: ConnectionConfig | null = null;
let cachedDeviceId: string | null = null;
let cachedDeviceName: string | null = null;

const STORAGE_KEYS = {
  HOST_URL: "gravitydesk_host_url",
  TOKEN: "gravitydesk_token",
  DEVICE_ID: "gravitydesk_device_id",
  DEVICE_NAME: "gravitydesk_device_name",
};

/**
 * Generates a standard RFC4122 v4 UUID
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Resolves a human-readable device name from Android/iOS platform constants
 */
export function getDeviceName(): string {
  if (cachedDeviceName) return cachedDeviceName;

  if (Platform.OS === "android") {
    const constants: any = Platform.constants || {};
    const brand = constants.Brand || constants.Manufacturer || "";
    const model = constants.Model || "";
    if (brand || model) {
      cachedDeviceName = `${brand} ${model}`.trim();
      return cachedDeviceName;
    }
    cachedDeviceName = "Android Device";
    return cachedDeviceName;
  }
  if (Platform.OS === "ios") {
    cachedDeviceName = "iOS Device";
    return cachedDeviceName;
  }
  cachedDeviceName = "Web Client";
  return cachedDeviceName;
}

/**
 * Gets or creates a persistent unique hardware ID for this client
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let deviceId: string | null = null;
  try {
    const SecureStore = require("expo-secure-store");
    deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateUUID();
      await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
        deviceId = generateUUID();
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
    }
  }

  if (!deviceId) {
    deviceId = generateUUID();
  }

  cachedDeviceId = deviceId;
  return deviceId;
}

/**
 * Retrieves saved credentials from storage (SecureStore or localStorage fallback)
 */
export async function loadCredentials(): Promise<ConnectionConfig | null> {
  if (cachedConfig) return cachedConfig;

  let hostUrl: string | null = null;
  let token: string | null = null;
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();

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
    cachedConfig = { hostUrl, token, deviceId, deviceName };
    return cachedConfig;
  }

  return null;
}

/**
 * Persists pairing credentials securely
 */
export async function saveCredentials(config: ConnectionConfig): Promise<void> {
  const deviceId = config.deviceId || (await getOrCreateDeviceId());
  const deviceName = config.deviceName || getDeviceName();
  cachedConfig = { ...config, deviceId, deviceName };

  try {
    const SecureStore = require("expo-secure-store");
    await SecureStore.setItemAsync(STORAGE_KEYS.HOST_URL, config.hostUrl);
    await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, config.token);
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId);
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_NAME, deviceName);
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(STORAGE_KEYS.HOST_URL, config.hostUrl);
      localStorage.setItem(STORAGE_KEYS.TOKEN, config.token);
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, deviceName);
    }
  }
}

/**
 * Clears stored connection credentials while retaining persistent Device ID
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
