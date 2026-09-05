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
import { pairDeviceApi } from "../api/health";
import { QRScannerModal } from "../components/QRScannerModal";

interface Props {
  health: HealthResponse | null;
  isConnected: boolean;
  isChecking: boolean;
  onRefresh: () => Promise<void>;
  onNavigateToTerminal: () => void;
  onConnectionChanged: () => void;
  revocationCount?: number;
}

export const HomeScreen: React.FC<Props> = ({
  health,
  isConnected,
  isChecking,
  onRefresh,
  onNavigateToTerminal,
  onConnectionChanged,
  revocationCount,
}) => {
  const [hostUrl, setHostUrl] = useState("");
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

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
  }, [isConnected, syncCredentials]);

  useEffect(() => {
    if (revocationCount && revocationCount > 0) {
      setHostUrl("");
      setToken("");
      setStatusMsg({
        type: "error",
        text: "Device access has been revoked by the host. Please scan the pairing QR code to reconnect.",
      });
    }
  }, [revocationCount]);


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
      setStatusMsg({
        type: "success",
        text: `Device '${currentDevName}' registered & connected!`,
      });

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
                ? "Connected to Host (Tailscale Online)"
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
          <View
            style={[
              styles.feedbackBox,
              statusMsg.type === "success"
                ? styles.feedbackSuccess
                : statusMsg.type === "error"
                ? styles.feedbackError
                : styles.feedbackInfo,
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                statusMsg.type === "success"
                  ? styles.textSuccess
                  : statusMsg.type === "error"
                  ? styles.textError
                  : styles.textInfo,
              ]}
            >
              {statusMsg.text}
            </Text>
          </View>
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
    backgroundColor: "#1e1e1e",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
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
});
