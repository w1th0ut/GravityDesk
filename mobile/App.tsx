import React, { useState, useEffect, useCallback } from "react";
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
import { ConnectionCard } from "./src/components/ConnectionCard";
import { PairingModal } from "./src/components/PairingModal";
import { WorkspacePickerModal } from "./src/components/WorkspacePickerModal";
import { TerminalView } from "./src/components/TerminalView";
import { PromptBar } from "./src/components/PromptBar";
import { startSessionApi, stopSessionApi } from "./src/api/session";

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

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<string>("");
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(false);

  // Derive session state from either WebSocket or HTTP telemetry
  const isSessionRunning =
    wsSessionRunning || (health?.active_session?.is_alive ?? false);

  // Sync active workspace from remote session if set
  useEffect(() => {
    if (health?.active_session?.cwd && !activeWorkspace) {
      setActiveWorkspace(health.active_session.cwd);
    }
  }, [health, activeWorkspace]);

  const handleToggleSession = useCallback(async () => {
    setIsSessionLoading(true);
    try {
      if (isSessionRunning) {
        await stopSessionApi();
      } else {
        await startSessionApi(activeWorkspace || undefined);
      }
      await refresh();
    } catch (err) {
      console.warn("Session toggle error:", err);
    } finally {
      setIsSessionLoading(false);
    }
  }, [isSessionRunning, activeWorkspace, refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1117" />

      {/* Main Header */}
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.headerTitle}>⚡ GravityDesk</Text>
          <Text style={styles.headerSubtitle}>Remote agy CLI</Text>
        </View>
        <TouchableOpacity
          style={styles.workspacePill}
          onPress={() => setShowWorkspaceModal(true)}
        >
          <Text style={styles.workspacePillText} numberOfLines={1}>
            📁{" "}
            {activeWorkspace
              ? activeWorkspace.split(/[\\/]/).pop() || activeWorkspace
              : "Select Folder"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Connection & Telemetry Card */}
      <ConnectionCard
        health={health}
        isConnected={isConnected}
        isChecking={isChecking}
        onPressSettings={() => setShowPairingModal(true)}
      />

      {/* Live ANSI Terminal Screen */}
      <TerminalView
        logs={logs}
        isWsConnected={isWsConnected}
        onClear={clearLogs}
      />

      {/* Prompt Bar & Quick Controls */}
      <PromptBar
        onSendInput={sendInput}
        onSendSignal={sendSignal}
        isSessionRunning={isSessionRunning}
        onToggleSession={handleToggleSession}
        isSessionLoading={isSessionLoading}
      />

      {/* Modals */}
      <PairingModal
        visible={showPairingModal}
        onClose={() => setShowPairingModal(false)}
        onPaired={() => {
          refresh();
          reconnect();
        }}
      />

      <WorkspacePickerModal
        visible={showWorkspaceModal}
        activePath={activeWorkspace}
        onClose={() => setShowWorkspaceModal(false)}
        onSelectWorkspace={(path) => setActiveWorkspace(path)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    backgroundColor: "#161b22",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerMain: {
    flex: 1,
  },
  workspacePill: {
    backgroundColor: "#21262d",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#30363d",
    maxWidth: 160,
  },
  workspacePillText: {
    fontSize: 12,
    color: "#58a6ff",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#8b949e",
    fontWeight: "500",
  },
});
