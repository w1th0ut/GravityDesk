import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useVoiceRecognition } from "../hooks/useVoiceRecognition";

interface Props {
  onSendInput: (text: string) => void;
  onSendSignal: (signal: string) => void;
  onClearLogs?: () => void;
  onScrollToBottom?: () => void;
  isSessionRunning: boolean;
  onToggleSession: () => void;
  isSessionLoading?: boolean;
}

export const PromptBar: React.FC<Props> = ({
  onSendInput,
  onSendSignal,
  onClearLogs,
  onScrollToBottom,
  isSessionRunning,
  onToggleSession,
  isSessionLoading = false,
}) => {
  const [promptText, setPromptText] = useState("");
  const [inputHeight, setInputHeight] = useState(36);
  const { isRecording, transcript, isAvailable, startRecording, stopRecording, resetTranscript } =
    useVoiceRecognition("id-ID");

  // Sync spoken transcript into prompt bar for user review
  useEffect(() => {
    if (transcript) {
      setPromptText((prev) => (prev ? prev + " " + transcript : transcript));
    }
  }, [transcript]);

  const handleSend = () => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    onSendInput(trimmed + "\r\n");
    setPromptText("");
    setInputHeight(36);
    resetTranscript();
  };

  const handleInsertNewline = () => {
    setPromptText((prev) => prev + "\n");
  };

  const handleMicToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* Quick Action Bar (.quick-bar matching index.html) */}
      <View style={styles.quickBar}>
        <TouchableOpacity
          style={[styles.keyBtn, isSessionRunning ? styles.sessionBtnStop : styles.sessionBtnStart]}
          onPress={onToggleSession}
          disabled={isSessionLoading}
        >
          {isSessionLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.keyBtnText, isSessionRunning && styles.sessionStopText]}>
              {isSessionRunning ? "⏹ Stop agy" : "▶ Start agy"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.keyBtn, styles.btnCtrlC]}
          onPress={() => onSendSignal("SIGINT")}
        >
          <Text style={styles.btnCtrlCText}>Ctrl+C</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.keyBtn}
          onPress={handleInsertNewline}
        >
          <Text style={styles.keyBtnText}>Enter ↵</Text>
        </TouchableOpacity>

        {onClearLogs && (
          <TouchableOpacity
            style={styles.keyBtn}
            onPress={onClearLogs}
          >
            <Text style={styles.keyBtnText}>Clear</Text>
          </TouchableOpacity>
        )}

        {onScrollToBottom && (
          <TouchableOpacity
            style={styles.keyBtn}
            onPress={onScrollToBottom}
          >
            <Text style={styles.keyBtnText}>Bottom ↓</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Input Dock (.input-dock matching index.html) */}
      <View style={styles.inputDock}>
        {isAvailable && (
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnRecording]}
            onPress={handleMicToggle}
          >
            <Text style={[styles.micIcon, isRecording && styles.micIconRecording]}>
              {isRecording ? "🔴" : "🎙️"}
            </Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={[styles.termInput, { height: Math.min(Math.max(36, inputHeight), 130) }]}
          value={promptText}
          onChangeText={setPromptText}
          onContentSizeChange={(e) => {
            setInputHeight(e.nativeEvent.contentSize.height);
          }}
          placeholder="Type message or command..."
          placeholderTextColor="#737373"
          multiline={true}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.sendBtn, !promptText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!promptText.trim()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "#262626",
  },
  quickBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#141414",
    alignItems: "center",
  },
  keyBtn: {
    backgroundColor: "#1e1e1e",
    borderWidth: 1,
    borderColor: "#262626",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  keyBtnText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#e5e5e5",
    fontWeight: "600",
  },
  sessionBtnStart: {
    borderColor: "#58a6ff",
  },
  sessionBtnStop: {
    borderColor: "rgba(248, 81, 73, 0.4)",
  },
  sessionStopText: {
    color: "#f85149",
  },
  btnCtrlC: {
    borderColor: "rgba(248, 81, 73, 0.4)",
  },
  btnCtrlCText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#f85149",
    fontWeight: "700",
  },
  inputDock: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 56,
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "#262626",
    alignItems: "flex-end",
  },
  micBtn: {
    width: 32,
    height: 36,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnRecording: {
    transform: [{ scale: 1.15 }],
  },
  micIcon: {
    fontSize: 18,
    opacity: 0.7,
  },
  micIconRecording: {
    opacity: 1,
  },
  termInput: {
    flex: 1,
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 18,
    textAlignVertical: "top",
  },
  sendBtn: {
    backgroundColor: "#1f6feb",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
});

