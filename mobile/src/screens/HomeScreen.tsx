import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { HealthResponse } from "../types";
import {
  loadCredentials,
  saveCredentials,
  getOrCreateDeviceId,
  getDeviceName,
} from "../storage/credentials";
import { pairDeviceApi, refreshAntigravityUsageApi } from "../api/health";
import { QRScannerModal } from "../components/QRScannerModal";
import Svg, { Path } from "react-native-svg";

const RefreshIcon: React.FC<{ color?: string; size?: number }> = ({ color = "#8b949e", size = 15 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M23 4v6h-6"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M1 20v-6h6"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

function formatResetTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const resetTime = new Date(isoStr).getTime();
    const now = Date.now();
    const diffMs = resetTime - now;

    if (diffMs <= 0) {
      return "Resets shortly";
    }

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `Resets in ${hours}h ${minutes}m`;
    }
    return `Resets in ${minutes}m`;
  } catch {
    return "";
  }
}

function getBarColor(pct: number | null): string {
  if (pct === null) return "#8b949e";
  if (pct > 40) return "#3fb950";
  if (pct > 15) return "#d29922";
  return "#f85149";
}

interface Props {
  health: HealthResponse | null;
  isConnected: boolean;
  isChecking: boolean;
  onRefresh: () => Promise<void>;
  onNavigateToTerminal: () => void;
  onConnectionChanged: () => void;
  revocationNotice?: string | null;
  onDismissNotice?: () => void;
}

