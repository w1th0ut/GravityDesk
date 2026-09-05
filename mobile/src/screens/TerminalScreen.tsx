import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { HealthResponse } from "../types";
import { WorkspacePickerModal } from "../components/WorkspacePickerModal";
import { ConversationPickerModal } from "../components/ConversationPickerModal";
import { TerminalView, TerminalViewRef } from "../components/TerminalView";
import { PromptBar } from "../components/PromptBar";
import { startSessionApi, stopSessionApi } from "../api/session";

const FolderIcon = ({ color = "#58a6ff", size = 12 }: { color?: string; size?: number }) => (
  <View style={{ width: size, height: size * 0.75, justifyContent: "flex-end", marginRight: 5 }}>
    <View
      style={{
        width: size * 0.45,
        height: size * 0.25,
        backgroundColor: color,
        borderTopLeftRadius: 1.5,
        borderTopRightRadius: 1.5,
      }}
    />
    <View
      style={{
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 1.5,
        marginTop: -0.5,
      }}
    />
  </View>
);

const ChatIcon = ({ color = "#58a6ff", size = 12 }: { color?: string; size?: number }) => (
  <View
    style={{
      width: size,
      height: size * 0.75,
      borderWidth: 1.4,
      borderColor: color,
      borderRadius: 2.5,
      position: "relative",
      marginRight: 5,
    }}
  >
    <View
      style={{
        position: "absolute",
        bottom: -2,
        left: 2,
        width: 3,
        height: 3,
        backgroundColor: color,
        transform: [{ rotate: "45deg" }],
      }}
    />
  </View>
);

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
  const [activeConvoName, setActiveConvoName] = useState<string>("Resume Chat");
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(false);
  const terminalRef = useRef<TerminalViewRef>(null);

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

  if (!isConnected) {
    return (
      <View style={styles.inactiveContainer}>
        <Text style={styles.inactiveTitle}>No active session.</Text>
        <Text style={styles.inactiveSub}>
          Ensure Tailscale is connected on both devices and the GravityDesk host application is running.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Header (<header> matching index.html) */}
      <View style={styles.header}>
        {/* Row 1: Brand & Vitals */}
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View
              style={[
                styles.statusDot,
                isConnected ? styles.dotOnline : styles.dotOffline,
              ]}
            />
            <Text style={styles.brandTitle}>GravityDesk</Text>
          </View>

          <View style={styles.vitalsText}>
            <Text style={styles.vitalLabel}>Bat: </Text>
            <Text style={styles.vitalVal}>
              {health?.battery
                ? `${health.battery.percent}%${health.battery.is_charging ? " (Chg)" : ""}`
                : "-"}
            </Text>
            <Text style={styles.vitalLabel}> | CPU: </Text>
            <Text style={styles.vitalVal}>
              {health ? `${health.cpu_percent}%` : "-"}
            </Text>
            <Text style={styles.vitalLabel}> | RAM: </Text>
            <Text style={styles.vitalVal}>
              {health?.memory_percent !== undefined ? `${health.memory_percent}%` : "-"}
            </Text>
          </View>
        </View>

        {/* Row 2: Chips Row (.chips-row matching index.html) */}
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={styles.folderChip}
            onPress={() => setShowWorkspaceModal(true)}
            activeOpacity={0.7}
          >
            <FolderIcon color="#58a6ff" size={12} />
            <Text style={styles.chipText} numberOfLines={1}>
              {activeWorkspace
                ? activeWorkspace.split(/[\\/]/).filter(Boolean).pop() || activeWorkspace
                : "Folder"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.folderChip}
            onPress={() => setShowConvoModal(true)}
            activeOpacity={0.7}
          >
            <ChatIcon color="#58a6ff" size={12} />
            <Text style={styles.chipText} numberOfLines={1}>
              {activeConvoName}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Pure Edge-to-Edge Terminal Screen (#terminal-screen matching index.html) */}
      <TerminalView
        ref={terminalRef}
        logs={logs}
        isWsConnected={isWsConnected}
        onClear={clearLogs}
      />

      {/* Quick Action Bar + Input Dock (.quick-bar & .input-dock matching index.html) */}
      <PromptBar
        onSendInput={sendInput}
        onSendSignal={sendSignal}
        onClearLogs={clearLogs}
        onScrollToBottom={() => terminalRef.current?.scrollToBottom()}
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
  inactiveContainer: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  inactiveTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: "monospace",
    textAlign: "center",
  },
  inactiveSub: {
    fontSize: 12,
    color: "#737373",
    fontFamily: "monospace",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  container: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  header: {
    backgroundColor: "#141414",
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 6,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
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
  brandTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  vitalsText: {
    flexDirection: "row",
    alignItems: "center",
  },
  vitalLabel: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#737373",
  },
  vitalVal: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#e5e5e5",
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  folderChip: {
    flex: 1,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chipText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#58a6ff",
  },
});

