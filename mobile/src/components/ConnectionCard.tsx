import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { HealthResponse } from "../types";

interface Props {
  health: HealthResponse | null;
  isConnected: boolean;
  isChecking: boolean;
  onPressSettings?: () => void;
}

export const ConnectionCard: React.FC<Props> = ({
  health,
  isConnected,
  isChecking,
  onPressSettings,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.statusGroup}>
          <View style={[styles.dot, isConnected ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusTitle}>
            {isConnected ? "Laptop Online" : isChecking ? "Connecting..." : "Laptop Offline"}
          </Text>
        </View>
        {onPressSettings && (
          <TouchableOpacity onPress={onPressSettings} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>Pairing / IP ⚙️</Text>
          </TouchableOpacity>
        )}
      </View>

      {isConnected && health ? (
        <View style={styles.metricsContainer}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Tailscale IP:</Text>
            <Text style={styles.metricValue}>{health.tailscale_ip}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>CPU Load:</Text>
            <Text style={styles.metricValue}>{health.cpu_percent}%</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Memory (RAM):</Text>
            <Text style={styles.metricValue}>{health.memory_percent}%</Text>
          </View>
          {health.battery && (
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Laptop Battery:</Text>
              <Text style={styles.metricValue}>
                {health.battery.is_charging ? "⚡ " : ""}
                {health.battery.percent}%
              </Text>
            </View>
          )}
          {health.sleep_inhibit_active && (
            <View style={styles.sleepBadge}>
              <Text style={styles.sleepBadgeText}>🛡️ Sleep Inhibit Active (Laptop won't suspend)</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.offlineBox}>
          {isChecking ? (
            <ActivityIndicator color="#58a6ff" />
          ) : (
            <Text style={styles.offlineText}>
              Ensure laptop daemon is running and Tailscale is connected.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#161b22",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#30363d",
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: "#3fb950",
  },
  dotOffline: {
    backgroundColor: "#f85149",
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  settingsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#21262d",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  settingsBtnText: {
    fontSize: 12,
    color: "#8b949e",
    fontWeight: "600",
  },
  metricsContainer: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#21262d",
    paddingTop: 8,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 13,
    color: "#8b949e",
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c9d1d9",
  },
  sleepBadge: {
    marginTop: 6,
    backgroundColor: "rgba(88, 166, 255, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  sleepBadgeText: {
    fontSize: 11,
    color: "#58a6ff",
    fontWeight: "500",
  },
  offlineBox: {
    paddingVertical: 12,
    alignItems: "center",
  },
  offlineText: {
    fontSize: 12,
    color: "#8b949e",
    textAlign: "center",
  },
});
