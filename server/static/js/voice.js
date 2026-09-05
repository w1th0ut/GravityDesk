/**
 * Web Speech API Voice Dictation
 */
import { state } from './state.js';
import { autoResizeInput } from './session.js';

export function stopVoice() {
  state.isRecording = false;
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.classList.remove("recording");
}

export function initSpeech() {
  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById("mic-btn");
  const termInput = document.getElementById("term-input");

  if (!SpeechAPI) {
    if (micBtn) micBtn.style.display = "none";
    return;
  }
  try {
    state.recognition = new SpeechAPI();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.lang = "en-US";

    state.recognition.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        t += e.results[i][0].transcript;
      }
      if (termInput) {
        termInput.value = t;
        autoResizeInput();
      }
    };

    state.recognition.onend = () => stopVoice();

    state.recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      stopVoice();
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        if (!window.isSecureContext) {
          alert("Microphone blocked by browser because connection is not HTTPS / Secure Context.\n\nQuick Solution:\n1. Open new tab: chrome://flags\n2. Search: 'Insecure origins treated as secure'\n3. Add: " + window.location.origin + "\n4. Set to Enabled & Relaunch.");
        } else {
          alert("Microphone permission not granted. Please allow microphone access in browser settings.");
        }
      }
    };
  } catch (err) {
    console.warn("Speech init error:", err);
  }
}

export function toggleVoice() {
  const micBtn = document.getElementById("mic-btn");
  if (!state.recognition) {
    initSpeech();
    if (!state.recognition) {
      alert("Browser does not support Web Speech API.");
      return;
    }
  }
  if (state.isRecording) {
    state.recognition.stop();
    stopVoice();
  } else {
    try {
      state.recognition.start();
      state.isRecording = true;
      if (micBtn) micBtn.classList.add("recording");
    } catch (err) {
      console.warn("Speech start failed:", err);
      stopVoice();
      if (!window.isSecureContext) {
        alert("Microphone blocked by Chrome on non-localhost HTTP connection.\n\nTo unblock in mobile Chrome:\n1. Open new tab: chrome://flags\n2. Search: 'Insecure origins treated as secure'\n3. Enter: " + window.location.origin + "\n4. Select Enabled and tap Relaunch.");
      }
    }
  }
}
