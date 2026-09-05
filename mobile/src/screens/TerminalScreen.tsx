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
import Svg, { Path } from "react-native-svg";
import { startSessionApi, stopSessionApi } from "../api/session";

const FolderIcon = ({ color = "#58a6ff", size = 13 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
    <Path
      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const ChatIcon = ({ color = "#58a6ff", size = 13 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
    <Path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
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
        {/* Row 1: Brand */}
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <Text style={styles.brandTitle}>GravityDesk</Text>
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
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
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

