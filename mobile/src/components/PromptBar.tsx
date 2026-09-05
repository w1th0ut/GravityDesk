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
  isSessionRunning: boolean;
  onToggleSession: () => void;
  isSessionLoading?: boolean;
}

export const PromptBar: React.FC<Props> = ({
  onSendInput,
  onSendSignal,
  onClearLogs,
  isSessionRunning,
  onToggleSession,
  isSessionLoading = false,
}) => {
  const [promptText, setPromptText] = useState("");
  const [inputHeight, setInputHeight] = useState(38);
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
    setInputHeight(38);
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
      {/* Quick Action Toolbar */}
      <View style={styles.quickBar}>
        <TouchableOpacity
          style={[styles.sessionBtn, isSessionRunning ? styles.sessionBtnStop : styles.sessionBtnStart]}
          onPress={onToggleSession}
          disabled={isSessionLoading}
        >
          {isSessionLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sessionBtnText}>
              {isSessionRunning ? "⏹ Stop agy" : "▶ Start agy"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickKey, styles.keySigint]}
          onPress={() => onSendSignal("SIGINT")}
        >
          <Text style={styles.keySigintText}>Ctrl+C</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickKey}
          onPress={handleInsertNewline}
        >
          <Text style={styles.quickKeyText}>Enter ↵</Text>
        </TouchableOpacity>

        {onClearLogs && (
          <TouchableOpacity
            style={styles.quickKey}
            onPress={onClearLogs}
          >
            <Text style={styles.quickKeyText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Input Row - Auto-expanding WhatsApp style */}
      <View style={styles.inputRow}>
        {isAvailable && (
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnRecording]}
            onPress={handleMicToggle}
          >
            <Text style={styles.micIcon}>{isRecording ? "⏹" : "🎙️"}</Text>
          </TouchableOpacity>
        )}

        <TextInput
          style={[styles.textInput, { height: Math.min(Math.max(38, inputHeight), 120) }]}
          value={promptText}
          onChangeText={setPromptText}
          onContentSizeChange={(e) => {
            setInputHeight(e.nativeEvent.contentSize.height);
          }}
          placeholder="Prompt agy CLI (type or speak)..."
          placeholderTextColor="#8b949e"
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
    backgroundColor: "#161b22",
    borderTopWidth: 1,
    borderTopColor: "#30363d",
    paddingBottom: 6,
  },
  quickBar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#21262d",
    alignItems: "center",
  },
  sessionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  sessionBtnStart: {
    backgroundColor: "#1f6feb",
  },
  sessionBtnStop: {
    backgroundColor: "rgba(248, 81, 73, 0.2)",
    borderWidth: 1,
    borderColor: "#f85149",
  },
  sessionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  quickKey: {
    backgroundColor: "#21262d",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  quickKeyText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#c9d1d9",
  },
  keySigint: {
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    borderColor: "rgba(248, 81, 73, 0.4)",
  },
  keySigintText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#f85149",
  },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    alignItems: "flex-end",
  },
  micBtn: {
    backgroundColor: "#21262d",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnRecording: {
    backgroundColor: "#f85149",
    borderColor: "#f85149",
  },
  micIcon: {
    fontSize: 16,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1,
    borderColor: "#30363d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#ffffff",
    fontSize: 14,
    textAlignVertical: "top",
  },
  sendBtn: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
});
