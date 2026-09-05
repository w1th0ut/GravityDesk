import { apiFetch } from "./client";
import { ConversationsResponse } from "../types";

/**
 * Fetches available conversation sessions from Antigravity SQLite
 */
export async function fetchConversations(): Promise<ConversationsResponse> {
  return apiFetch<ConversationsResponse>("/api/conversations");
}

/**
 * Selects an active conversation ID to resume (or 'new' for new session)
 */
export async function selectConversationApi(
  id: string,
  title?: string,
  workspacePath?: string
): Promise<{ status: string; active_id: string | null; cwd?: string }> {
  const params = new URLSearchParams({ id });
  if (title) {
    params.append("title", title);
  }
  if (workspacePath) {
    params.append("workspace_path", workspacePath);
  }
  return apiFetch<{ status: string; active_id: string | null; cwd?: string }>(
    `/api/conversations/select?${params.toString()}`,
    { method: "POST" }
  );
}
