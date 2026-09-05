import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

interface Props {
  logs: string[];
  isWsConnected: boolean;
  onClear: () => void;
}

/**
 * Strips ANSI control characters and cursor codes for clean text rendering
 */
function cleanAnsi(str: string): string {
  // Removes CSI sequences and control codes
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export const TerminalView: React.FC<Props> = ({ logs, isWsConnected, onClear }) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    setAutoScroll(isCloseToBottom);
  };

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setAutoScroll(true);
  };

  // Join logs into readable terminal block
  const fullText = cleanAnsi(logs.join(""));

  return (
    <View style={styles.container}>
      {/* Terminal Header */}
      <View style={styles.terminalHeader}>
        <View style={styles.leftPill}>
          <View
            style={[styles.wsDot, isWsConnected ? styles.wsOnline : styles.wsOffline]}
          />
          <Text style={styles.wsLabel}>
            {isWsConnected ? "Stream Connected" : "Stream Disconnected"}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, autoScroll && styles.ctrlBtnActive]}
            onPress={scrollToBottom}
          >
            <Text style={styles.ctrlBtnText}>↓ Auto-Scroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={onClear}>
            <Text style={styles.ctrlBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Terminal Screen */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.terminalScreen}
        contentContainerStyle={styles.terminalContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (autoScroll) {
            scrollViewRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {fullText ? (
          <Text style={styles.terminalText} selectable>
            {fullText}
          </Text>
        ) : (
          <Text style={styles.placeholderText}>
            Terminal ready. Start an agy session or enter commands below.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#040d1a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#30363d",
    marginHorizontal: 12,
    marginVertical: 6,
    overflow: "hidden",
  },
  terminalHeader: {
    backgroundColor: "#161b22",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#30363d",
  },
  leftPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  wsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wsOnline: {
    backgroundColor: "#3fb950",
  },
  wsOffline: {
    backgroundColor: "#f85149",
  },
  wsLabel: {
    fontSize: 11,
    color: "#8b949e",
    fontWeight: "600",
  },
  controls: {
    flexDirection: "row",
    gap: 6,
  },
  ctrlBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#30363d",
  },
  ctrlBtnActive: {
    borderColor: "#58a6ff",
    backgroundColor: "rgba(88, 166, 255, 0.15)",
  },
  ctrlBtnText: {
    fontSize: 10,
    color: "#c9d1d9",
    fontWeight: "600",
  },
  terminalScreen: {
    flex: 1,
    padding: 10,
  },
  terminalContent: {
    paddingBottom: 20,
  },
  terminalText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    color: "#58a6ff",
  },
  placeholderText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#8b949e",
    fontStyle: "italic",
  },
});
