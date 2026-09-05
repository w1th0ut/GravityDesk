import React, { useState, useEffect } from "react";
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
  clearCredentials,
  getOrCreateDeviceId,
  getDeviceName,
} from "../storage/credentials";
import { fetchHealth, pairDeviceApi } from "../api/health";
import { QRScannerModal } from "../components/QRScannerModal";

interface Props {
  health: HealthResponse | null;
  isConnected: boolean;
  isChecking: boolean;
  onRefresh: () => Promise<void>;
  onNavigateToTerminal: () => void;
  onConnectionChanged: () => void;
}

export const HomeScreen: React.FC<Props> = ({
  health,
  isConnected,
  isChecking,
  onRefresh,
  onNavigateToTerminal,
  onConnectionChanged,
}) => {
  const [hostUrl, setHostUrl] = useState("");
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId().then(setDeviceId);
    setDeviceName(getDeviceName());

    loadCredentials().then((creds) => {
      if (creds) {
        setHostUrl(creds.hostUrl);
        setToken(creds.token);
        if (creds.deviceId) setDeviceId(creds.deviceId);
        if (creds.deviceName) setDeviceName(creds.deviceName);
      }
    });
  }, []);

  const handleClear = async () => {
    await clearCredentials();
    setHostUrl("");
    setToken("");
    setStatusMsg({ type: "info", text: "Koneksi pairing telah diputus." });
    await onRefresh();
    onConnectionChanged();
  };

  const handleQRSuccess = async (scannedHost: string, scannedToken: string) => {
    setIsPairing(true);
    setStatusMsg({ type: "info", text: "Mendaftarkan perangkat ke laptop..." });

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
        text: `Perangkat '${currentDevName}' berhasil terdaftar & tersambung!`,
      });

      await onRefresh();
      onConnectionChanged();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Gagal pairing: ${err.message || "Pastikan Tailscale aktif dan QR code masih berlaku."}`,
      });
    } finally {
      setIsPairing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ GravityDesk Control</Text>
        <Text style={styles.headerSubtitle}>Status Koneksi & Manajemen Perangkat</Text>
      </View>

      {/* Main Connection Status Card */}
      <View style={styles.card}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusDot, isConnected ? styles.dotOnline : styles.dotOffline]} />
          <View style={styles.statusTitleBox}>
            <Text style={styles.statusMainText}>
              {isConnected
                ? "Terhubung ke Laptop (Tailscale Online)"
                : isChecking
                ? "Memeriksa Koneksi..."
                : "Laptop Offline / Disconnected"}
            </Text>
            <Text style={styles.statusSubText}>
              {isConnected
                ? `Host: ${health?.tailscale_ip || hostUrl}`
                : "Pastikan Tailscale di HP & Laptop aktif pada tailnet yang sama."}
            </Text>
          </View>
        </View>

        {isConnected && health && (
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>Baterai Laptop</Text>
              <Text style={styles.telemetryValue}>
                {health.battery ? `${health.battery.is_charging ? "⚡ " : "🔋 "}${health.battery.percent}%` : "--"}
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
              <Text style={[styles.telemetryValue, { color: "#3fb950" }]}>
                {health.sleep_inhibit_active ? "🛡️ Aktif" : "Nonaktif"}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Device Identity & Zero-Input QR Pairing Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📱 Identitas Perangkat Ini</Text>

        <View style={styles.deviceIdentityBox}>
          <Text style={styles.deviceIcon}>📱</Text>
          <View style={styles.deviceInfoText}>
            <Text style={styles.deviceNameText}>{deviceName || "Perangkat Android"}</Text>
            <Text style={styles.deviceIdText}>
              ID Klien: {deviceId ? `${deviceId.slice(0, 8)}...` : "Menghasilkan ID..."}
            </Text>
          </View>
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceBadgeText}>{isConnected ? "TERDAFTAR" : "SIAP PAIR"}</Text>
          </View>
        </View>

        <Text style={styles.cardDesc}>
          Scan QR Code di Desktop GUI laptop Anda untuk pairing otomatis tanpa perlu mengetik Host URL atau Token manual.
        </Text>

        {/* Big Scan Button */}
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setShowScanner(true)}
          disabled={isPairing}
        >
          {isPairing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.scanBtnText}>📷 Scan QR Code Pairing</Text>
          )}
        </TouchableOpacity>

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

        {isConnected && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>🗑️ Putuskan / Reset Pairing Perangkat Ini</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleQRSuccess}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  content: {
    padding: 14,
    paddingBottom: 28,
    gap: 14,
  },
  header: {
    paddingVertical: 8,
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
  card: {
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f0f6fc",
  },
  cardDesc: {
    fontSize: 12,
    color: "#8b949e",
    lineHeight: 18,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#21262d",
    paddingTop: 12,
  },
  telemetryItem: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#0d1117",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#21262d",
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
  deviceIdentityBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d1117",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#21262d",
    gap: 12,
  },
  deviceIcon: {
    fontSize: 24,
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
    backgroundColor: "#21262d",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  deviceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3fb950",
  },
  scanBtn: {
    backgroundColor: "#238636",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  clearBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248, 81, 73, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 81, 73, 0.4)",
    marginTop: 4,
  },
  clearBtnText: {
    color: "#f85149",
    fontWeight: "600",
    fontSize: 12,
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
