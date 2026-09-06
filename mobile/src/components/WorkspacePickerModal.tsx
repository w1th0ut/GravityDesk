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
import Svg, { Path } from "react-native-svg";
import { fetchWorkspaces, selectWorkspaceApi } from "../api/workspaces";
import { WorkspacesResponse } from "../types";

const FolderEntryIcon: React.FC<{ color?: string; size?: number }> = ({ color = "#58a6ff", size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = async (path?: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const target = path !== undefined ? path : currentNavPath;
      const workspaceRes = await fetchWorkspaces(target || undefined);
      setData(workspaceRes);
      if (workspaceRes.current_path) {
        setCurrentNavPath(workspaceRes.current_path);
      }
    } catch (err: any) {
      console.warn("Failed to load workspace data:", err);
      setErrorMessage(err?.message || "Failed to load directory");
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
    const target = currentNavPath || data?.current_path;
    if (!target) return;
    setSelecting(true);
    try {
      await selectWorkspaceApi(target);
      onSelectWorkspace(target);
      onClose();
    } catch (err) {
      console.warn("Failed to select workspace on host:", err);
      // Still update UI
      onSelectWorkspace(target);
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
              ) : errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => loadData()}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : data?.entries && data.entries.length > 0 ? (
                data.entries.map((entry, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.folderRow}
                    onPress={() => loadData(entry.path)}
                    activeOpacity={0.7}
                  >
                    <FolderEntryIcon color="#58a6ff" size={14} />
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
    backgroundColor: "#1c1c1c",
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#262626",
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
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
  errorBox: {
    paddingVertical: 12,
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
