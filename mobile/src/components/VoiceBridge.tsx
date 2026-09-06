import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export interface VoiceBridgeRef {
  start: (lang?: string) => void;
  stop: () => void;
}

interface Props {
  onResult: (text: string, isFinal: boolean) => void;
  onError: (err: string) => void;
  onEnd: () => void;
}

const HTML_VOICE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background:transparent;margin:0;padding:0;">
<script>
  var recognition = null;
  var SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

  function post(msg) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  window.startVoice = function(lang) {
    if (!SpeechAPI) {
      post({ type: "error", error: "not_supported" });
      return;
    }
    try {
      if (recognition) {
        try { recognition.abort(); } catch(e) {}
      }
      recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang || "id-ID";

      recognition.onresult = function(event) {
        var text = "";
        var isFinal = false;
        for (var i = event.resultIndex; i < event.results.length; ++i) {
          text += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }
        if (text) {
          post({ type: "result", text: text, isFinal: isFinal });
        }
      };

      recognition.onerror = function(event) {
        post({ type: "error", error: event.error || "unknown" });
      };

      recognition.onend = function() {
        post({ type: "end" });
      };

      recognition.start();
      post({ type: "started" });
    } catch(err) {
      post({ type: "error", error: String(err) });
    }
  };

  window.stopVoice = function() {
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
  };
</script>
</body>
</html>
`;

export const VoiceBridge = forwardRef<VoiceBridgeRef, Props>(
  ({ onResult, onError, onEnd }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      start: (lang = "id-ID") => {
        webViewRef.current?.injectJavaScript(`window.startVoice("${lang}"); true;`);
      },
      stop: () => {
        webViewRef.current?.injectJavaScript(`window.stopVoice(); true;`);
      },
    }));

    if (Platform.OS === "web") {
      return null;
    }

    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          ref={webViewRef}
          source={{ html: HTML_VOICE, baseUrl: "https://localhost" }}
          originWhitelist={["*"]}
          javaScriptEnabled={true}
          mediaCapturePermissionGrantType="grant"
          mediaPlaybackRequiresUserAction={false}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === "result") {
                onResult(data.text, !!data.isFinal);
              } else if (data.type === "error") {
                onError(data.error);
              } else if (data.type === "end") {
                onEnd();
              }
            } catch (e) {
              console.warn("[VoiceBridge] Failed to parse message:", e);
            }
          }}
          style={styles.hidden}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  hidden: {
    width: 0,
    height: 0,
    position: "absolute",
    opacity: 0,
  },
});
