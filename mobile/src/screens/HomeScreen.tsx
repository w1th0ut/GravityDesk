import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { HealthResponse } from "../types";
import { loadCredentials, saveCredentials, clearCredentials } from "../storage/credentials";
import { fetchHealth } from "../api/health";
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
  const [hostUrl, setHostUrl] = useState("http://100.90.147.12:8000");
  const [token, setToken] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadCredentials().then((creds) => {
      if (creds) {
        setHostUrl(creds.hostUrl);
        setToken(creds.token);
      }
    });
  }, []);

  const connectWithCredentials = async (host: string, secret: string) => {
    setIsTesting(true);
    setStatusMsg({ type: "info", text: "Menguji koneksi ke laptop..." });
    try {
      const res = await fetchHealth(host, secret);
      if (res.status === "online") {
        await saveCredentials({ hostUrl: host, token: secret });
        setStatusMsg({ type: "success", text: "Koneksi Berhasil! Kredensial tersimpan." });
        await onRefresh();
        onConnectionChanged();
      } else {
        setStatusMsg({ type: "error", text: "Host merespon tetapi status bukan online." });
      }
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Gagal terhubung ke ${host}. Pastikan Tailscale di HP & Laptop aktif, dan GUI server menyala.`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualSave = async () => {
    const trimmedHost = hostUrl.trim();
    const trimmedToken = token.trim();
    if (!trimmedHost || !trimmedToken) {
      setStatusMsg({ type: "error", text: "Mohon isi Host URL dan Pairing Token." });
      return;
    }
    await connectWithCredentials(trimmedHost, trimmedToken);
  };

  const handleClear = async () => {
    await clearCredentials();
    setToken("");
    setStatusMsg({ type: "info", text: "Kredensial pairing telah dihapus." });
    await onRefresh();
    onConnectionChanged();
  };

  const handleQRSuccess = async (scannedHost: string, scannedToken: string) => {
    setHostUrl(scannedHost);
    setToken(scannedToken);
    await connectWithCredentials(scannedHost, scannedToken);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ GravityDesk Control</Text>
        <Text style={styles.headerSubtitle}>Status Koneksi & Pairing Tailscale</Text>
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

        {isConnected && (
          <TouchableOpacity style={styles.terminalJumpBtn} onPress={onNavigateToTerminal}>
            <Text style={styles.terminalJumpText}>💻 Buka Terminal Sesi</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pairing & Scanner Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📱 Pairing Laptop & Mobile</Text>
        <Text style={styles.cardDesc}>
          Scan QR Code yang tampil di Desktop Control Center laptop Anda untuk menghubungkan secara instan:
        </Text>

        {/* Big Scan Button */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => setShowScanner(true)}>
          <Text style={styles.scanBtnText}>📷 Buka Scanner Kamera QR Code</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ATAU INPUT MANUAL</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Manual Inputs */}
        <View style={styles.formGroup}>
          <Text style={styles.inputLabel}>Laptop Host URL (Tailscale IP):</Text>
          <TextInput
            style={styles.input}
            value={hostUrl}
            onChangeText={setHostUrl}
            placeholder="http://100.x.y.z:8000"
            placeholderTextColor="#8b949e"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.inputLabel}>Auth Token (256-bit):</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste 64-karakter token hex"
            placeholderTextColor="#8b949e"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

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

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={handleManualSave}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>Simpan & Hubungkan</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClear}>
            <Text style={styles.btnDangerText}>Hapus</Text>
          </TouchableOpacity>
        </View>
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
  statusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
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
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  statusSubText: {
    fontSize: 12,
    color: "#8b949e",
    marginTop: 3,
    lineHeight: 16,
  },
  telemetryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#0d1117",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#21262d",
  },
  telemetryItem: {
    width: "48%",
  },
  telemetryLabel: {
    fontSize: 11,
    color: "#8b949e",
  },
  telemetryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#e6edf3",
    marginTop: 2,
  },
  terminalJumpBtn: {
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  terminalJumpText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  cardDesc: {
    fontSize: 12,
    color: "#8b949e",
    lineHeight: 18,
  },
  scanBtn: {
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#58a6ff",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  scanBtnText: {
    color: "#58a6ff",
    fontWeight: "700",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#30363d",
  },
  dividerText: {
    fontSize: 10,
    color: "#8b949e",
    fontWeight: "700",
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    color: "#c9d1d9",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 13,
  },
  feedbackBox: {
    padding: 10,
    borderRadius: 6,
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#1f6feb",
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  btnDanger: {
    width: 80,
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    borderWidth: 1,
    borderColor: "#f85149",
  },
  btnDangerText: {
    color: "#f85149",
    fontWeight: "600",
    fontSize: 13,
  },
});
