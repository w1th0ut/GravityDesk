/**
 * GravityDesk Web Console - Application Bootstrapper & Controller
 */
import { state } from './state.js';
import { renderActiveLines, clearTerminal, scrollToBottom, updateFolderLabel } from './terminal.js';
import { getWebDeviceId, getWebDeviceName, registerWebDevice, clearWebPairing, triggerQrScan, handleQrImage } from './pairing.js';
import { fetchVitals, setTerminalActiveState, updateSessionBtnState } from './vitals.js';
import { toggleSession, autoResizeInput, sendPrompt, sendInput, sendSignal } from './session.js';
import { initSpeech, toggleVoice, stopVoice } from './voice.js';
import {
  openChatModal,
  closeChatModal,
  setChatFilter,
  loadConversations,
  renderFilteredChats,
  chooseConversation,
  initActiveConversation,
  openFolderModal,
  closeFolderModal,
  loadDirectory,
  chooseCurrentFolder
} from './modals.js';
import { connectWS } from './ws.js';

export function switchTab(tab) {
  state.currentTab = tab;
  const homeView = document.getElementById("home-view");
  const termView = document.getElementById("terminal-view");
  const homeBtn = document.getElementById("nav-btn-home");
  const termBtn = document.getElementById("nav-btn-terminal");

  if (tab === "home") {
    if (homeView) homeView.classList.add("active");
    if (termView) termView.classList.remove("active");
    if (homeBtn) homeBtn.classList.add("active");
    if (termBtn) termBtn.classList.remove("active");
  } else {
    if (termView) termView.classList.add("active");
    if (homeView) homeView.classList.remove("active");
    if (termBtn) termBtn.classList.add("active");
    if (homeBtn) homeBtn.classList.remove("active");
    setTimeout(scrollToBottom, 50);
  }
}

// Attach controller methods to window for inline HTML event handlers
window.switchTab = switchTab;
window.triggerQrScan = triggerQrScan;
window.clearWebPairing = clearWebPairing;
window.handleQrImage = handleQrImage;
window.openFolderModal = openFolderModal;
window.closeFolderModal = closeFolderModal;
window.chooseCurrentFolder = chooseCurrentFolder;
window.openChatModal = openChatModal;
window.closeChatModal = closeChatModal;
window.setChatFilter = setChatFilter;
window.renderFilteredChats = renderFilteredChats;
window.chooseConversation = chooseConversation;
window.toggleSession = toggleSession;
window.sendSignal = sendSignal;
window.clearTerminal = clearTerminal;
window.scrollToBottom = scrollToBottom;
window.toggleVoice = toggleVoice;
window.sendPrompt = sendPrompt;

function initApp() {
  const termInput = document.getElementById("term-input");
  if (termInput) {
    termInput.addEventListener("input", autoResizeInput);
    termInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });
  }

  initSpeech();
  registerWebDevice();
  connectWS();
  fetchVitals();
  initActiveConversation();
  setInterval(fetchVitals, 3000);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
