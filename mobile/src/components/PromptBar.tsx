import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useVoiceRecognition } from "../hooks/useVoiceRecognition";
import { VoiceBridge } from "./VoiceBridge";

interface Props {
  onSendInput: (text: string) => void;
  onSendSignal: (signal: string) => void;
  onClearLogs?: () => void;
  onScrollToBottom?: () => void;
}

export const PromptBar: React.FC<Props> = ({
  onSendInput,
  onSendSignal,
  onClearLogs,
  onScrollToBottom,
}) => {
  const [promptText, setPromptText] = useState("");
  const [inputHeight, setInputHeight] = useState(36);
  const inputRef = useRef<TextInput>(null);
  const prefixTextRef = useRef<string>("");
  const {
    isRecording,
    isTranscribing,
    transcript,
    startRecording,
    stopRecording,
    resetTranscript,
    handleBridgeResult,
    handleBridgeError,
    handleBridgeEnd,
    voiceBridgeRef,
  } = useVoiceRecognition("id-ID");

  // Sync spoken transcript into prompt bar in REAL-TIME as user speaks
  useEffect(() => {
    if (transcript) {
      const prefix = prefixTextRef.current;
      const combined = prefix ? `${prefix} ${transcript}` : transcript;
      setPromptText(combined);
    }
  }, [transcript]);

  const handleSend = () => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    onSendInput(trimmed + "\r\n");
    setPromptText("");
    setInputHeight(36);
    resetTranscript();
    prefixTextRef.current = "";
    Keyboard.dismiss();
  };

  const handleMicToggle = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      prefixTextRef.current = promptText.trim();
      resetTranscript();
      await startRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* Quick Action Bar (.quick-bar matching index.html) */}
      <View style={styles.quickBar}>
        <TouchableOpacity
          style={[styles.keyBtn, styles.btnCtrlC]}
          onPress={() => onSendSignal("SIGINT")}
        >
          <Text style={styles.btnCtrlCText}>Ctrl+C</Text>
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
            <Text style={styles.keyBtnText}>Bottom</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Input Dock (.input-dock matching index.html) */}
      <View style={styles.inputDock}>
        <TouchableOpacity
          style={[
            styles.micBtn,
            isRecording && styles.micBtnRecording,
            isTranscribing && styles.micBtnTranscribing,
          ]}
          onPress={handleMicToggle}
          activeOpacity={0.7}
          disabled={isTranscribing}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color="#58a6ff" />
          ) : (
            <Svg viewBox="0 0 24 24" width={20} height={20} fill={isRecording ? "#f85149" : "#8b949e"}>
              <Path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <Path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </Svg>
          )}
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.termInput, { height: Math.min(Math.max(36, inputHeight), 130) }]}
          value={promptText}
          onChangeText={setPromptText}
          onContentSizeChange={(e) => {
            setInputHeight(e.nativeEvent.contentSize.height);
          }}
          placeholder={
            isRecording
              ? "Listening... Tap mic again to finish"
              : isTranscribing
              ? "Transcribing voice to text..."
              : "Type message or command..."
          }
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

      <VoiceBridge
        ref={voiceBridgeRef}
        onResult={handleBridgeResult}
        onError={handleBridgeError}
        onEnd={handleBridgeEnd}
      />
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
    paddingBottom: 78,
    backgroundColor: "#141414",
    alignItems: "flex-end",
  },
  micBtn: {
    width: 36,
    height: 36,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnRecording: {
    backgroundColor: "rgba(248, 81, 73, 0.15)",
    borderRadius: 6,
  },
  micBtnTranscribing: {
    backgroundColor: "rgba(88, 166, 255, 0.15)",
    borderRadius: 6,
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

