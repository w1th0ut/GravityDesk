import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import { uploadVoiceAudio } from "../api/voice";

// Safely resolve ExpoSpeechRecognitionModule when compiled in native build
let ExpoSpeechRecognitionModule: any = null;
let addSpeechRecognitionListener: any = null;

try {
  const SpeechMod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = SpeechMod.ExpoSpeechRecognitionModule;
  addSpeechRecognitionListener = SpeechMod.addSpeechRecognitionListener;
} catch {
  // Not available in standard Expo Go or unlinked environment
}

export interface UseVoiceRecognitionReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  isAvailable: boolean;
  isRealtime: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetTranscript: () => void;
}

export function useVoiceRecognition(lang: string = "id-ID"): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecRef = useRef<any>(null);
  const listenersRef = useRef<any[]>([]);
  const finalTranscriptRef = useRef<string>("");
  const activeEngineRef = useRef<"native" | "web" | "fallback" | null>(null);

  const cleanupListeners = useCallback(() => {
    listenersRef.current.forEach((sub) => {
      try {
        sub?.remove?.();
      } catch {}
    });
    listenersRef.current = [];
  }, []);

  // Clean up any lingering handles on unmount
  useEffect(() => {
    return () => {
      cleanupListeners();
      if (ExpoSpeechRecognitionModule) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      if (webRecRef.current) {
        try {
          webRecRef.current.stop();
        } catch {}
        webRecRef.current = null;
      }
    };
  }, [cleanupListeners]);

  const startRecording = useCallback(async () => {
    setTranscript("");
    finalTranscriptRef.current = "";
    cleanupListeners();

    // 1. Native Speech Recognition (available in standalone Android/iOS build)
    if (ExpoSpeechRecognitionModule && addSpeechRecognitionListener) {
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perm.granted) {
          activeEngineRef.current = "native";
          setIsRecording(true);

          const resultSub = addSpeechRecognitionListener("result", (event: any) => {
            const currentHypothesis = event.results?.[0]?.transcript || "";
            if (event.isFinal) {
              const prev = finalTranscriptRef.current;
              const updated = prev ? `${prev} ${currentHypothesis}` : currentHypothesis;
              finalTranscriptRef.current = updated;
              setTranscript(updated);
            } else {
              const prev = finalTranscriptRef.current;
              const combined = prev ? `${prev} ${currentHypothesis}` : currentHypothesis;
              setTranscript(combined);
            }
          });

          const endSub = addSpeechRecognitionListener("end", () => {
            setIsRecording(false);
            cleanupListeners();
          });

          const errSub = addSpeechRecognitionListener("error", (err: any) => {
            console.warn("[Voice Native] Error:", err);
            setIsRecording(false);
            cleanupListeners();
          });

          listenersRef.current = [resultSub, endSub, errSub];

          await ExpoSpeechRecognitionModule.start({
            lang: lang,
            interimResults: true,
            continuous: true,
          });

          return;
        }
      } catch (nativeErr) {
        console.warn("[Voice] Native speech recognition failed to start, falling back:", nativeErr);
        cleanupListeners();
      }
    }

    // 2. Web browser fallback using native SpeechRecognition
    if (
      Platform.OS === "web" ||
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
    ) {
      try {
        const SpeechAPI =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechAPI) {
          activeEngineRef.current = "web";
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
          setIsRecording(true);
          return;
        }
      } catch (err) {
        console.warn("[Voice Web] Failed to start:", err);
      }
    }

    // 3. Fallback: Audio recording via expo-av with server transcription
    try {
      activeEngineRef.current = "fallback";
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn("[Voice] Microphone permission not granted");
        return;
      }

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
      setIsRecording(true);
    } catch (err) {
      console.warn("[Voice] Fallback audio record error:", err);
      setIsRecording(false);
    }
  }, [lang, cleanupListeners]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);

    // Stop Native Speech Recognition if active
    if (activeEngineRef.current === "native" && ExpoSpeechRecognitionModule) {
      try {
        await ExpoSpeechRecognitionModule.stop();
      } catch {}
      cleanupListeners();
      return;
    }

    // Stop Web Recognition if active
    if (activeEngineRef.current === "web" && webRecRef.current) {
      try {
        webRecRef.current.stop();
      } catch {}
      webRecRef.current = null;
      return;
    }

    // Fallback: Finalize expo-av and upload to server
    const rec = recordingRef.current;
    recordingRef.current = null;

    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });

        const uri = rec.getURI();
        if (uri) {
          setIsTranscribing(true);
          try {
            const text = await uploadVoiceAudio(uri, lang);
            if (text) {
              setTranscript(text);
            }
          } catch (uploadErr) {
            console.warn("[Voice] Upload transcription error:", uploadErr);
          } finally {
            setIsTranscribing(false);
          }
        }
      } catch (err) {
        console.warn("[Voice] Stop recording error:", err);
        setIsTranscribing(false);
      }
    }
  }, [lang, cleanupListeners]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    finalTranscriptRef.current = "";
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    isAvailable: true,
    isRealtime: !!ExpoSpeechRecognitionModule || Platform.OS === "web",
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
