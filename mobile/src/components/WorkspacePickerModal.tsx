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
import { fetchWorkspaces, selectWorkspaceApi } from "../api/workspaces";
import { WorkspacesResponse } from "../types";

interface Props {
  visible: boolean;
  activePath: string;
  onClose: () => void;
  onSelectWorkspace: (path: string) => void;
}

export const WorkspacePickerModal: React.FC<Props> = ({
  visible,
  activePath,
  onClose,
  onSelectWorkspace,
}) => {
  const [data, setData] = useState<WorkspacesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selecting, setSelecting] = useState<boolean>(false);
  const [currentNavPath, setCurrentNavPath] = useState<string>(activePath);

  const loadData = async (path?: string) => {
    setLoading(true);
    try {
      const workspaceRes = await fetchWorkspaces(path || currentNavPath);
      setData(workspaceRes);
      setCurrentNavPath(workspaceRes.current_path);
    } catch (err) {
      console.warn("Failed to load workspace data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadData(activePath);
    }
  }, [visible, activePath]);

  const handleSelectWorkspace = async () => {
    if (!currentNavPath) return;
    setSelecting(true);
    try {
      await selectWorkspaceApi(currentNavPath);
      onSelectWorkspace(currentNavPath);
      onClose();
    } catch (err) {
      console.warn("Failed to select workspace on host:", err);
      // Still update UI
      onSelectWorkspace(currentNavPath);
      onClose();
    } finally {
      setSelecting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Folder</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Drives */}
            {data?.drives && data.drives.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DRIVES</Text>
                <View style={styles.drivesRow}>
                  {data.drives.map((d, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.driveBtn,
                        currentNavPath.toLowerCase().startsWith(d.toLowerCase()) &&
                          styles.driveBtnActive,
                      ]}
                      onPress={() => loadData(d)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.driveBtnText,
                          currentNavPath.toLowerCase().startsWith(d.toLowerCase()) &&
                            styles.driveBtnTextActive,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Breadcrumbs */}
            {data?.breadcrumbs && (
              <View style={styles.breadcrumbsBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {data.breadcrumbs.map((b, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => loadData(b.path)}
                      style={styles.breadcrumbItem}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.breadcrumbText}>
                        {b.name}
                        {i < data.breadcrumbs.length - 1 ? " / " : ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Directory Entries */}
            <View style={styles.section}>
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color="#58a6ff" />
                  <Text style={styles.loadingText}>Loading folders...</Text>
                </View>
              ) : data?.entries && data.entries.length > 0 ? (
                data.entries.map((entry, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.folderRow}
                    onPress={() => loadData(entry.path)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.folderIcon}>📁</Text>
                    <Text style={styles.folderName} numberOfLines={1}>
                      {entry.name}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyText}>No accessible subdirectories</Text>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.selectBtn, selecting && styles.selectBtnDisabled]}
              onPress={handleSelectWorkspace}
              disabled={selecting}
              activeOpacity={0.7}
            >
              {selecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.selectBtnText}>Select This Folder</Text>
              )}
            </TouchableOpacity>
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
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
    backgroundColor: "#141414",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#262626",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
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
  body: {
    flex: 1,
    padding: 12,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#737373",
    marginBottom: 6,
    letterSpacing: 0.5,
    fontFamily: "monospace",
  },
  drivesRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  driveBtn: {
    backgroundColor: "#1e1e1e",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#262626",
  },
  driveBtnActive: {
    borderColor: "#58a6ff",
    backgroundColor: "rgba(88, 166, 255, 0.15)",
  },
  driveBtnText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#e5e5e5",
  },
  driveBtnTextActive: {
    color: "#58a6ff",
    fontWeight: "700",
  },
  breadcrumbsBar: {
    backgroundColor: "#0c0c0c",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },
  breadcrumbItem: {
    paddingVertical: 1,
  },
  breadcrumbText: {
    fontSize: 11,
    color: "#58a6ff",
    fontFamily: "monospace",
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 4,
    gap: 6,
    marginBottom: 2,
  },
  folderIcon: {
    fontSize: 12,
  },
  folderName: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#e5e5e5",
    flex: 1,
  },
  loadingBox: {
    paddingVertical: 16,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 11,
    color: "#737373",
    fontFamily: "monospace",
    marginTop: 6,
  },
  emptyText: {
    fontSize: 11,
    color: "#737373",
    fontFamily: "monospace",
    paddingVertical: 8,
  },
  footer: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#262626",
    backgroundColor: "#141414",
  },
  selectBtn: {
    height: 34,
    borderRadius: 6,
    backgroundColor: "#1f6feb",
    alignItems: "center",
    justifyContent: "center",
  },
  selectBtnDisabled: {
    opacity: 0.5,
  },
  selectBtnText: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "700",
  },
});
