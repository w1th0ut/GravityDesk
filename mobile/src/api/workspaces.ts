import { apiFetch } from "./client";
import { WorkspacesResponse } from "../types";

/**
 * Fetches directories, drives, and breadcrumbs for a given laptop path
 */
export async function fetchWorkspaces(targetPath?: string): Promise<WorkspacesResponse> {
  const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : "";
  return apiFetch<WorkspacesResponse>(`/api/workspaces${query}`);
}

/**
 * Selects an active workspace path on the host
 */
export async function selectWorkspaceApi(targetPath: string): Promise<{ status: string; cwd: string }> {
  return apiFetch<{ status: string; cwd: string }>(
    `/api/workspaces/select?path=${encodeURIComponent(targetPath)}`,
    { method: "POST" }
  );
}
