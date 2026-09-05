import { useState, useCallback, useRef, useEffect } from "react";

export interface UseVoiceRecognitionReturn {
  isRecording: boolean;
  transcript: string;
  isAvailable: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
}

export function useVoiceRecognition(lang: string = "id-ID"): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [isAvailable, setIsAvailable] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check for Web Speech API (supported in Android Chrome and hybrid runtimes)
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsAvailable(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = lang;

        recognition.onresult = (event: any) => {
          let text = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          setTranscript(text);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.onerror = (e: any) => {
          console.warn("[Voice] Speech recognition error:", e);
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [lang]);

  const startRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        setTranscript("");
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.warn("[Voice] Start error:", err);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setIsRecording(false);
      } catch (err) {
        console.warn("[Voice] Stop error:", err);
      }
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    isRecording,
    transcript,
    isAvailable,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
