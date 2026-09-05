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
import { fetchWorkspaces, fetchFavorites, toggleFavoriteApi } from "../api/workspaces";
import { FavoriteItem, WorkspacesResponse } from "../types";

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
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentNavPath, setCurrentNavPath] = useState<string>(activePath);

  const loadData = async (path?: string) => {
    setLoading(true);
    try {
      const [workspaceRes, favsRes] = await Promise.all([
        fetchWorkspaces(path || currentNavPath),
        fetchFavorites(),
      ]);
      setData(workspaceRes);
      setCurrentNavPath(workspaceRes.current_path);
      setFavorites(favsRes);
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

  const handleTogglePin = async () => {
    if (!currentNavPath) return;
    try {
      const updatedFavs = await toggleFavoriteApi(currentNavPath);
      setFavorites(updatedFavs);
    } catch (err) {
      console.warn("Failed to toggle favorite:", err);
    }
  };

  const isCurrentPinned = favorites.some(
    (f) => f.path.toLowerCase() === currentNavPath.toLowerCase()
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Project Folder</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body}>
            {/* Favorites Section */}
            {favorites.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>⭐ FAVORITES</Text>
                <View style={styles.favoritesGrid}>
                  {favorites.map((fav, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.favoritePill}
                      onPress={() => {
                        onSelectWorkspace(fav.path);
                        onClose();
                      }}
                    >
                      <Text style={styles.favoriteName} numberOfLines={1}>
                        📁 {fav.name}
                      </Text>
                      <Text style={styles.favoritePath} numberOfLines={1}>
                        {fav.path}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

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
                    >
                      <Text style={styles.driveBtnText}>{d}</Text>
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
                    >
                      <Text style={styles.breadcrumbText}>
                        {b.name}
                        {i < data.breadcrumbs.length - 1 ? "  / " : ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Directory Entries */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FOLDERS</Text>
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#58a6ff" />
                </View>
              ) : data?.entries && data.entries.length > 0 ? (
                data.entries.map((entry, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.folderRow}
                    onPress={() => loadData(entry.path)}
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
            <TouchableOpacity style={styles.pinBtn} onPress={handleTogglePin}>
              <Text style={styles.pinBtnText}>
                {isCurrentPinned ? "★ Pinned" : "☆ Pin Folder"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => {
                onSelectWorkspace(currentNavPath);
                onClose();
              }}
            >
              <Text style={styles.selectBtnText}>Select Folder</Text>
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
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    height: "82%",
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 16,
    color: "#8b949e",
  },
  body: {
    flex: 1,
    padding: 14,
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8b949e",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  favoritesGrid: {
    gap: 6,
  },
  favoritePill: {
    backgroundColor: "#21262d",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  favoriteName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#58a6ff",
  },
  favoritePath: {
    fontSize: 11,
    color: "#8b949e",
    marginTop: 2,
  },
  drivesRow: {
    flexDirection: "row",
    gap: 6,
  },
  driveBtn: {
    backgroundColor: "#21262d",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  driveBtnActive: {
    borderColor: "#58a6ff",
    backgroundColor: "rgba(88, 166, 255, 0.15)",
  },
  driveBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#c9d1d9",
  },
  breadcrumbsBar: {
    backgroundColor: "#0d1117",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  breadcrumbItem: {
    paddingVertical: 2,
  },
  breadcrumbText: {
    fontSize: 12,
    color: "#58a6ff",
    fontWeight: "500",
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 8,
  },
  folderIcon: {
    fontSize: 14,
  },
  folderName: {
    fontSize: 13,
    color: "#c9d1d9",
    flex: 1,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#8b949e",
    fontStyle: "italic",
    paddingVertical: 8,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#30363d",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161b22",
  },
  pinBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  pinBtnText: {
    fontSize: 12,
    color: "#c9d1d9",
    fontWeight: "600",
  },
  selectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#1f6feb",
  },
  selectBtnText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "700",
  },
});
