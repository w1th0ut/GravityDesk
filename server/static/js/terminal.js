/**
 * Terminal Screen Line Buffer & Rendering Logic
 */
import { state } from './state.js';
import { ansiToHtml } from './ansi.js';

export function renderActiveLines() {
  const terminalScreen = document.getElementById("terminal-screen");
  if (!terminalScreen) return;

  // Fast DOM update: filter out boilerplate / noise lines
  const validLines = state.lines.filter((line, i) => {
    const trimmed = line.trim();
    if (!trimmed && i === 0) return false;
    const lower = trimmed.toLowerCase();
    if (lower.includes("microsoft windows [version")) return false;
    if (lower.includes("(c) microsoft corporation")) return false;
    if (lower.includes("all rights reserved")) return false;
    return true;
  });

  terminalScreen.innerHTML = validLines
    .map(line => `<div class="term-line">${ansiToHtml(line)}</div>`)
    .join("");
  scrollToBottom();
}

export function processIncomingData(chunk) {
  // 1. Strip OSC Window Title sequences (\x1B]0;...\x07)
  chunk = chunk.replace(/(\x1B\]|\x9D)[0-9;]*[^\x07\x1B\r\n]*(\x07|\x1B\\)?/g, "");
  // 2. Strip all ANSI control sequences (cursor pos, erase line, etc.) except SGR color (m)
  chunk = chunk.replace(/\x1B\[[0-9;?]*[A-LN-Za-ln-z]/g, "");
  // 3. Strip stray literal bracket control codes if \x1B was dropped (e.g. [0K, [2K, [?25h)
  chunk = chunk.replace(/\[[0-9;?]*[A-LN-Za-ln-z]/g, "");
  // 4. Strip Windows OS copyright and version strings
  chunk = chunk.replace(/Microsoft Windows \[Version[^\]]+\]/gi, "");
  chunk = chunk.replace(/\(c\) Microsoft Corporation[^\r\n]*/gi, "");
  chunk = chunk.replace(/All rights reserved[^\r\n]*/gi, "");

  let lineUpdated = false;

  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];

    if (state.lines.length === 0) state.lines.push("");

    if (ch === "\r") {
      // If followed by \n, let \n create the new line
      if (i + 1 < chunk.length && chunk[i + 1] === "\n") {
        continue;
      }
      // Standalone carriage return (\r): Overwrite the current active line in-place!
      state.lines[state.lines.length - 1] = "";
      lineUpdated = true;
    } else if (ch === "\n") {
      // New line
      state.lines.push("");
      if (state.lines.length > state.MAX_LINES) state.lines.shift();
      lineUpdated = true;
    } else {
      state.lines[state.lines.length - 1] += ch;
      lineUpdated = true;
    }
  }

  if (lineUpdated) {
    renderActiveLines();
  }
}

export function clearTerminal() {
  state.lines = [
    "\x1b[36m ███  ████   ███  █   █ ███ █████ █   █\x1b[0m",
    "\x1b[36m█     █   █ █   █ █   █  █    █    █ █ \x1b[0m",
    "\x1b[36m█ ██  ████  █████  █ █   █    █     █  \x1b[0m",
    "\x1b[36m ███  █  █  █   █   █   ███   █     █  \x1b[0m",
    "\x1b[36m        ████  █████  ████ █   █        \x1b[0m",
    "\x1b[36m        █   █ █     █     ████         \x1b[0m",
    "\x1b[36m        █   █ ████     ██ █  █         \x1b[0m",
    "\x1b[36m        ████  █████ ████  █   █        \x1b[0m",
    "\x1b[90m───────────────────────────────────────\x1b[0m",
    "\x1b[36mAnti-Gravity\x1b[0m \x1b[37m(AGY) Remote CLI\x1b[0m",
    "\x1b[90mReady for prompts & commands.\x1b[0m",
    "",
    "\x1b[32mprompt>\x1b[0m "
  ];
  renderActiveLines();
}

export function scrollToBottom() {
  const terminalScreen = document.getElementById("terminal-screen");
  if (terminalScreen) {
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }
}

export function updateFolderLabel(p) {
  const folderNameEl = document.getElementById("folder-name");
  if (!folderNameEl) return;
  const name = p.split(/[\\/]/).filter(Boolean).pop() || p;
  folderNameEl.innerText = name;
  folderNameEl.title = p;
}
