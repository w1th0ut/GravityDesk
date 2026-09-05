/**
 * GravityDesk Web Console - Central Runtime State
 */
export const state = {
  ws: null,
  currentSeq: 0,
  activePath: "",
  token: new URLSearchParams(window.location.search).get("token") || "",
  isSessionRunning: false,
  lines: [""],
  MAX_LINES: 1500,
  currentTab: "terminal",
  allChats: [],
  chatFilterScope: "all", // 'all' or 'repo'
  currentRepoName: "",
  activeChatId: null,
  modalPath: "",
  recognition: null,
  isRecording: false,
};
