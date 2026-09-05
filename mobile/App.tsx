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
import { PairingModal } from "./src/components/PairingModal";
import { WorkspacePickerModal } from "./src/components/WorkspacePickerModal";
import { ConversationPickerModal } from "./src/components/ConversationPickerModal";
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
  const [showConvoModal, setShowConvoModal] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<string>("");
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeConvoName, setActiveConvoName] = useState<string>("New Chat");
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

      {/* Header Container */}
      <View style={styles.header}>
        {/* Row 1: Brand & Full Telemetry Chips */}
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View
              style={[
                styles.statusDot,
                isConnected ? styles.dotOnline : styles.dotOffline,
              ]}
            />
            <Text style={styles.brandTitle}>⚡ GravityDesk</Text>
          </View>

          <View style={styles.vitalsRow}>
            <View style={styles.vitalChip}>
              <Text style={styles.vitalText}>
                {health?.battery
                  ? `${health.battery.is_charging ? "⚡" : "🔋"}${health.battery.percent}%`
                  : "🔋--"}
              </Text>
            </View>

            <View style={styles.vitalChip}>
              <Text style={styles.vitalText}>
                CPU {health ? `${health.cpu_percent}%` : "--"}
              </Text>
            </View>

            <View style={styles.vitalChip}>
              <Text style={styles.vitalText}>
                RAM {health ? `${health.memory_percent}%` : "--"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => setShowPairingModal(true)}
            >
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Workspace & Resume Controls */}
        <View style={styles.headerSub}>
          <TouchableOpacity
            style={styles.ctrlPill}
            onPress={() => setShowWorkspaceModal(true)}
          >
            <Text style={styles.ctrlPillLabel} numberOfLines={1}>
              📁{" "}
              {activeWorkspace
                ? activeWorkspace.split(/[\\/]/).pop() || activeWorkspace
                : "Select Folder"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctrlPill}
            onPress={() => setShowConvoModal(true)}
          >
            <Text style={styles.ctrlPillLabel} numberOfLines={1}>
              💬 {activeConvoName}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live ANSI Terminal Screen (Full Screen Area) */}
      <TerminalView
        logs={logs}
        isWsConnected={isWsConnected}
        onClear={clearLogs}
      />

      {/* WhatsApp-style Multiline Prompt Bar & Quick Controls */}
      <PromptBar
        onSendInput={sendInput}
        onSendSignal={sendSignal}
        onClearLogs={clearLogs}
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

      <ConversationPickerModal
        visible={showConvoModal}
        activeId={activeConvoId}
        onClose={() => setShowConvoModal(false)}
        onSelectConversation={(id, summary) => {
          setActiveConvoId(id);
          setActiveConvoName(summary || (id ? "Resumed Chat" : "New Chat"));
          refresh();
        }}
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
    backgroundColor: "#161b22",
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  dotOnline: {
    backgroundColor: "#3fb950",
  },
  dotOffline: {
    backgroundColor: "#f85149",
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  vitalsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  vitalChip: {
    backgroundColor: "#21262d",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  vitalText: {
    fontSize: 11,
    color: "#8b949e",
    fontWeight: "600",
  },
  settingsBtn: {
    backgroundColor: "#21262d",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#30363d",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsIcon: {
    fontSize: 12,
  },
  headerSub: {
    flexDirection: "row",
    gap: 8,
  },
  ctrlPill: {
    flex: 1,
    backgroundColor: "#21262d",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  ctrlPillLabel: {
    fontSize: 12,
    color: "#58a6ff",
    fontWeight: "600",
  },
});
