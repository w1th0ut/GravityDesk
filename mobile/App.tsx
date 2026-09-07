import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import Svg, { Path, Polyline, Line } from "react-native-svg";
import { useLaptopVitals } from "./src/hooks/useLaptopVitals";
import { useTerminalSocket } from "./src/hooks/useTerminalSocket";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TerminalScreen } from "./src/screens/TerminalScreen";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { clearCredentials } from "./src/storage/credentials";

type TabKey = "home" | "terminal";

const HomeNavIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Polyline
      points="9 22 9 12 15 12 15 22"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const TerminalNavIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Polyline
      points="4 17 10 11 4 5"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Line
      x1="12"
      y1="19"
      x2="20"
      y2="19"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>("home");
  const [revocationNotice, setRevocationNotice] = useState<string | null>(null);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleRevocation = useCallback(async () => {
    await clearCredentials();
    setCurrentTab("home");
    setRevocationNotice("Device access has been revoked by the host. Please scan the pairing QR code to reconnect.");
  }, []);

  const { health, isConnected, isChecking, refresh } = useLaptopVitals(3000, handleRevocation);
  const {
    logs,
    isWsConnected,
    isSessionRunning: wsSessionRunning,
    sendInput,
    sendSignal,
    clearLogs,
    reconnect,
  } = useTerminalSocket(50, handleRevocation);

  const handleConnectionChanged = () => {
    setRevocationNotice(null);
    refresh();
    reconnect();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0c0c0c" />

      <ErrorBoundary>
        {/* Screen Content - keep both mounted to preserve active state & avoid tab switch flicker */}
        <View style={styles.mainContent}>
          <View style={[styles.screenContainer, currentTab !== "home" && styles.hiddenScreen]}>
            <HomeScreen
              health={health}
              isConnected={isConnected}
              isChecking={isChecking}
              onRefresh={refresh}
              onNavigateToTerminal={() => setCurrentTab("terminal")}
              onConnectionChanged={handleConnectionChanged}
              revocationNotice={revocationNotice}
              onDismissNotice={() => setRevocationNotice(null)}
            />
          </View>

          <View style={[styles.screenContainer, currentTab !== "terminal" && styles.hiddenScreen]}>
            <TerminalScreen
              health={health}
              isConnected={isConnected}
              logs={logs}
              isWsConnected={isWsConnected}
              wsSessionRunning={wsSessionRunning}
              sendInput={sendInput}
              sendSignal={sendSignal}
              clearLogs={clearLogs}
              refreshVitals={refresh}
            />
          </View>
        </View>

        {/* Floating Capsule Bottom Navigation Bar (Hidden when keyboard is active) */}
        {!isKeyboardVisible && (
          <View style={styles.floatingNavContainer} pointerEvents="box-none">
            <View style={styles.capsuleNav}>
              {/* Tab 1: Home */}
              <TouchableOpacity
                style={[styles.capsuleItem, currentTab === "home" && styles.capsuleItemActive]}
                onPress={() => setCurrentTab("home")}
                activeOpacity={0.8}
              >
                <HomeNavIcon color={currentTab === "home" ? "#ffffff" : "#888888"} size={18} />
                {currentTab === "home" && (
                  <Text style={styles.capsuleLabelActive}>Home</Text>
                )}
              </TouchableOpacity>

              {/* Tab 2: Terminal */}
              <TouchableOpacity
                style={[styles.capsuleItem, currentTab === "terminal" && styles.capsuleItemActive]}
                onPress={() => setCurrentTab("terminal")}
                activeOpacity={0.8}
              >
                <TerminalNavIcon color={currentTab === "terminal" ? "#ffffff" : "#888888"} size={18} />
                {currentTab === "terminal" && (
                  <Text style={styles.capsuleLabelActive}>Terminal</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  mainContent: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  screenContainer: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  hiddenScreen: {
    display: "none",
  },
  floatingNavContainer: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  capsuleNav: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 40,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.75,
    shadowRadius: 16,
    elevation: 12,
  },
  capsuleItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: "transparent",
    gap: 0,
  },
  capsuleItemActive: {
    backgroundColor: "#252528",
    paddingHorizontal: 18,
    gap: 8,
  },
  capsuleLabelActive: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    marginLeft: 8,
  },
});
