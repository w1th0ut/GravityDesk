import { apiFetch } from "./client";
import { FavoriteItem, WorkspacesResponse } from "../types";

/**
 * Fetches directories, drives, and breadcrumbs for a given laptop path
 */
export async function fetchWorkspaces(targetPath?: string): Promise<WorkspacesResponse> {
  const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : "";
  return apiFetch<WorkspacesResponse>(`/api/workspaces${query}`);
}

/**
 * Fetches pinned favorite directories
 */
export async function fetchFavorites(): Promise<FavoriteItem[]> {
  return apiFetch<FavoriteItem[]>("/api/favorites");
}

/**
 * Toggles a directory in the pinned favorites list
 */
export async function toggleFavoriteApi(targetPath: string): Promise<FavoriteItem[]> {
  return apiFetch<FavoriteItem[]>(
    `/api/favorites/toggle?path=${encodeURIComponent(targetPath)}`,
    { method: "POST" }
  );
}
