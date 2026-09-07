import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";
import { HealthResponse } from "../types";
import { fetchConversations, selectConversationApi } from "../api/conversations";
import { selectWorkspaceApi } from "../api/workspaces";
import { WorkspacePickerModal } from "../components/WorkspacePickerModal";
import { ConversationPickerModal } from "../components/ConversationPickerModal";
import { TerminalView, TerminalViewRef } from "../components/TerminalView";
import { PromptBar } from "../components/PromptBar";
import Svg, { Path } from "react-native-svg";

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

import {
  getCachedWorkspace,
  getCachedConversation,
  loadSavedPreferences,
  saveWorkspacePreference,
  saveConversationPreference,
} from "../storage/credentials";

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
  
  const cachedWs = getCachedWorkspace();
  const cachedConvo = getCachedConversation();

  const [activeWorkspace, setActiveWorkspace] = useState<string>(cachedWs.path);
  const [selectedFolderName, setSelectedFolderName] = useState<string>(cachedWs.name);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(cachedConvo.id);
  const [activeConvoName, setActiveConvoName] = useState<string>(cachedConvo.name);
  const terminalRef = useRef<TerminalViewRef>(null);
  const hasAutoSyncedRef = useRef<boolean>(false);

  // Restore persistent preferences immediately on mount
  useEffect(() => {
    loadSavedPreferences().then((pref) => {
      if (pref.workspace.path) {
        setActiveWorkspace((prev) => prev || pref.workspace.path);
        setSelectedFolderName((prev) => (prev && prev !== "Select Folder" ? prev : pref.workspace.name));
      }
      if (pref.conversation.id || (pref.conversation.name && pref.conversation.name !== "Resume Chat")) {
        setActiveConvoId((prev) => prev || pref.conversation.id);
        setActiveConvoName((prev) => (prev && prev !== "Resume Chat" ? prev : pref.conversation.name));
      }
    });
  }, []);

  const handleWorkspaceChange = useCallback((path: string) => {
    if (!path) return;
    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
    setActiveWorkspace(path);
    setSelectedFolderName(name);
    saveWorkspacePreference(path, name, true);
  }, []);

  // Reconcile and synchronize workspace & conversation state with host daemon
  useEffect(() => {
    if (!isConnected) {
      hasAutoSyncedRef.current = false;
      return;
    }

    const session = health?.active_session;
    if (!session) return;

    // First connection/pairing handshake: if host started fresh in default directory,
    // but phone has explicit saved workspace or conversation, push them to the host.
    if (!hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      if (session.is_default_workspace && (activeWorkspace || activeConvoId)) {
        if (activeWorkspace) {
          selectWorkspaceApi(activeWorkspace).catch(() => {});
        }
        if (activeConvoId) {
          selectConversationApi(activeConvoId, activeConvoName, activeWorkspace || undefined).catch(() => {});
        }
        return;
      }
    }

    // Reflect host's authoritative directory if different
    if (session.cwd && session.cwd !== activeWorkspace) {
      const name = session.cwd.split(/[\\/]/).filter(Boolean).pop() || session.cwd;
      setActiveWorkspace(session.cwd);
      setSelectedFolderName(name);
      saveWorkspacePreference(session.cwd, name, true);
    }

    // Reflect host's authoritative conversation if different
    if (session.active_conversation_title !== undefined) {
      const hostConvoId = session.active_conversation_id || null;
      const hostConvoTitle = session.active_conversation_title || (hostConvoId ? `Chat ${hostConvoId.slice(0, 8)}` : "New Chat");
      if (hostConvoId !== activeConvoId || hostConvoTitle !== activeConvoName) {
        setActiveConvoId(hostConvoId);
        setActiveConvoName(hostConvoTitle);
        saveConversationPreference(hostConvoId, hostConvoTitle);
      }
    }
  }, [isConnected, health?.active_session, activeWorkspace, activeConvoId, activeConvoName]);

  useEffect(() => {
    if (isConnected) {
      fetchConversations()
        .then((res) => {
          if (res.active_id) {
            setActiveConvoId(res.active_id);
            const active = (res.conversations || []).find((c) => c.id === res.active_id);
            const label =
              res.active_title ||
              active?.title ||
              active?.summary ||
              active?.preview ||
              `Chat ${res.active_id.slice(0, 8)}`;
            setActiveConvoName(label);
            saveConversationPreference(res.active_id, label);
          } else if (res.active_id === null && hasAutoSyncedRef.current) {
            setActiveConvoId(null);
            setActiveConvoName("New Chat");
            saveConversationPreference(null, "New Chat");
          }
        })
        .catch(() => {});
    }
  }, [isConnected]);

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
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerBanner}>
          <Text style={styles.headerTitle}>GravityDesk Terminal</Text>
          <Text style={styles.headerSubtitle}>Interactive Shell & Antigravity CLI</Text>
        </View>

        <View style={styles.separator} />

        {/* Chips Row: Select Folder & Resume Chat */}
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={styles.folderChip}
            onPress={() => setShowWorkspaceModal(true)}
            activeOpacity={0.7}
          >
            <FolderIcon color="#58a6ff" size={12} />
            <Text style={styles.chipText} numberOfLines={1}>
              {selectedFolderName}
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
        onClearLogs={() => {
          clearLogs();
          terminalRef.current?.scrollToBottom();
        }}
        onScrollToBottom={() => terminalRef.current?.scrollToBottom()}
        ffmpegAvailable={health?.ffmpeg_available}
      />

      {/* Modals */}
      <WorkspacePickerModal
        visible={showWorkspaceModal}
        activePath={activeWorkspace}
        onClose={() => setShowWorkspaceModal(false)}
        onSelectWorkspace={handleWorkspaceChange}
      />

      <ConversationPickerModal
        visible={showConvoModal}
        activeId={activeConvoId}
        onClose={() => setShowConvoModal(false)}
        onSelectConversation={(id, summary, wsPath) => {
          setActiveConvoId(id);
          const label = summary || (id ? (id === "new" ? "New Chat" : `Chat ${id.slice(0, 8)}`) : "New Chat");
          setActiveConvoName(label);
          saveConversationPreference(id, label);
          if (wsPath) {
            handleWorkspaceChange(wsPath);
          }
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
  },
  headerBanner: {
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8b949e",
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: "#262626",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  folderChip: {
    flex: 1,
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  chipText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#58a6ff",
    flex: 1,
  },
});

