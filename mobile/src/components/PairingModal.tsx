import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { loadCredentials, saveCredentials, clearCredentials } from "../storage/credentials";
import { fetchHealth } from "../api/health";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPaired: () => void;
}

export const PairingModal: React.FC<Props> = ({ visible, onClose, onPaired }) => {
  const [hostUrl, setHostUrl] = useState("http://192.168.1.9:8000");
  const [token, setToken] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    if (visible) {
      loadCredentials().then((creds) => {
        if (creds) {
          setHostUrl(creds.hostUrl);
          setToken(creds.token);
        }
      });
    }
  }, [visible]);

  const handleBarcodeScanned = (scannedData: string) => {
    setShowCamera(false);
    try {
      if (scannedData.startsWith("gravitydesk://pair")) {
        const urlObj = new URL(scannedData);
        const hostParam = urlObj.searchParams.get("host");
        const tokenParam = urlObj.searchParams.get("token");
        if (hostParam && tokenParam) {
          const proto = hostParam.startsWith("http") ? "" : "http://";
          setHostUrl(`${proto}${hostParam}`);
          setToken(tokenParam);
          setStatusMsg("QR Code scanned! Testing connection...");
          autoConnect(`${proto}${hostParam}`, tokenParam);
        }
      } else if (scannedData.includes("token=")) {
        const urlObj = new URL(scannedData);
        const tokenParam = urlObj.searchParams.get("token");
        if (tokenParam) {
          setHostUrl(urlObj.origin);
          setToken(tokenParam);
          setStatusMsg("QR Code scanned! Testing connection...");
          autoConnect(urlObj.origin, tokenParam);
        }
      } else {
        setStatusMsg("Unrecognized QR code payload format.");
      }
    } catch (e) {
      setStatusMsg("Error parsing scanned QR code.");
    }
  };

  const autoConnect = async (host: string, secret: string) => {
    setIsTesting(true);
    try {
      const res = await fetchHealth(host, secret);
      if (res.status === "online") {
        await saveCredentials({ hostUrl: host, token: secret });
        setStatusMsg("Connected successfully! Credentials saved.");
        setTimeout(() => {
          onPaired();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setStatusMsg(`Connection failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestAndSave = async () => {
    if (!hostUrl.trim() || !token.trim()) {
      setStatusMsg("Please enter both Host URL and Token.");
      return;
    }
    await autoConnect(hostUrl.trim(), token.trim());
  };

  const handleClear = async () => {
    await clearCredentials();
    setToken("");
    setStatusMsg("Saved credentials cleared.");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Laptop Pairing</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.subtitle}>
              Scan the ASCII QR Code on your laptop terminal or enter IP & Token manually:
            </Text>

            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => {
                // Prompt or simulate camera scan fallback
                setStatusMsg("Camera QR scanning active. Point camera at laptop screen.");
                setShowCamera(true);
              }}
            >
              <Text style={styles.scanBtnText}>📷 Scan Terminal QR Code</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Laptop Host URL:</Text>
            <TextInput
              style={styles.input}
              value={hostUrl}
              onChangeText={setHostUrl}
              placeholder="e.g. http://100.x.y.z:8000"
              placeholderTextColor="#8b949e"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Pairing Token:</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="Paste 64-character 256-bit token"
              placeholderTextColor="#8b949e"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={false}
            />

            {statusMsg && (
              <Text
                style={[
                  styles.statusText,
                  statusMsg.includes("successfully") ? styles.statusSuccess : styles.statusError,
                ]}
              >
                {statusMsg}
              </Text>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleTestAndSave}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnTextPrimary}>Test & Connect</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClear}>
                <Text style={styles.btnTextDanger}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    color: "#8b949e",
  },
  body: {
    padding: 16,
    gap: 10,
  },
  subtitle: {
    fontSize: 12,
    color: "#8b949e",
    marginBottom: 4,
  },
  scanBtn: {
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#58a6ff",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 6,
  },
  scanBtnText: {
    fontSize: 13,
    color: "#58a6ff",
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c9d1d9",
  },
  input: {
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#ffffff",
    fontSize: 13,
  },
  statusText: {
    fontSize: 12,
    marginTop: 4,
  },
  statusSuccess: {
    color: "#3fb950",
  },
  statusError: {
    color: "#f85149",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#1f6feb",
  },
  btnTextPrimary: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  btnDanger: {
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    borderWidth: 1,
    borderColor: "#f85149",
    maxWidth: 80,
  },
  btnTextDanger: {
    color: "#f85149",
    fontWeight: "600",
    fontSize: 13,
  },
});
