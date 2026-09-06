import { useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import { uploadVoiceAudio } from "../api/voice";
import { VoiceBridgeRef } from "../components/VoiceBridge";

export interface UseVoiceRecognitionReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  isAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetTranscript: () => void;
  handleBridgeResult: (text: string, isFinal: boolean) => void;
  handleBridgeError: (error: string) => void;
  handleBridgeEnd: () => void;
  voiceBridgeRef: React.RefObject<VoiceBridgeRef>;
}

export function useVoiceRecognition(lang: string = "id-ID"): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecRef = useRef<any>(null);
  const voiceBridgeRef = useRef<VoiceBridgeRef>(null);
  const bridgeReceivedTextRef = useRef<boolean>(false);
  const bridgeActiveRef = useRef<boolean>(false);

  const handleBridgeResult = useCallback((text: string, _isFinal: boolean) => {
    if (text) {
      bridgeReceivedTextRef.current = true;
      setTranscript(text);
    }
  }, []);

  const handleBridgeError = useCallback((err: string) => {
    console.warn("[VoiceBridge] Error:", err);
    bridgeActiveRef.current = false;
  }, []);

  const handleBridgeEnd = useCallback(() => {
    bridgeActiveRef.current = false;
  }, []);

  const startRecording = useCallback(async () => {
    setTranscript("");
    setIsRecording(true);
    bridgeReceivedTextRef.current = false;

    // 1. In Web / Mobile Chrome browser runtime, use native Web Speech API directly
    if (
      Platform.OS === "web" ||
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
    ) {
      try {
        const SpeechAPI =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechAPI) {
          const rec = new SpeechAPI();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = lang;

          rec.onresult = (event: any) => {
            let full = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              full += event.results[i][0].transcript;
            }
            if (full) {
              setTranscript(full);
            }
          };

          rec.onerror = (e: any) => {
            console.warn("[Voice Web] Speech error:", e);
            setIsRecording(false);
          };

          rec.onend = () => {
            setIsRecording(false);
          };

          webRecRef.current = rec;
          rec.start();
          return;
        }
      } catch (err) {
        console.warn("[Voice Web] Failed to start:", err);
      }
    }

    // 2. In Native Android/iOS, trigger VoiceBridge for real-time speech recognition
    if (Platform.OS !== "web" && voiceBridgeRef.current) {
      bridgeActiveRef.current = true;
      voiceBridgeRef.current.start(lang);
    }

    // 3. Simultaneously initialize expo-av audio recording as background fallback
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        if (recordingRef.current) {
          try {
            await recordingRef.current.stopAndUnloadAsync();
          } catch {}
          recordingRef.current = null;
        }

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
      }
    } catch (err) {
      console.warn("[Voice] Audio background fallback init error:", err);
    }
  }, [lang]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);

    // Stop web recognition if active
    if (webRecRef.current) {
      try {
        webRecRef.current.stop();
      } catch {}
      webRecRef.current = null;
      return;
    }

    // Stop VoiceBridge if active
    if (voiceBridgeRef.current && bridgeActiveRef.current) {
      try {
        voiceBridgeRef.current.stop();
      } catch {}
      bridgeActiveRef.current = false;
    }

    // Unload expo-av recorder
    const rec = recordingRef.current;
    recordingRef.current = null;

    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });

        const uri = rec.getURI();

        // If VoiceBridge already captured realtime text, we don't need server fallback
        if (!bridgeReceivedTextRef.current && uri) {
          setIsTranscribing(true);
          try {
            const text = await uploadVoiceAudio(uri, lang);
            if (text) {
              setTranscript(text);
            }
          } catch (uploadErr) {
            console.warn("[Voice] Server transcription fallback error:", uploadErr);
          } finally {
            setIsTranscribing(false);
          }
        }
      } catch (err) {
        console.warn("[Voice] Stop recording error:", err);
        setIsTranscribing(false);
      }
    }
  }, [lang]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    bridgeReceivedTextRef.current = false;
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    isAvailable: true,
    startRecording,
    stopRecording,
    resetTranscript,
    handleBridgeResult,
    handleBridgeError,
    handleBridgeEnd,
    voiceBridgeRef,
  };
}