export const HomeScreen: React.FC<Props> = ({
  health,
  isConnected,
  isChecking,
  onRefresh,
  onNavigateToTerminal,
  onConnectionChanged,
  revocationNotice,
  onDismissNotice,
}) => {
  const [hostUrl, setHostUrl] = useState("");
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [isRefreshingAgy, setIsRefreshingAgy] = useState(false);

  const handleRefreshAgy = async () => {
    if (isRefreshingAgy) return;
    setIsRefreshingAgy(true);
    try {
      await refreshAntigravityUsageApi();
      setTimeout(async () => {
        await onRefresh();
        setIsRefreshingAgy(false);
      }, 5500);
    } catch {
      setIsRefreshingAgy(false);
    }
  };

  const syncCredentials = useCallback(async () => {
    const creds = await loadCredentials();
    if (creds && creds.token && creds.hostUrl) {
      setHostUrl(creds.hostUrl);
      setToken(creds.token);
      if (creds.deviceId) setDeviceId(creds.deviceId);
      if (creds.deviceName) setDeviceName(creds.deviceName);
    } else {
      setHostUrl("");
      setToken("");
    }
  }, []);

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
    setDeviceName(getDeviceName());
    syncCredentials();
  }, [syncCredentials]);

  useEffect(() => {
    syncCredentials();
    if (isConnected) {
      // Dismiss any revocation error once host is actively connected
      setStatusMsg(null);
      onDismissNotice?.();
    }
  }, [isConnected, syncCredentials, onDismissNotice]);

  useEffect(() => {
    if (revocationNotice) {
      setHostUrl("");
      setToken("");
      setStatusMsg({
        type: "error",
        text: revocationNotice,
      });
    }
  }, [revocationNotice]);


  const handleQRSuccess = async (scannedHost: string, scannedToken: string) => {
    setIsPairing(true);
    setStatusMsg({ type: "info", text: "Registering device to host..." });

    const currentDevId = deviceId || (await getOrCreateDeviceId());
    const currentDevName = deviceName || getDeviceName();

    try {
      // Register device with host daemon via pair endpoint
      await pairDeviceApi(scannedHost, scannedToken, currentDevId, currentDevName, "android");

      // Persist credentials
      await saveCredentials({
        hostUrl: scannedHost,
        token: scannedToken,
        deviceId: currentDevId,
        deviceName: currentDevName,
      });

      setHostUrl(scannedHost);
      setToken(scannedToken);
      setStatusMsg(null);
      onDismissNotice?.();

      await onRefresh();
      onConnectionChanged();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Pairing failed: ${err.message || "Ensure Tailscale is active and QR code is valid."}`,
      });
    } finally {
      setIsPairing(false);
    }
  };

  const isPaired = isConnected && !!token;
  const badgeText = isConnected ? "REGISTERED" : token ? "PAIRED" : "READY TO PAIR";
  const badgeColor = isConnected ? "#3fb950" : token ? "#d29922" : "#8b949e";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GravityDesk Control</Text>
        <Text style={styles.headerSubtitle}>Connection Status & Device Management</Text>
      </View>

      {/* Main Connection Status Section (Seamless) */}
      <View style={styles.section}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
          <View style={styles.statusTitleBox}>
            <Text style={styles.statusMainText}>
              {isConnected
                ? "Connected to Host"
                : isChecking
                ? "Checking Connection..."
                : "Host Offline / Disconnected"}
            </Text>
            <Text style={styles.statusSubText}>
              {isConnected
                ? `Host: ${health?.tailscale_ip || hostUrl}`
                : "Ensure Tailscale is active on both devices within the same tailnet."}
            </Text>
          </View>
        </View>

        {isConnected && health && (
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Host Battery</Text>
              <Text style={styles.telemetryValue}>
                {health.battery ? `${health.battery.percent}%${health.battery.is_charging ? " (Chg)" : ""}` : "--"}
              </Text>
            </View>

            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>CPU Load</Text>
              <Text style={styles.telemetryValue}>{health.cpu_percent}%</Text>
            </View>

            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Memory (RAM)</Text>
              <Text style={styles.telemetryValue}>{health.memory_percent}%</Text>
            </View>

            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Sleep Inhibit</Text>
              <Text
                style={[
                  styles.telemetryValue,
                  { color: health.sleep_inhibit_active ? "#3fb950" : "#8b949e" },
                ]}
              >
                {health.sleep_inhibit_active ? "Active" : "Disabled"}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Antigravity Engine & Usage Limits Section */}
      {isConnected && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Antigravity Engine</Text>
            <TouchableOpacity
              onPress={handleRefreshAgy}
              disabled={isRefreshingAgy}
              style={styles.refreshBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.6}
            >
              {isRefreshingAgy ? (
                <ActivityIndicator size="small" color="#58a6ff" style={{ transform: [{ scale: 0.75 }] }} />
              ) : (
                <RefreshIcon color="#8b949e" size={15} />
              )}
            </TouchableOpacity>
          </View>

          {/* Active Model */}
          <View style={styles.modelRow}>
            <Text style={styles.telemetryLabel}>Active Model</Text>
            <Text style={styles.modelNameText} numberOfLines={1}>
              {health?.antigravity?.model || "Gemini 3.8 Flash (High)"}
            </Text>
          </View>

          {/* Usage Limit Bars */}
          {health?.antigravity?.usage?.gemini && (
            <View style={styles.quotaContainer}>
              {/* 5-Hour Limit */}
              <View style={styles.quotaItem}>
                <View style={styles.quotaHeader}>
                  <Text style={styles.quotaTitle}>Gemini 5-Hour Session Limit</Text>
                  <Text
                    style={[
                      styles.quotaPercent,
                      { color: getBarColor(health.antigravity.usage.gemini.hourly_percent) },
                    ]}
                  >
                    {health.antigravity.usage.gemini.hourly_percent !== null
                      ? `${health.antigravity.usage.gemini.hourly_percent}%`
                      : "—"}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(0, Math.min(100, health.antigravity.usage.gemini.hourly_percent ?? 0))}%`,
                        backgroundColor: getBarColor(health.antigravity.usage.gemini.hourly_percent),
                      },
                    ]}
                  />
                </View>
                {health.antigravity.usage.gemini.hourly_reset && (
                  <Text style={styles.resetSubText}>
                    {formatResetTime(health.antigravity.usage.gemini.hourly_reset)}
                  </Text>
                )}
              </View>

              {/* Weekly Limit */}
              <View style={styles.quotaItem}>
                <View style={styles.quotaHeader}>
                  <Text style={styles.quotaTitle}>Gemini Weekly Quota Limit</Text>
                  <Text
                    style={[
                      styles.quotaPercent,
                      { color: getBarColor(health.antigravity.usage.gemini.weekly_percent) },
                    ]}
                  >
                    {health.antigravity.usage.gemini.weekly_percent !== null
                      ? `${health.antigravity.usage.gemini.weekly_percent}%`
                      : "—"}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(0, Math.min(100, health.antigravity.usage.gemini.weekly_percent ?? 0))}%`,
                        backgroundColor: getBarColor(health.antigravity.usage.gemini.weekly_percent),
                      },
                    ]}
                  />
                </View>
                {health.antigravity.usage.gemini.weekly_reset && (
                  <Text style={styles.resetSubText}>
                    {formatResetTime(health.antigravity.usage.gemini.weekly_reset)}
                  </Text>
                )}
              </View>

              {/* Secondary Claude/GPT overview if available */}
              {health.antigravity.usage.claude_gpt.hourly_percent !== null && (
                <View style={styles.claudeGptRow}>
                  <Text style={styles.claudeGptLabel}>Claude & GPT Models</Text>
                  <Text style={styles.claudeGptValue}>
                    {health.antigravity.usage.claude_gpt.hourly_percent}% (5h) · {health.antigravity.usage.claude_gpt.weekly_percent}% (weekly)
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Device Identity Section (Seamless, Last Section - No Bottom Divider) */}
      <View style={[styles.section, styles.sectionLast]}>
        <Text style={styles.sectionTitle}>Device Identity</Text>

        <View style={styles.deviceIdentityRow}>
          <View style={styles.deviceInfoText}>
            <Text style={styles.deviceNameText}>{deviceName || "Android Device"}</Text>
            <Text style={styles.deviceIdText}>
              Client ID: {deviceId ? `${deviceId.slice(0, 8)}...` : "Generating ID..."}
            </Text>
          </View>
          <View style={styles.deviceBadge}>
            <Text style={[styles.deviceBadgeText, { color: badgeColor }]}>
              {badgeText}
            </Text>
          </View>
        </View>

        {/* Scan Button: Hidden once device is registered/paired */}
        {!isPaired && (
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => setShowScanner(true)}
            disabled={isPairing}
            activeOpacity={0.8}
          >
            {isPairing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.scanBtnText}>Scan Pairing QR Code</Text>
            )}
          </TouchableOpacity>
        )}

        {statusMsg && (
          <TouchableOpacity
            style={[
              styles.feedbackBox,
              statusMsg.type === "success"
                ? styles.feedbackSuccess
                : statusMsg.type === "error"
                ? styles.feedbackError
                : styles.feedbackInfo,
            ]}
            onPress={() => {
              setStatusMsg(null);
              onDismissNotice?.();
            }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text
                style={[
                  styles.feedbackText,
                  statusMsg.type === "success"
                    ? styles.textSuccess
                    : statusMsg.type === "error"
                    ? styles.textError
                    : styles.textInfo,
                  { flex: 1, paddingRight: 8 },
                ]}
              >
                {statusMsg.text}
              </Text>
              <Text style={{ fontSize: 13, color: "#8b949e", fontWeight: "700" }}>✕</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* QR Scanner Modal (mounts only when requested) */}
      {showScanner && (
        <QRScannerModal
          visible={showScanner}
          onClose={() => setShowScanner(false)}
          onScanSuccess={handleQRSuccess}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141414",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8b949e",
    marginTop: 2,
  },
  section: {
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  sectionLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f0f6fc",
    letterSpacing: 0.2,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: "#3fb950",
  },
  dotOffline: {
    backgroundColor: "#f85149",
  },
  statusTitleBox: {
    flex: 1,
  },
  statusMainText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  statusSubText: {
    fontSize: 11,
    color: "#8b949e",
    marginTop: 2,
  },
  telemetryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  telemetryItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1e1e1e",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  telemetryLabel: {
    fontSize: 10,
    color: "#8b949e",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  telemetryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 2,
  },
  deviceIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 12,
  },
  deviceInfoText: {
    flex: 1,
  },
  deviceNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  deviceIdText: {
    fontSize: 11,
    color: "#58a6ff",
    fontFamily: "monospace",
    marginTop: 2,
  },
  deviceBadge: {
    justifyContent: "center",
  },
  deviceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#3fb950",
    letterSpacing: 0.5,
  },
  scanBtn: {
    backgroundColor: "#238636",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  feedbackBox: {
    padding: 10,
    borderRadius: 8,
  },
  feedbackSuccess: {
    backgroundColor: "rgba(63, 185, 80, 0.15)",
    borderColor: "#3fb950",
    borderWidth: 1,
  },
  feedbackError: {
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    borderColor: "#f85149",
    borderWidth: 1,
  },
  feedbackInfo: {
    backgroundColor: "rgba(88, 166, 255, 0.15)",
    borderColor: "#58a6ff",
    borderWidth: 1,
  },
  feedbackText: {
    fontSize: 12,
    lineHeight: 16,
  },
  textSuccess: {
    color: "#3fb950",
  },
  textError: {
    color: "#f85149",
  },
  textInfo: {
    color: "#58a6ff",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refreshBtn: {
    backgroundColor: "transparent",
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  modelRow: {
    paddingVertical: 2,
  },
  modelNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginTop: 2,
  },
  quotaContainer: {
    gap: 12,
    marginTop: 4,
  },
  quotaItem: {
    gap: 6,
  },
  quotaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quotaTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#c9d1d9",
  },
  quotaPercent: {
    fontSize: 13,
    fontWeight: "800",
  },
  barTrack: {
    height: 6,
    backgroundColor: "#262626",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  resetSubText: {
    fontSize: 10,
    color: "#8b949e",
    alignSelf: "flex-end",
  },
  claudeGptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  claudeGptLabel: {
    fontSize: 11,
    color: "#8b949e",
  },
  claudeGptValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#c9d1d9",
  },
});
