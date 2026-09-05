import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { useLaptopVitals } from "./src/hooks/useLaptopVitals";
import { useTerminalSocket } from "./src/hooks/useTerminalSocket";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TerminalScreen } from "./src/screens/TerminalScreen";

type TabKey = "home" | "terminal";

export default function App() {
  const { health, isConnected, isChecking, refresh } = useLaptopVitals(3000);
  const {
    logs,
    isWsConnected,
    isSessionRunning: wsSessionRunning,
    sendInput,
    sendSignal,
    clearLogs,
    reconnect,
  } = useTerminalSocket(50);

  const [currentTab, setCurrentTab] = useState<TabKey>("home");

  const handleConnectionChanged = () => {
    refresh();
    reconnect();
  };

  const isSessionRunning =
    wsSessionRunning || (health?.active_session?.is_alive ?? false);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0c0c0c" />

      {/* Screen Content */}
      <View style={styles.mainContent}>
        {currentTab === "home" ? (
          <HomeScreen
            health={health}
            isConnected={isConnected}
            isChecking={isChecking}
            onRefresh={refresh}
            onNavigateToTerminal={() => setCurrentTab("terminal")}
            onConnectionChanged={handleConnectionChanged}
          />
        ) : (
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
        )}
      </View>

      {/* Floating Capsule Bottom Navigation Bar (Matching Reference Image) */}
      <View style={styles.floatingNavContainer} pointerEvents="box-none">
        <View style={styles.capsuleNav}>
          {/* Tab 1: Home */}
          <TouchableOpacity
            style={[styles.capsuleItem, currentTab === "home" && styles.capsuleItemActive]}
            onPress={() => setCurrentTab("home")}
            activeOpacity={0.8}
          >
            <View style={styles.tabIconBox}>
              <Text style={[styles.capsuleIcon, currentTab === "home" && styles.capsuleIconActive]}>🏠</Text>
              <View
                style={[
                  styles.navBadgeDot,
                  isConnected ? styles.dotOnline : styles.dotOffline,
                ]}
              />
            </View>
            {currentTab === "home" && (
              <Text style={styles.capsuleLabel}>Home</Text>
            )}
          </TouchableOpacity>

          {/* Tab 2: Terminal */}
          <TouchableOpacity
            style={[styles.capsuleItem, currentTab === "terminal" && styles.capsuleItemActive]}
            onPress={() => setCurrentTab("terminal")}
            activeOpacity={0.8}
          >
            <View style={styles.tabIconBox}>
              <Text style={[styles.capsuleIcon, currentTab === "terminal" && styles.capsuleIconActive]}>💻</Text>
              {isSessionRunning && (
                <View style={[styles.navBadgeDot, styles.dotRunning]} />
              )}
            </View>
            {currentTab === "terminal" && (
              <Text style={styles.capsuleLabel}>Terminal</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 12,
  },
  capsuleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: "transparent",
  },
  capsuleItemActive: {
    backgroundColor: "#252528",
    paddingHorizontal: 18,
    gap: 8,
  },
  capsuleIcon: {
    fontSize: 16,
    opacity: 0.6,
  },
  capsuleIconActive: {
    opacity: 1,
  },
  capsuleLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  tabIconBox: {
    position: "relative",
  },
  navBadgeDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotOnline: {
    backgroundColor: "#3fb950",
  },
  dotOffline: {
    backgroundColor: "#f85149",
  },
  dotRunning: {
    backgroundColor: "#58a6ff",
  },
});
