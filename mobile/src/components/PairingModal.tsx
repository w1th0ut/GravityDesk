import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
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

  const handleTestAndSave = async () => {
    if (!hostUrl.trim() || !token.trim()) {
      setStatusMsg("Please enter both Host URL and Token.");
      return;
    }

    setIsTesting(true);
    setStatusMsg(null);

    try {
      // Test credentials against remote host
      const res = await fetchHealth(hostUrl.trim(), token.trim());
      if (res.status === "online") {
        await saveCredentials({
          hostUrl: hostUrl.trim(),
          token: token.trim(),
        });
        setStatusMsg("Connected successfully! Credentials saved.");
        setTimeout(() => {
          onPaired();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setStatusMsg(`Connection failed: ${err.message || "Invalid host or token"}`);
    } finally {
      setIsTesting(false);
    }
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
              Enter your Laptop's Tailscale IP & Pairing Token (shown in your laptop terminal startup):
            </Text>

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
              placeholder="Paste 32-character token"
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
