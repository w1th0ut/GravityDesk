import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { fetchConversations, selectConversationApi } from "../api/conversations";
import { ConversationItem } from "../types";

interface Props {
  visible: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelectConversation: (id: string | null, summary?: string) => void;
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

  const loadConversations = async () => {
    setLoading(true);
    try {
      const res = await fetchConversations();
      setConversations(res.conversations || []);
      setCurrentActiveId(res.active_id);
    } catch (err) {
      console.warn("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadConversations();
    }
  }, [visible]);

  const handleSelect = async (id: string, summary?: string) => {
    try {
      setLoading(true);
      const res = await selectConversationApi(id);
      setCurrentActiveId(res.active_id);
      onSelectConversation(res.active_id, summary);
      onClose();
    } catch (err) {
      console.warn("Failed to select conversation:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>💬 Resume Conversation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* New Session Button */}
          <TouchableOpacity
            style={[
              styles.newChatBtn,
              !currentActiveId && styles.activeItem,
            ]}
            onPress={() => handleSelect("new", "New Session")}
          >
            <Text style={styles.newChatText}>➕ Start Fresh Chat</Text>
            {!currentActiveId && (
              <Text style={styles.activeBadge}>Active</Text>
            )}
          </TouchableOpacity>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#58a6ff" />
              <Text style={styles.loadingText}>Loading conversations...</Text>
            </View>
          ) : (
            <ScrollView style={styles.list}>
              {conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No prior conversations found</Text>
                </View>
              ) : (
                conversations.map((item) => {
                  const isActive = currentActiveId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemCard, isActive && styles.activeItem]}
                      onPress={() => handleSelect(item.id, item.summary)}
                    >
                      <View style={styles.itemHeader}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {item.summary || "Untitled conversation"}
                        </Text>
                        {isActive && (
                          <Text style={styles.activeBadge}>Active</Text>
                        )}
                      </View>
                      <View style={styles.itemFooter}>
                        <Text style={styles.itemTime}>🕒 {item.relative_time}</Text>
                        {item.workspace && (
                          <Text style={styles.itemWorkspace} numberOfLines={1}>
                            📁 {item.workspace.split(/[\\/]/).pop()}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#161b22",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "#30363d",
    maxHeight: "80%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 18,
    color: "#8b949e",
  },
  newChatBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#21262d",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#388bfd",
  },
  newChatText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#58a6ff",
  },
  list: {
    paddingHorizontal: 16,
  },
  itemCard: {
    backgroundColor: "#0d1117",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#30363d",
    marginBottom: 8,
  },
  activeItem: {
    borderColor: "#388bfd",
    backgroundColor: "rgba(56, 139, 253, 0.1)",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e6edf3",
    flex: 1,
  },
  activeBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#58a6ff",
    backgroundColor: "rgba(56, 139, 253, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemTime: {
    fontSize: 11,
    color: "#8b949e",
  },
  itemWorkspace: {
    fontSize: 11,
    color: "#8b949e",
    maxWidth: "50%",
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    color: "#8b949e",
    marginTop: 12,
    fontSize: 13,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#8b949e",
    fontSize: 13,
  },
});
