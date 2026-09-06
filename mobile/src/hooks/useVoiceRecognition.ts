import { useState, useCallback, useRef } from "react";
import { Audio } from "expo-av";
import { uploadVoiceAudio } from "../api/voice";

export interface UseVoiceRecognitionReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  isAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetTranscript: () => void;
}

export function useVoiceRecognition(lang: string = "id-ID"): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // 1. Request microphone permission
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn("[Voice] Microphone permission denied");
        return;
      }

      // 2. Prepare audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // 3. Cleanup existing recording if any
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {}
        recordingRef.current = null;
      }

      // 4. Create and start new recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setTranscript("");
    } catch (err) {
      console.warn("[Voice] Start recording error:", err);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);

    if (!rec) return;

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = rec.getURI();
      if (!uri) return;

      setIsTranscribing(true);
      try {
        const text = await uploadVoiceAudio(uri, lang);
        if (text) {
          setTranscript(text);
        }
      } catch (uploadErr) {
        console.warn("[Voice] Transcription upload failed:", uploadErr);
      } finally {
        setIsTranscribing(false);
      }
    } catch (err) {
      console.warn("[Voice] Stop recording error:", err);
      setIsTranscribing(false);
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
