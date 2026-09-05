import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { fetchConversations, selectConversationApi } from "../api/conversations";
import { ConversationItem } from "../types";

const ChatEntryIcon: React.FC<{ color?: string; size?: number }> = ({ color = "#58a6ff", size = 13 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
  visible: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelectConversation: (id: string | null, summary?: string, wsPath?: string) => void;
}

export const ConversationPickerModal: React.FC<Props> = ({
  visible,
  activeId,
  onClose,
  onSelectConversation,
}) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentActiveId, setCurrentActiveId] = useState<string | null>(activeId);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterScope, setFilterScope] = useState<"all" | "repo">("all");
  const [currentRepoName, setCurrentRepoName] = useState<string>("");

  const loadConversations = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchConversations();
      setConversations(res.conversations || []);
      setCurrentActiveId(res.active_id);
      if (res.current_repo) {
        setCurrentRepoName(res.current_repo);
      }
    } catch (err: any) {
      console.warn("Failed to load conversations:", err);
      setErrorMessage(err?.message || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadConversations();
    }
  }, [visible]);

  const handleSelect = async (id: string, summary?: string, wsPath?: string) => {
    try {
      setLoading(true);
      const res = await selectConversationApi(id, summary, wsPath);
      setCurrentActiveId(res.active_id);
      onSelectConversation(res.active_id, summary, wsPath || res.cwd);
      onClose();
    } catch (err) {
      console.warn("Failed to select conversation:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => {
      if (filterScope === "repo" && !c.is_current) {
        return false;
      }
      if (q) {
        const title = c.title || c.summary || c.preview || "";
        const ws = c.workspace_name || c.workspace_path || c.workspace || "";
        const matchTitle = title.toLowerCase().includes(q);
        const matchWs = ws.toLowerCase().includes(q);
        const matchId = (c.id || "").toLowerCase().includes(q);
        return matchTitle || matchWs || matchId;
      }
      return true;
    });
  }, [conversations, filterScope, searchQuery]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.modalHead}>
            <Text style={styles.headTitle}>Resume Conversation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.modalBody}>
            {/* Start New Chat Button */}
            <TouchableOpacity
              style={styles.newChatRow}
              onPress={() => handleSelect("new", "New Chat")}
              activeOpacity={0.7}
            >
              <Text style={styles.newChatText}>+ Start New Chat</Text>
            </TouchableOpacity>

            {/* Filter Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabBtn, filterScope === "all" && styles.tabBtnActive]}
                onPress={() => setFilterScope("all")}
              >
                <Text style={[styles.tabBtnText, filterScope === "all" && styles.tabBtnTextActive]}>
                  All Projects
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, filterScope === "repo" && styles.tabBtnActive]}
                onPress={() => setFilterScope("repo")}
              >
                <Text style={[styles.tabBtnText, filterScope === "repo" && styles.tabBtnTextActive]}>
                  {currentRepoName || "Current Repo"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations or projects..."
              placeholderTextColor="#737373"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#58a6ff" />
                <Text style={styles.loadingText}>Loading conversations...</Text>
              </View>
            ) : errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadConversations}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.chatList} showsVerticalScrollIndicator={false}>
                {filteredConversations.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No conversations found</Text>
                  </View>
                ) : (
                  filteredConversations.map((item) => {
                    const isActive = currentActiveId === item.id;
                    const itemTitle = item.title || item.summary || item.preview || `Chat ${item.id.slice(0, 8)}`;
                    const wsName =
                      item.workspace_name ||
                      (item.workspace_path ? item.workspace_path.split(/[\\/]/).filter(Boolean).pop() : "") ||
                      item.workspace ||
                      "";
                    const relativeTime = item.time_str || item.relative_time || "";

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.itemCard, isActive && styles.itemCardActive]}
                        onPress={() => handleSelect(item.id, itemTitle, item.workspace_path)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.itemHeadRow}>
                          <View style={styles.titleIconRow}>
                            <ChatEntryIcon color={isActive ? "#3fb950" : "#58a6ff"} size={13} />
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {itemTitle}
                            </Text>
                          </View>
                          {isActive && (
                            <View style={styles.activeBadge}>
                              <Text style={styles.activeBadgeText}>ACTIVE</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.itemMetaRow}>
                          {wsName ? (
                            <View style={styles.wsBadge}>
                              <Text style={styles.wsBadgeText}>{wsName}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.metaText}>{item.steps || 1} steps</Text>
                          {relativeTime ? (
                            <>
                              <Text style={styles.metaText}>•</Text>
                              <Text style={styles.metaText}>{relativeTime}</Text>
                            </>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  modalBox: {
    width: "92%",
    maxWidth: 440,
    height: "75%",
    maxHeight: "85%",
    backgroundColor: "#141414",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    overflow: "hidden",
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  closeBtn: {
    padding: 2,
  },
  closeText: {
    fontSize: 16,
    color: "#737373",
  },
  modalBody: {
    padding: 12,
    flex: 1,
  },
  newChatRow: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  newChatText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3fb950",
    fontFamily: "monospace",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  tabBtn: {
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#262626",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  tabBtnActive: {
    backgroundColor: "#58a6ff",
    borderColor: "#58a6ff",
  },
  tabBtnText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e5e5e5",
  },
  tabBtnTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#262626",
    color: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 8,
  },
  chatList: {
    flex: 1,
  },
  itemCard: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 4,
    padding: 8,
    marginBottom: 4,
  },
  itemCardActive: {
    borderColor: "#3fb950",
    backgroundColor: "#101d14",
  },
  itemHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
  },
  activeBadge: {
    backgroundColor: "rgba(63, 185, 80, 0.2)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 6,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#3fb950",
    fontFamily: "monospace",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  wsBadge: {
    backgroundColor: "#21262d",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  wsBadgeText: {
    fontSize: 10,
    color: "#58a6ff",
    fontFamily: "monospace",
  },
  metaText: {
    fontSize: 10,
    color: "#737373",
    fontFamily: "monospace",
  },
  loadingBox: {
    padding: 20,
    alignItems: "center",
  },
  loadingText: {
    color: "#737373",
    marginTop: 8,
    fontSize: 11,
    fontFamily: "monospace",
  },
  titleIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  emptyBox: {
    padding: 16,
    alignItems: "center",
  },
  emptyText: {
    color: "#737373",
    fontSize: 11,
    fontFamily: "monospace",
  },
  errorBox: {
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    fontSize: 11,
    color: "#f85149",
    fontFamily: "monospace",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#30363d",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  retryBtnText: {
    fontSize: 11,
    color: "#58a6ff",
    fontFamily: "monospace",
    fontWeight: "600",
  },
});

