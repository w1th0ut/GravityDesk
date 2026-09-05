import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

interface Props {
  logs: string[];
  isWsConnected: boolean;
  onClear: () => void;
}

interface StyledSpan {
  text: string;
  color?: string;
  bold?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "#484f58", // Black
  31: "#ff7b72", // Red
  32: "#7ee787", // Green
  33: "#d29922", // Yellow
  34: "#58a6ff", // Blue
  35: "#bc8cff", // Magenta
  36: "#39c5cf", // Cyan
  37: "#d1d5db", // White
  90: "#6e7681", // Bright Black
  91: "#ffa198", // Bright Red
  92: "#56d364", // Bright Green
  93: "#e3b341", // Bright Yellow
  94: "#79c0ff", // Bright Blue
  95: "#d2a8ff", // Bright Magenta
  96: "#56d4dd", // Bright Cyan
  97: "#f0f6fc", // Bright White
};

/**
 * Deep ANSI SGR State Machine Parser.
 * Transforms raw ANSI escape strings into structured, colored spans.
 */
function parseAnsiToSpans(rawChunk: string): StyledSpan[] {
  const spans: StyledSpan[] = [];
  const regex = /\x1B\[([0-9;]*)m/g;

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let isBold = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawChunk)) !== null) {
    const textBefore = rawChunk.slice(lastIndex, match.index);
    if (textBefore) {
      spans.push({
        text: textBefore.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, ""),
        color: currentColor,
        bold: isBold,
      });
    }

    const codeStr = match[1];
    if (!codeStr || codeStr === "0") {
      currentColor = undefined;
      isBold = false;
    } else {
      const codes = codeStr.split(";").map((c) => parseInt(c, 10));
      for (const code of codes) {
        if (code === 0) {
          currentColor = undefined;
          isBold = false;
        } else if (code === 1) {
          isBold = true;
        } else if (ANSI_COLOR_MAP[code]) {
          currentColor = ANSI_COLOR_MAP[code];
        }
      }
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = rawChunk.slice(lastIndex);
  if (remaining) {
    spans.push({
      text: remaining.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, ""),
      color: currentColor,
      bold: isBold,
    });
  }

  return spans;
}

export const TerminalView: React.FC<Props> = ({ logs, isWsConnected, onClear }) => {
  const flatListRef = useRef<FlatList>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Group raw chunks into virtualized lines with memoization
  const parsedLines = useMemo(() => {
    return logs.map((chunk, index) => ({
      id: `${index}`,
      spans: parseAnsiToSpans(chunk),
    }));
  }, [logs]);

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setAutoScroll(true);
  };

  const renderItem = ({ item }: { item: { id: string; spans: StyledSpan[] } }) => (
    <Text style={styles.lineWrapper} selectable>
      {item.spans.map((span, sIdx) => (
        <Text
          key={sIdx}
          style={[
            styles.baseTerminalText,
            span.color ? { color: span.color } : styles.defaultTextColor,
            span.bold ? styles.boldText : undefined,
          ]}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );

  return (
    <View style={styles.container}>
      {/* Terminal Header */}
      <View style={styles.terminalHeader}>
        <View style={styles.leftPill}>
          <View
            style={[styles.wsDot, isWsConnected ? styles.wsOnline : styles.wsOffline]}
          />
          <Text style={styles.wsLabel}>
            {isWsConnected ? "Stream Active" : "Stream Offline"}
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

      {/* Virtualized Terminal Window */}
      <FlatList
        ref={flatListRef}
        data={parsedLines}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.terminalScreen}
        contentContainerStyle={styles.terminalContent}
        initialNumToRender={25}
        maxToRenderPerBatch={25}
        windowSize={7}
        removeClippedSubviews={true}
        onContentSizeChange={() => {
          if (autoScroll) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListEmptyComponent={
          <Text style={styles.placeholderText}>
            Terminal ready. Start an agy session or enter commands below.
          </Text>
        }
      />
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
    paddingHorizontal: 10,
  },
  terminalContent: {
    paddingVertical: 8,
  },
  lineWrapper: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  baseTerminalText: {
    fontFamily: "monospace",
    fontSize: 12,
  },
  defaultTextColor: {
    color: "#c9d1d9",
  },
  boldText: {
    fontWeight: "700",
  },
  placeholderText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#8b949e",
    fontStyle: "italic",
    padding: 10,
  },
});
