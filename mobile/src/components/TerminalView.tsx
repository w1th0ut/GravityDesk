import React, { useRef, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from "react-native";

export interface TerminalViewRef {
  scrollToBottom: () => void;
}

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
  30: "#484f58",
  31: "#f85149",
  32: "#3fb950",
  33: "#d29922",
  34: "#58a6ff",
  35: "#bc8cff",
  36: "#39c5cf",
  37: "#e6edf3",
  90: "#6e7681",
  91: "#ffa198",
  92: "#56d364",
  93: "#e3b341",
  94: "#79c0ff",
  95: "#d2a8ff",
  96: "#56d4dd",
  97: "#ffffff",
};

/**
 * Deep ANSI SGR State Machine Parser matching index.html.
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

export const TerminalView = forwardRef<TerminalViewRef, Props>(
  ({ logs }, ref) => {
    const flatListRef = useRef<FlatList>(null);
    const [autoScroll, setAutoScroll] = useState<boolean>(true);

    const scrollToBottom = () => {
      flatListRef.current?.scrollToEnd({ animated: true });
      setAutoScroll(true);
    };

    useImperativeHandle(ref, () => ({
      scrollToBottom,
    }));

    // Group raw chunks into virtualized lines with memoization
    const parsedLines = useMemo(() => {
      return logs.map((chunk, index) => ({
        id: `${index}`,
        spans: parseAnsiToSpans(chunk),
      }));
    }, [logs]);

    const renderItem = ({ item }: { item: { id: string; spans: StyledSpan[] } }) => (
      <View style={styles.lineWrapper}>
        <Text selectable>
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
      </View>
    );

    return (
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={parsedLines}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.terminalScreen}
          contentContainerStyle={styles.terminalContent}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          windowSize={9}
          removeClippedSubviews={true}
          onContentSizeChange={() => {
            if (autoScroll) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListEmptyComponent={
            <View style={styles.emptyBanner}>
              <Text style={styles.bannerAscii}>
{`   ____                 _ _         ____            _    
  / ___|_ __ __ ___   _(_) |_ _   _|  _ \\  ___  ___| | __
 | |  _| '__/ _\` \\ \\ / / | __| | | | | | |/ _ \\/ __| |/ /
 | |_| | | | (_| |\\ V /| | |_| |_| | |_| |  __/\\__ \\   < 
  \\____|_|  \\__,_| \\_/ |_|\\__|\\__, |____/ \\___||___/_|\\_\\
                              |___/                      `}
              </Text>
              <Text style={styles.bannerStatus}>[+] AGY Ready • Host Stream Active</Text>
              <Text style={styles.bannerSub}>
                Type your prompt or select an action below to begin.
              </Text>
            </View>
          }
        />
      </View>
    );
  }
);

TerminalView.displayName = "TerminalView";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  terminalScreen: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  terminalContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lineWrapper: {
    minHeight: 18,
  },
  baseTerminalText: {
    fontFamily: "monospace",
    fontSize: 12.5,
    lineHeight: 18,
  },
  defaultTextColor: {
    color: "#cccccc",
  },
  boldText: {
    fontWeight: "700",
  },
  emptyBanner: {
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  bannerAscii: {
    fontFamily: "monospace",
    fontSize: 9,
    lineHeight: 12,
    color: "#58a6ff",
    fontWeight: "700",
  },
  bannerStatus: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#3fb950",
    fontWeight: "700",
    marginTop: 10,
  },
  bannerSub: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#737373",
    marginTop: 4,
  },
});

