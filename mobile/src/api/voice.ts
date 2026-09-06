import { apiFetch } from "./client";

export interface TranscribeResponse {
  status: string;
  transcript: string;
  message?: string;
}

/**
 * Uploads recorded audio to the host workstation for server-side speech recognition.
 */
export async function uploadVoiceAudio(
  uri: string,
  lang: string = "id-ID"
): Promise<string> {
  const formData = new FormData();
  formData.append("file", {
    uri,
    name: "audio.m4a",
    type: "audio/m4a",
  } as any);

  const query = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const res = await apiFetch<TranscribeResponse>(
    `/api/voice/transcribe${query}`,
    {
      method: "POST",
      body: formData,
      ...({ timeoutMs: 30000 } as any),
    }
  );

  return res?.transcript || "";
}
