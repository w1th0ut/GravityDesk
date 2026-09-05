/**
 * Modals: Folder Navigation & Conversation Resume Pickers
 */
import { state } from './state.js';
import { escapeHtml } from './ansi.js';
import { updateFolderLabel } from './terminal.js';

/* --- Conversation Resume Modal --- */

export async function openChatModal() {
  const modal = document.getElementById("chat-modal");
  if (modal) modal.classList.add("open");
  loadConversations();
}

export function closeChatModal() {
  const modal = document.getElementById("chat-modal");
  if (modal) modal.classList.remove("open");
}

export function setChatFilter(scope) {
  state.chatFilterScope = scope;
  const allBtn = document.getElementById("chat-tab-all");
  const repoBtn = document.getElementById("chat-tab-repo");
  if (allBtn) {
    allBtn.style.background = scope === 'all' ? 'var(--accent)' : '#1e1e1e';
    allBtn.style.color = scope === 'all' ? '#fff' : '#e5e5e5';
  }
  if (repoBtn) {
    repoBtn.style.background = scope === 'repo' ? 'var(--accent)' : '#1e1e1e';
    repoBtn.style.color = scope === 'repo' ? '#fff' : '#e5e5e5';
  }
  renderFilteredChats();
}

export async function loadConversations() {
  const listEl = document.getElementById("chat-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px;font-size:11px;">Loading conversations...</div>';
  try {
    const res = await fetch(`/api/conversations?token=${state.token}`);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    state.allChats = data.conversations || [];
    state.activeChatId = data.active_id;
    window._activeChatId = data.active_id;
    state.currentRepoName = data.current_repo || '';

    const repoTab = document.getElementById("chat-tab-repo-text");
    if (repoTab && state.currentRepoName) {
      repoTab.innerText = state.currentRepoName;
    }

    renderFilteredChats();
  } catch (err) {
    listEl.innerHTML = '<div style="color:var(--danger);padding:8px;font-size:11px;">Failed to load conversations</div>';
  }
}

export function renderFilteredChats() {
  const listEl = document.getElementById("chat-list");
  if (!listEl) return;
  const query = (document.getElementById("chat-search")?.value || "").toLowerCase().trim();
  listEl.innerHTML = "";

  const filtered = state.allChats.filter(c => {
    if (state.chatFilterScope === 'repo' && !c.is_current) {
      return false;
    }
    if (query) {
      const matchTitle = (c.title || "").toLowerCase().includes(query);
      const matchWs = (c.workspace_name || "").toLowerCase().includes(query);
      const matchId = (c.id || "").toLowerCase().includes(query);
      return matchTitle || matchWs || matchId;
    }
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted);padding:8px;font-size:11px;">No conversations found</div>';
    return;
  }

  filtered.forEach((c) => {
    const div = document.createElement("div");
    div.className = "folder-row";
    div.style.flexDirection = "column";
    div.style.alignItems = "flex-start";
    div.style.padding = "7px 9px";
    div.style.borderRadius = "4px";
    div.style.border = "1px solid var(--border)";
    div.style.background = "#141414";
    div.style.marginBottom = "4px";

    const isActive = (state.activeChatId && c.id === state.activeChatId) || (window._activeChatId && c.id === window._activeChatId);
    if (isActive) {
      div.style.borderColor = "var(--success)";
      div.style.background = "#101d14";
    }

    const wsBadge = c.workspace_name
      ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#21262d;color:var(--accent);padding:1px 5px;border-radius:3px;font-size:10px;">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          ${escapeHtml(c.workspace_name)}
        </span>`
      : '';
    const activeBadge = isActive
      ? `<span style="background:rgba(63,185,80,0.2);color:var(--success);padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;">ACTIVE</span>`
      : '';

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;width:100%;align-items:flex-start;gap:6px;">
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-muted);"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span style="font-weight:600;font-size:12px;color:#ffffff;line-height:1.3;flex:1;word-break:break-word;">${escapeHtml(c.title || "Chat " + c.id.slice(0, 8))}</span>
        </div>
        ${activeBadge}
      </div>
      <div style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
        ${wsBadge}
        <span>${c.steps || 1} steps</span>
        <span>•</span>
        <span>${escapeHtml(c.time_str || "")}</span>
      </div>
    `;

    div.onclick = () => chooseConversation(c.id, c.title, c.workspace_path);
    listEl.appendChild(div);
  });
}

export async function chooseConversation(id, title, wsPath) {
  closeChatModal();
  state.activeChatId = id === "new" ? null : id;
  window._activeChatId = state.activeChatId;
  const chatNameEl = document.getElementById("chat-name");
  if (chatNameEl) {
    const display = id === "new" ? "New Chat" : (title ? (title.length > 13 ? title.slice(0, 11) + ".." : title) : id.slice(0, 8));
    chatNameEl.innerText = display;
    chatNameEl.title = title || id;
  }
  if (wsPath) {
    updateFolderLabel(wsPath);
    state.activePath = wsPath;
  }
  try {
    const params = new URLSearchParams({
      id: id,
      title: title || "",
      workspace_path: wsPath || "",
      token: state.token
    });
    await fetch(`/api/conversations/select?${params.toString()}`, {
      method: "POST"
    });
  } catch (err) {}
}

export async function initActiveConversation() {
  try {
    const res = await fetch(`/api/conversations?token=${state.token}`);
    if (res.ok) {
      const data = await res.json();
      if (data.active_id) {
        state.activeChatId = data.active_id;
        window._activeChatId = data.active_id;
        const active = (data.conversations || []).find(c => c.id === data.active_id);
        const chatNameEl = document.getElementById("chat-name");
        if (chatNameEl && active) {
          const display = active.title ? (active.title.length > 13 ? active.title.slice(0, 11) + ".." : active.title) : active.id.slice(0, 8);
          chatNameEl.innerText = display;
          chatNameEl.title = active.title || active.id;
        }
      }
    }
  } catch (err) {}
}

/* --- Folder Picker Modal --- */

export async function openFolderModal() {
  const modal = document.getElementById("folder-modal");
  if (modal) modal.classList.add("open");
  loadDirectory(state.activePath || "");
}

export function closeFolderModal() {
  const modal = document.getElementById("folder-modal");
  if (modal) modal.classList.remove("open");
}

export async function loadDirectory(p) {
  const res = await fetch(`/api/workspaces?path=${encodeURIComponent(p)}&token=${state.token}`);
  const data = await res.json();
  state.modalPath = data.current_path;

  const bcEl = document.getElementById("bc-bar");
  if (bcEl) {
    bcEl.innerHTML = "";
    data.breadcrumbs.forEach((b, i) => {
      const s = document.createElement("span");
      s.style.cursor = "pointer";
      s.innerText = b.name + (i < data.breadcrumbs.length - 1 ? " / " : "");
      s.onclick = () => loadDirectory(b.path);
      bcEl.appendChild(s);
    });
  }

  const dirEl = document.getElementById("dir-list");
  if (dirEl) {
    dirEl.innerHTML = "";
    data.entries.forEach((e) => {
      const div = document.createElement("div");
      div.className = "folder-row";
      div.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--accent);">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${escapeHtml(e.name)}</span>
      `;
      div.onclick = () => loadDirectory(e.path);
      dirEl.appendChild(div);
    });
  }
}

export async function switchSessionDir(p) {
  await fetch(`/api/workspaces/select?path=${encodeURIComponent(p)}&token=${state.token}`, {
    method: "POST"
  });
}

export function chooseCurrentFolder() {
  state.activePath = state.modalPath;
  updateFolderLabel(state.activePath);
  closeFolderModal();
  switchSessionDir(state.activePath);
}
