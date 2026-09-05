import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (host: string, token: string) => void;
}

export const QRScannerModal: React.FC<Props> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScanError(null);

    try {
      let host = "";
      let token = "";

      const raw = data.trim();

      // 1. Direct regex match for standard http(s) URL with token query
      const httpMatch = raw.match(/^(https?:\/\/[^\/?#]+)/i);
      const tokenMatch = raw.match(/[?&]token=([^&#]+)/i);

      if (httpMatch && tokenMatch) {
        host = httpMatch[1];
        token = decodeURIComponent(tokenMatch[1]);
      }

      // 2. Custom app scheme gravitydesk://pair?host=...&token=...
      if (!host || !token) {
        if (raw.startsWith("gravitydesk://pair")) {
          const hostMatch = raw.match(/[?&]host=([^&#]+)/i);
          if (hostMatch && tokenMatch) {
            const parsedHost = decodeURIComponent(hostMatch[1]);
            host = parsedHost.startsWith("http") ? parsedHost : `http://${parsedHost}`;
            token = decodeURIComponent(tokenMatch[1]);
          }
        }
      }

      // 3. Fallback to URL constructor
      if (!host || !token) {
        try {
          const urlObj = new URL(raw);
          const qToken = urlObj.searchParams.get("token");
          if (qToken) {
            token = qToken;
            const proto = urlObj.protocol || "http:";
            const hostPort = urlObj.host || `${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ""}`;
            if (hostPort) {
              host = `${proto}//${hostPort}`;
            }
          }
        } catch (_) {}
      }

      // Ensure host is fully qualified
      if (host && !host.startsWith("http")) {
        host = `http://${host}`;
      }

      if (host && token) {
        onScanSuccess(host, token);
        onClose();
      } else {
        setScanError("Unrecognized QR Code format.");
        setTimeout(() => setScanned(false), 2000);
      }
    } catch (err) {
      setScanError("Failed to read QR Code payload.");
      setTimeout(() => setScanned(false), 2000);
    }
  };

  const handleModalClose = () => {
    setScanned(false);
    setScanError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleModalClose}
    >
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#58a6ff" />
            <Text style={styles.infoText}>Checking camera permissions...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerBox}>
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionDesc}>
              GravityDesk requires camera access to scan the pairing QR code from your desktop screen.
            </Text>
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={requestPermission}
            >
              <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleModalClose}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={StyleSheet.absoluteFillObject}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Overlay Viewfinder */}
            <View style={styles.overlay}>
              {/* Top Bar */}
              <View style={styles.topBar}>
                <Text style={styles.headerTitle}>Scan Host QR Code</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={handleModalClose}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Viewfinder Target Box */}
              <View style={styles.targetContainer}>
                <View style={styles.targetBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </View>

              {/* Instruction Banner */}
              <View style={styles.instructionBox}>
                <Text style={styles.instructionText}>
                  Point camera at the QR code displayed on your Desktop Control Center
                </Text>
                {scanError && (
                  <Text style={styles.errorText}>{scanError}</Text>
                )}
                {scanned && !scanError && (
                  <Text style={styles.successText}>QR Code detected! Connecting...</Text>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0d1117",
  },
  infoText: {
    color: "#8b949e",
    marginTop: 12,
    fontSize: 14,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: "#8b949e",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  grantBtn: {
    backgroundColor: "#1f6feb",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  grantBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: "#8b949e",
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(13, 17, 23, 0.85)",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  targetContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  targetBox: {
    width: 260,
    height: 260,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#58a6ff",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  instructionBox: {
    paddingHorizontal: 20,
    paddingBottom: 50,
    paddingTop: 16,
    backgroundColor: "rgba(13, 17, 23, 0.85)",
    alignItems: "center",
  },
  instructionText: {
    color: "#c9d1d9",
    fontSize: 13,
    textAlign: "center",
  },
  errorText: {
    color: "#f85149",
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  successText: {
    color: "#3fb950",
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
  },
});
