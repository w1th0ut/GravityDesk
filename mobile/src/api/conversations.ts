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
export async function selectConversationApi(id: string): Promise<{ status: string; active_id: string | null }> {
  return apiFetch<{ status: string; active_id: string | null }>(
    `/api/conversations/select?id=${encodeURIComponent(id)}`,
    { method: "POST" }
  );
}
