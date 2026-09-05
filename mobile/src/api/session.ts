import { apiFetch } from "./client";

export interface StartSessionResponse {
  status: string;
  cwd: string;
  command: string;
  pid: number | null;
}

export async function startSessionApi(
  cwd?: string,
  command?: string
): Promise<StartSessionResponse> {
  return apiFetch<StartSessionResponse>("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, command }),
  });
}

export async function stopSessionApi(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/api/session/stop", {
    method: "POST",
  });
}
