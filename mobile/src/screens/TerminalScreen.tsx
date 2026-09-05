import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { HealthResponse } from "../types";
import { WorkspacePickerModal } from "../components/WorkspacePickerModal";
import { ConversationPickerModal } from "../components/ConversationPickerModal";
import { TerminalView } from "../components/TerminalView";
import { PromptBar } from "../components/PromptBar";
import { startSessionApi, stopSessionApi } from "../api/session";

interface Props {
  health: HealthResponse | null;
  isConnected: boolean;
  logs: string[];
  isWsConnected: boolean;
  wsSessionRunning: boolean;
  sendInput: (text: string) => void;
  sendSignal: (signal: string) => void;
  clearLogs: () => void;
  refreshVitals: () => Promise<void>;
}

export const TerminalScreen: React.FC<Props> = ({
  health,
  isConnected,
  logs,
  isWsConnected,
  wsSessionRunning,
  sendInput,
  sendSignal,
  clearLogs,
  refreshVitals,
}) => {
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showConvoModal, setShowConvoModal] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<string>("");
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [activeConvoName, setActiveConvoName] = useState<string>("New Chat");
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(false);

  const isSessionRunning =
    wsSessionRunning || (health?.active_session?.is_alive ?? false);

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
      await refreshVitals();
    } catch (err) {
      console.warn("Session toggle error:", err);
    } finally {
      setIsSessionLoading(false);
    }
  }, [isSessionRunning, activeWorkspace, refreshVitals]);

  return (
    <View style={styles.container}>
      {/* Header Container */}
      <View style={styles.header}>
        {/* Row 1: Brand & Full Telemetry Chips (NO settings button) */}
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
          refreshVitals();
        }}
      />
    </View>
  );
};

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
