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

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={[styles.navTab, currentTab === "home" && styles.navTabActive]}
          onPress={() => setCurrentTab("home")}
          activeOpacity={0.7}
        >
          <View style={styles.tabIconBox}>
            <Text style={styles.tabIcon}>🏠</Text>
            <View
              style={[
                styles.navBadgeDot,
                isConnected ? styles.dotOnline : styles.dotOffline,
              ]}
            />
          </View>
          <Text
            style={[
              styles.navLabel,
              currentTab === "home" && styles.navLabelActive,
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Terminal */}
        <TouchableOpacity
          style={[styles.navTab, currentTab === "terminal" && styles.navTabActive]}
          onPress={() => setCurrentTab("terminal")}
          activeOpacity={0.7}
        >
          <View style={styles.tabIconBox}>
            <Text style={styles.tabIcon}>💻</Text>
            {isSessionRunning && (
              <View style={[styles.navBadgeDot, styles.dotRunning]} />
            )}
          </View>
          <Text
            style={[
              styles.navLabel,
              currentTab === "terminal" && styles.navLabelActive,
            ]}
          >
            Terminal
          </Text>
        </TouchableOpacity>
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
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "#262626",
    paddingTop: 5,
    paddingBottom: 6,
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    borderRadius: 6,
    marginHorizontal: 12,
  },
  navTabActive: {
    backgroundColor: "#1e1e1e",
  },
  tabIconBox: {
    position: "relative",
  },
  tabIcon: {
    fontSize: 18,
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
  navLabel: {
    fontSize: 10,
    color: "#737373",
    fontWeight: "600",
    marginTop: 2,
    fontFamily: "monospace",
  },
  navLabelActive: {
    color: "#58a6ff",
    fontWeight: "700",
  },
});
