import { attachCompanionTtsAudio, detachCompanionTtsAudio } from "./companionAvatarAudioBridge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

let currentUrl: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let onEndedCallback: (() => void) | null = null;

export function isChatTtsPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

export function stopChatTts(): void {
  detachCompanionTtsAudio();
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio = null;
  }
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl); } catch { /* ignore */ }
    currentUrl = null;
  }
  const cb = onEndedCallback;
  onEndedCallback = null;
  cb?.();
}

/**
 * Synthesize assistant reply via Nest → RAG (edge-tts) and play as MP3.
 * Fails silently if the network returns an error (e.g. edge-tts not installed on RAG host).
 */
export async function playChatTts(text: string, lang?: string | null, onEnded?: () => void): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  stopChatTts();
  onEndedCallback = onEnded ?? null;

  const token = typeof window !== "undefined" ? localStorage.getItem("bb_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/chat/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: trimmed,
      ...(lang && String(lang).trim() ? { lang: String(lang).trim() } : {})
    })
  });

  if (!res.ok) {
    return;
  }

  const blob = await res.blob();
  if (!blob.size) return;

  const url = URL.createObjectURL(blob);
  currentUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;
  attachCompanionTtsAudio(audio);
  audio.addEventListener(
    "ended",
    () => {
      stopChatTts();
    },
    { once: true }
  );
  try {
    await audio.play();
  } catch {
    stopChatTts();
  }
}
