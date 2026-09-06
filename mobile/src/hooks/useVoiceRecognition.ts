import { useState, useCallback, useRef, useEffect } from "react";
import { Alert, Platform } from "react-native";
import { Audio } from "expo-av";
import { uploadVoiceAudio, TranscriptionError } from "../api/voice";

export interface UseVoiceRecognitionReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  isAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetTranscript: () => void;
}

const showFfmpegMissingAlert = () => {
  Alert.alert(
    "FFmpeg Not Installed",
    "FFmpeg was not found on your host workstation. Voice transcription requires FFmpeg to convert audio files.\n\nPlease install FFmpeg on the host PC (e.g. 'winget install Gyan.FFmpeg' or add it to PATH) to use voice dictation.",
    [{ text: "OK" }]
  );
};

export function useVoiceRecognition(
  lang: string = "id-ID",
  ffmpegAvailable?: boolean
): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");

  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecRef = useRef<any>(null);

  // Clean up any lingering recording handles on unmount
  useEffect(() => {
    return () => {
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
  }, []);

  const startRecording = useCallback(async () => {
    setTranscript("");

    // Check if host has FFmpeg available before starting native recording
    if (Platform.OS !== "web" && ffmpegAvailable === false) {
      showFfmpegMissingAlert();
      return;
    }

    // 1. Web browser fallback using native SpeechRecognition
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
          setIsRecording(true);
          return;
        }
      } catch (err) {
        console.warn("[Voice Web] Failed to start:", err);
      }
    }

    // 2. Native Android Audio Recording via expo-av
    try {
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
      console.warn("[Voice] Start recording error:", err);
      setIsRecording(false);
    }
  }, [lang, ffmpegAvailable]);

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
          } catch (uploadErr: any) {
            console.warn("[Voice] Upload transcription error:", uploadErr);
            if (
              uploadErr?.errorCode === "FFMPEG_MISSING" ||
              uploadErr?.message?.toLowerCase().includes("ffmpeg")
            ) {
              showFfmpegMissingAlert();
            } else {
              Alert.alert(
                "Voice Transcription Failed",
                uploadErr?.message || "An error occurred while transcribing your voice prompt.",
                [{ text: "OK" }]
              );
            }
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
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    isAvailable: true,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
