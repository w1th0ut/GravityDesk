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

      if (data.startsWith("gravitydesk://pair")) {
        const urlObj = new URL(data);
        const hostParam = urlObj.searchParams.get("host");
        const tokenParam = urlObj.searchParams.get("token");
        if (hostParam && tokenParam) {
          const proto = hostParam.startsWith("http") ? "" : "http://";
          host = `${proto}${hostParam}`;
          token = tokenParam;
        }
      } else if (data.includes("token=")) {
        const urlObj = new URL(data);
        const tokenParam = urlObj.searchParams.get("token");
        if (tokenParam) {
          host = urlObj.origin;
          token = tokenParam;
        }
      }

      if (host && token) {
        onScanSuccess(host, token);
        onClose();
      } else {
        setScanError("Format QR Code tidak dikenali.");
        setTimeout(() => setScanned(false), 2000);
      }
    } catch (err) {
      setScanError("Gagal membaca payload QR Code.");
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
            <Text style={styles.infoText}>Memeriksa izin kamera...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerBox}>
            <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
            <Text style={styles.permissionDesc}>
              Aplikasi memerlukan izin akses kamera untuk memindai QR Code di layar laptop.
            </Text>
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={requestPermission}
            >
              <Text style={styles.grantBtnText}>Berikan Izin Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleModalClose}
            >
              <Text style={styles.cancelBtnText}>Batal</Text>
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
                <Text style={styles.headerTitle}>Scan QR Code Laptop</Text>
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
                  Arahkan kamera ke QR Code di Desktop Control Center / Terminal Laptop
                </Text>
                {scanError && (
                  <Text style={styles.errorText}>{scanError}</Text>
                )}
                {scanned && !scanError && (
                  <Text style={styles.successText}>QR Code Terdeteksi! Menghubungkan...</Text>
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
