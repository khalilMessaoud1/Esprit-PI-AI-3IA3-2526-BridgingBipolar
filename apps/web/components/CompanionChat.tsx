"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import ButtonPrimary from "./ButtonPrimary";
import InputField from "./InputField";
import CompanionAvatarCanvas from "./CompanionAvatarCanvas";
import { apiFetch, apiUploadFile } from "../lib/api";
import { playChatTts, stopChatTts, isChatTtsPlaying } from "../lib/chatTts";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { b64PngDataUrl, type VoicePhase } from "../lib/voicePhaseReport";

/** Bipolar Phase Monitor output on `/chat/voice` (RAG → Nest). */
type VoiceMoodPayload = {
  phase?: string;
  raw_phase?: string;
  confidence?: number;
  monitor_reached?: boolean;
  error_hint?: string;
};

/** XAI from `integration_kh` `/explain_wav` (waveform + mel + Grad-CAM when model loads). */
type XaiPayload = {
  spectrogram_png_b64?: string;
  waveform_png_b64?: string;
  frequency_summary?: Record<string, number>;
  caption?: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  /** User sent an image; `text` is the UI transcript (vision caption + optional note). */
  kind?: "photo";
  /** Present on assistant bubbles that follow a voice turn (for verification). */
  voiceMood?: VoiceMoodPayload | null;
  xai?: XaiPayload | null;
  /** Text-chat: minimal keystroke summary shown to user. */
  keystrokeUi?: { decision: "normal" | "manic" | "depressed"; risk_level: string; n_keystrokes: number } | null;
  crisis?: { notified: boolean; smsSent: boolean };
};

const PHASE_LABELS: Record<"fr" | "en", Record<VoicePhase, string>> = {
  fr: { manic: "maniaque", neutral: "neutre", depressive: "depressif" },
  en: { manic: "manic", neutral: "neutral", depressive: "depressive" }
};

const MAX_KEYSTROKE_EVENTS = 400;

type KeystrokeEvt = { k: string; t: number; u?: number };

function normalizeDecisionLabel(v: unknown): "normal" | "manic" | "depressed" {
  const s = String(v || "").trim().toLowerCase();
  if (s.includes("manic")) return "manic";
  if (s.includes("depress")) return "depressed";
  return "normal";
}

function buildKeystrokeUi(
  resKeystroke: unknown,
  forwardedCount: number
): { decision: "normal" | "manic" | "depressed"; risk_level: string; n_keystrokes: number } | null {
  if (forwardedCount === 0 && (resKeystroke === undefined || resKeystroke === null)) return null;
  const obj =
    resKeystroke != null && typeof resKeystroke === "object" && !Array.isArray(resKeystroke)
      ? (resKeystroke as Record<string, unknown>)
      : {};
  const decision = normalizeDecisionLabel(obj.decision ?? obj.m3_pred ?? obj.m2_pred);
  const riskLevel = String(obj.risk_level || (decision === "normal" ? "Euthymic" : "Moderate - Monitor"));
  const ks = Number(obj.n_keystrokes ?? obj.n_events ?? forwardedCount);
  return {
    decision,
    risk_level: riskLevel,
    n_keystrokes: Number.isFinite(ks) ? Math.max(0, Math.round(ks)) : forwardedCount
  };
}

/** One-line bipolar_phase_monitor summary for patients (no raw JSON). */
function voiceMonitorSummaryLine(mood: VoiceMoodPayload | null | undefined, isFr: boolean): string {
  if (!mood) return "";
  const raw = String(mood.phase || mood.raw_phase || "").toLowerCase().trim();
  const phaseKey =
    raw === "manic" || raw === "neutral" || raw === "depressive"
      ? (raw as VoicePhase)
      : null;
  const phaseWord = phaseKey ? (isFr ? PHASE_LABELS.fr[phaseKey] : PHASE_LABELS.en[phaseKey]) : raw || (isFr ? "indetermine" : "unknown");
  const conf =
    typeof mood.confidence === "number" && Number.isFinite(mood.confidence) ? mood.confidence : null;
  if (mood.monitor_reached === false && mood.error_hint) {
    return isFr ? `${phaseWord} (${mood.error_hint})` : `${phaseWord} (${mood.error_hint})`;
  }
  if (conf != null) {
    return isFr ? `${phaseWord} — confiance ${conf.toFixed(2)}` : `${phaseWord} — confidence ${conf.toFixed(2)}`;
  }
  return phaseWord;
}

/** Under-16 experience (avatar-under16, no text/photo chat): age strictly below 16. Age 16+ uses avatar-over16 and full chat. */
function isUnder16(age: number | null | undefined): boolean {
  return typeof age === "number" && age < 16;
}

function pickNavigateTo(res: { navigate_to?: unknown; navigateTo?: unknown }): string | undefined {
  const v = res.navigate_to ?? res.navigateTo;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.startsWith("/") ? t : undefined;
}

export default function CompanionChat() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isFr = language === "fr";
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [xaiGalleryOpen, setXaiGalleryOpen] = useState(false);
  // Text of the assistant message currently being read aloud ("" = none)
  const [ttsPlayingText, setTtsPlayingText] = useState<string>("");
  // Whether auto-play TTS is enabled — ref for stale-closure-free access in callbacks
  const ttsAutoPlayRef = useRef(true);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const keystrokeEventsRef = useRef<KeystrokeEvt[]>([]);
  const keystrokeDownIndexRef = useRef<Record<string, number[]>>({});
  const backspaceCountRef = useRef(0);

  const under = isUnder16(user?.age);
  const ageMissing = user?.age === null || user?.age === undefined;

  /** Tous les tours vocaux qui ont des images XAI (pas affichés dans le fil). */
  const xaiVoiceTurns = useMemo(() => {
    const out: {
      index: number;
      userText: string;
      voiceMood: VoiceMoodPayload | null;
      xai: XaiPayload;
    }[] = [];
    let n = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "assistant" || !m.xai) continue;
      if (!m.xai.waveform_png_b64?.trim() && !m.xai.spectrogram_png_b64?.trim()) continue;
      const prev = i > 0 ? messages[i - 1] : null;
      const userText = prev?.role === "user" ? prev.text : isFr ? "(message vocal)" : "(voice message)";
      n += 1;
      out.push({ index: n, userText, voiceMood: m.voiceMood ?? null, xai: m.xai });
    }
    return out;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, transcriptOpen]);

  useEffect(() => {
    if (user && user.role !== "PATIENT") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => () => stopChatTts(), []);

  // Persist crisis flag to localStorage so the dashboard can show the popup
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.crisis?.notified && user?.id) {
      localStorage.setItem(`bb_crisis_${user.id}`, Date.now().toString());
    }
  }, [messages, user?.id]);

  // Reset ttsPlayingText if audio stops externally (network error, manual stop, etc.)
  useEffect(() => {
    if (!ttsPlayingText) return;
    const id = setInterval(() => {
      if (!isChatTtsPlaying()) setTtsPlayingText("");
    }, 300);
    return () => clearInterval(id);
  }, [ttsPlayingText]);

  /** Toggle TTS auto-play on/off. Stopping also kills the current audio. */
  const toggleTtsAutoPlay = useCallback(() => {
    const next = !ttsAutoPlayRef.current;
    ttsAutoPlayRef.current = next;
    setTtsAutoPlay(next);
    if (!next) {
      // Disabling: stop whatever is playing right now
      stopChatTts();
      setTtsPlayingText("");
    }
  }, []);

  /** Play a specific text via TTS — only when auto-play is enabled, or when called explicitly via the Read button. */
  const playMsgTts = useCallback((text: string, lang?: string | null, force = false) => {
    if (!force && !ttsAutoPlayRef.current) return; // auto-play disabled
    stopChatTts();
    setTtsPlayingText(text);
    void playChatTts(text, lang, () => setTtsPlayingText(""));
  }, []);

  const sendText = useCallback(async () => {
    const text = input.trim();
    if (!text || under) return;
    const keystrokeSnapshot = [...keystrokeEventsRef.current];
    const firstTs = keystrokeSnapshot[0]?.t;
    const lastTs = keystrokeSnapshot[keystrokeSnapshot.length - 1]?.t;
    setError(null);
    setLoading(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const res = await apiFetch<{
        reply: string;
        threadId: string;
        lang?: string;
        keystroke?: unknown;
        crisis_support_notified?: boolean;
        twilio_alert_sent?: boolean;
        navigate_to?: string;
        navigateTo?: string;
      }>("/chat", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          threadId: threadId ?? undefined,
          keystroke_events: keystrokeSnapshot,
          keystroke_session:
            keystrokeSnapshot.length > 0
              ? {
                  event_count: keystrokeSnapshot.length,
                  n_keystrokes: keystrokeSnapshot.length,
                  n_backspace: backspaceCountRef.current,
                  n_autocorrect: 0,
                  n_corrections: backspaceCountRef.current,
                  first_ts: firstTs,
                  last_ts: lastTs,
                  duration_ms: firstTs != null && lastTs != null ? lastTs - firstTs : undefined
                }
              : undefined
        })
      });
      keystrokeEventsRef.current = [];
      keystrokeDownIndexRef.current = {};
      backspaceCountRef.current = 0;
      setThreadId(res.threadId);
      const keystrokeUi = buildKeystrokeUi(res.keystroke, keystrokeSnapshot.length);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.reply,
          keystrokeUi,
          crisis: {
            notified: Boolean(res.crisis_support_notified),
            smsSent: Boolean(res.twilio_alert_sent)
          }
        }
      ]);
      playMsgTts(res.reply, res.lang ?? user?.language);
      const nav = pickNavigateTo(res);
      if (nav) window.setTimeout(() => router.push(nav), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : isFr ? "Requete echouee" : "Request failed";
      setError(msg);
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, threadId, under, user?.language, isFr, router]);

  const stopRecording = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") return;
    rec.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (!blob.size) return;
        setLoading(true);
        try {
          const form = new FormData();
          form.append("file", blob, "voice.webm");
          if (threadId) form.append("threadId", threadId);
          const res = await apiUploadFile<{
            reply: string;
            transcript: string;
            threadId: string;
            lang?: string;
            voice_mood?: VoiceMoodPayload | null;
            xai?: XaiPayload | null;
            crisis_support_notified?: boolean;
            twilio_alert_sent?: boolean;
            navigate_to?: string;
            navigateTo?: string;
          }>("/chat/voice", form);
          setThreadId(res.threadId);
          const mood = res.voice_mood && typeof res.voice_mood === "object" ? res.voice_mood : null;
          const xai =
            res.xai && typeof res.xai === "object"
              ? {
                  spectrogram_png_b64: String(res.xai.spectrogram_png_b64 || ""),
                  waveform_png_b64: String(res.xai.waveform_png_b64 || ""),
                  frequency_summary:
                    res.xai.frequency_summary && typeof res.xai.frequency_summary === "object"
                      ? (res.xai.frequency_summary as Record<string, number>)
                      : undefined,
                  caption: String(res.xai.caption || "")
                }
              : null;
          setMessages((m) => [
            ...m,
            { role: "user", text: res.transcript || (isFr ? "(vocal)" : "(voice)") },
            {
              role: "assistant",
              text: res.reply,
              voiceMood: mood,
              xai,
              crisis: {
                notified: Boolean(res.crisis_support_notified),
                smsSent: Boolean(res.twilio_alert_sent)
              }
            }
          ]);
          playMsgTts(res.reply, res.lang ?? user?.language);
          const nav = pickNavigateTo(res);
          if (nav) window.setTimeout(() => router.push(nav), 0);
        } catch (e) {
          setError(e instanceof Error ? e.message : isFr ? "Envoi vocal echoue" : "Voice upload failed");
        } finally {
          setLoading(false);
        }
      };
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : isFr ? "Acces micro refuse" : "Microphone access denied");
    }
  }, [threadId, user?.language, isFr, router]);

  const sendPhoto = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      const note = input.trim();
      try {
        const form = new FormData();
        form.append("file", file, file.name || "photo.jpg");
        if (threadId) form.append("threadId", threadId);
        if (note) form.append("message", note);
        const res = await apiUploadFile<{
          reply: string;
          transcript: string;
          threadId: string;
          image_caption?: string;
          crisis_support_notified?: boolean;
          twilio_alert_sent?: boolean;
          navigate_to?: string;
          navigateTo?: string;
        }>("/chat/image", form);
        setThreadId(res.threadId);
        if (note) setInput("");
        setMessages((m) => [
          ...m,
          { role: "user", text: res.transcript || (isFr ? "(Photo)" : "(Photo)"), kind: "photo" },
          {
            role: "assistant",
            text: res.reply,
            crisis: {
              notified: Boolean(res.crisis_support_notified),
              smsSent: Boolean(res.twilio_alert_sent)
            }
          }
        ]);
        playMsgTts(res.reply, user?.language);
        const nav = pickNavigateTo(res);
        if (nav) window.setTimeout(() => router.push(nav), 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : isFr ? "Envoi photo echoue" : "Photo upload failed");
      } finally {
        setLoading(false);
      }
    },
    [threadId, input, user?.language, isFr, router]
  );

  const onPhotoFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) void sendPhoto(f);
    },
    [sendPhoto]
  );

  if (!user || user.role !== "PATIENT") {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={isFr
          ? "Joindre une photo pour la description visuelle et la reponse"
          : "Attach a photo for the vision caption and reply"}
        onChange={onPhotoFileChange}
      />
      <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-3 py-2 backdrop-blur-sm sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-textPrimary sm:text-lg">{isFr ? "Compagnon" : "Companion"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Persistent TTS toggle — always visible, shows current state */}
            <button
              type="button"
              onClick={toggleTtsAutoPlay}
              title={ttsAutoPlay
                ? (isFr ? "Désactiver la lecture vocale" : "Disable voice reading")
                : (isFr ? "Activer la lecture vocale" : "Enable voice reading")}
              className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition-all ${
                ttsAutoPlay && ttsPlayingText
                  ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 animate-pulse"
                  : ttsAutoPlay
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {ttsAutoPlay && ttsPlayingText
                ? `⏹ ${isFr ? "Arrêter" : language === "ar" ? "إيقاف" : "Stop"}`
                : ttsAutoPlay
                ? `🔊 ${isFr ? "Vocal actif" : language === "ar" ? "الصوت نشط" : "Voice on"}`
                : `🔇 ${isFr ? "Vocal désactivé" : language === "ar" ? "الصوت مُعطَّل" : "Voice off"}`}
            </button>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {under ? (isFr ? "Moins de 16" : "Under 16") : "16+"}
            </span>
          </div>
        </div>
        {ageMissing && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950 sm:text-xs">
            {isFr
              ? "Ajoutez votre age dans Parametres → Profil pour choisir le bon avatar et experience."
              : "Add your age in Settings → Profile so we can pick the right avatar and experience."}
          </p>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <CompanionAvatarCanvas under16={under} recording={recording} className="h-full w-full" />

        {!transcriptOpen && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-2 sm:bottom-6">
            <ButtonPrimary
              type="button"
              variant="secondary"
              className={`shadow-lg ${recording ? "!bg-red-100 !text-red-800" : "bg-white/95"}`}
              onClick={() => {
                if (recording) void stopRecording();
                else void startRecording();
              }}
              disabled={loading}
            >
              {recording ? (isFr ? "Stop" : "Stop") : isFr ? "Voix" : "Voice"}
            </ButtonPrimary>
            <ButtonPrimary
              type="button"
              variant="secondary"
              className="bg-white/95 shadow-lg"
              onClick={() => photoInputRef.current?.click()}
              disabled={loading}
            >
              {isFr ? "Photo" : "Photo"}
            </ButtonPrimary>
            <ButtonPrimary
              type="button"
              className="shadow-lg"
              onClick={() => setTranscriptOpen(true)}
              disabled={loading}
            >
              {under ? (isFr ? "Voir la transcription" : "Show transcript") : isFr ? "Voir le chat" : "Show chat"}
            </ButtonPrimary>
          </div>
        )}

        {transcriptOpen && (
          <div
            className="absolute bottom-3 right-3 z-20 flex h-[min(48vh,420px)] w-[min(calc(100vw-1.5rem),380px)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md sm:bottom-4 sm:right-4"
            role="region"
            aria-label={isFr ? "Conversation" : "Conversation"}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{isFr ? "Conversation" : "Conversation"}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setXaiGalleryOpen(true)}
                  disabled={xaiVoiceTurns.length === 0}
                  title={
                    xaiVoiceTurns.length === 0
                      ? isFr
                        ? "Aucun vocal avec XAI pour le moment (enregistrez un message vocal avec le moniteur actif)."
                        : "No voice turns with XAI yet (record a voice message with the monitor active)."
                      : isFr
                      ? "Ouvrir tous les spectrogrammes, Grad-CAM et waveforms des vocaux de cette session."
                      : "Open all spectrograms, Grad-CAM, and waveforms for voice turns in this session."
                  }
                  className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isFr ? "XAI — tous les vocaux" : "XAI — all voice turns"} ({xaiVoiceTurns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptOpen(false)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  {isFr ? "Masquer" : "Hide"}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">{error}</div>
              )}
              {messages.length === 0 && (
                <p className="text-xs text-textSecondary">
                  {under
                    ? isFr
                      ? "Utilisez Voix ou envoyez une photo (note optionnelle). Ouvrez ce panneau pour lire les reponses. Le chat texte est disponible a partir de 16 ans."
                      : "Use Voice, or send a Photo (optional note in the box). Open this panel to read replies. Text chat is available from age 16."
                    : isFr
                    ? "Saisissez un message, utilisez Voix, ou envoyez une photo (note optionnelle — description visuelle + reponse)."
                    : "Type a message, use Voice, or send a Photo (optional note in the box — vision caption + reply)."}
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={`${msg.role}-${i}`}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div className="flex max-w-[92%] flex-col gap-1">
                    <div
                      className={
                        msg.role === "user"
                          ? "rounded-xl rounded-br-sm bg-primary px-2.5 py-1.5 text-xs text-white"
                          : "rounded-xl rounded-bl-sm border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs text-textPrimary"
                      }
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase opacity-80">
                          {msg.role === "user"
                            ? msg.kind === "photo"
                              ? isFr ? "Vous — photo" : "You — photo"
                              : isFr ? "Vous" : "You"
                            : isFr ? "Assistant" : "Assistant"}
                        </span>
                        {msg.role === "assistant" && (
                          ttsPlayingText === msg.text ? (
                            <button type="button"
                              onClick={() => { stopChatTts(); setTtsPlayingText(""); }}
                              className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 animate-pulse transition-colors">
                              ⏹ {isFr ? "Arrêter" : language === "ar" ? "إيقاف" : "Stop"}
                            </button>
                          ) : (
                            <button type="button"
                              onClick={() => playMsgTts(msg.text, user?.language, true)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 transition-colors">
                              🔊 {isFr ? "Lire" : language === "ar" ? "قراءة" : "Read"}
                            </button>
                          )
                        )}
                      </div>
                      <span className="whitespace-pre-wrap">{msg.text}</span>
                    </div>
                    {msg.role === "assistant" && msg.crisis?.notified && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-950">
                        {isFr ? "Alerte securite (serveur)" : "Safety alert (server)"}:{" "}
                        {msg.crisis.smsSent
                          ? isFr
                            ? "Le numero superviseur enregistre a ete notifie via Twilio (secours API)."
                            : "Your saved supervisor number was notified via Twilio (API fallback)."
                          : isFr
                          ? "Contact durgence notifie sur WhatsApp (apres signaux repetes; Twilio cote service RAG)."
                          : "Emergency contact notified on WhatsApp (after repeated crisis signals; Twilio on RAG service)."}
                      </div>
                    )}
                    {/* Technical analysis data is intentionally not shown to the patient
                        — it is available to the doctor in the patient report tab. */}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs text-textSecondary">
                    {isFr ? "Reflexion…" : "Thinking…"}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 border-t border-slate-200/80 bg-white/90 px-3 py-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <InputField
                    label={
                      under
                        ? isFr
                          ? "Note optionnelle (avec photo)"
                          : "Optional note (with Photo)"
                        : isFr
                        ? "Votre message"
                        : "Your message"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      under
                        ? isFr
                          ? "Texte optionnel envoye uniquement avec la prochaine photo…"
                          : "Optional text sent only with your next photo…"
                        : isFr
                        ? "Tapez un message…"
                        : "Type a message…"
                    }
                    onKeyDown={
                      under
                        ? undefined
                        : (e) => {
                            const evts = keystrokeEventsRef.current;
                            const keyId = e.code || e.key;
                            const evt: KeystrokeEvt = { k: e.key, t: Date.now() };
                            evts.push(evt);
                            const idx = evts.length - 1;
                            const downMap = keystrokeDownIndexRef.current;
                            if (!downMap[keyId]) downMap[keyId] = [];
                            downMap[keyId].push(idx);
                            if (e.key === "Backspace") {
                              backspaceCountRef.current += 1;
                            }
                            if (evts.length > MAX_KEYSTROKE_EVENTS) {
                              keystrokeEventsRef.current = evts.slice(-MAX_KEYSTROKE_EVENTS);
                              keystrokeDownIndexRef.current = {};
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendText();
                            }
                          }
                    }
                    onKeyUp={
                      under
                        ? undefined
                        : (e) => {
                            const keyId = e.code || e.key;
                            const stack = keystrokeDownIndexRef.current[keyId];
                            if (!stack || stack.length === 0) return;
                            const idx = stack.pop();
                            if (idx == null) return;
                            const evt = keystrokeEventsRef.current[idx];
                            if (evt && evt.u == null) evt.u = Date.now();
                          }
                    }
                  />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ButtonPrimary
                    type="button"
                    variant="secondary"
                    className={recording ? "!bg-red-100 !text-red-800" : ""}
                    onClick={() => {
                      if (recording) void stopRecording();
                      else void startRecording();
                    }}
                    disabled={loading}
                  >
                    {recording ? (isFr ? "Stop" : "Stop") : isFr ? "Voix" : "Voice"}
                  </ButtonPrimary>
                  <ButtonPrimary
                    type="button"
                    variant="secondary"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={loading}
                  >
                    {isFr ? "Photo" : "Photo"}
                  </ButtonPrimary>
                  {!under && (
                    <ButtonPrimary type="button" onClick={() => void sendText()} disabled={loading || !input.trim()}>
                      {isFr ? "Envoyer" : "Send"}
                    </ButtonPrimary>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {xaiGalleryOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="xai-gallery-title"
            onClick={() => setXaiGalleryOpen(false)}
          >
            <div
              className="flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <h2 id="xai-gallery-title" className="text-sm font-semibold text-slate-900">
                  {isFr ? "XAI — tous les vocaux" : "XAI — all voice turns"} ({xaiVoiceTurns.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setXaiGalleryOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {isFr ? "Fermer" : "Close"}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {xaiVoiceTurns.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    {isFr
                      ? "Aucun enregistrement vocal avec images XAI dans cette session. Verifiez que le moniteur ("
                      : "No voice recordings with XAI images in this session. Check that the monitor ("}
                    <code className="rounded bg-slate-100 px-1">integration_kh</code>)
                    {isFr ? " repond sur " : " is responding at "}
                    <code className="rounded bg-slate-100 px-1">BIPOLAR_MONITOR_URL</code>.
                  </p>
                ) : (
                  <div className="space-y-8">
                    {xaiVoiceTurns.map((turn) => (
                      <section
                        key={turn.index}
                        className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-3 shadow-sm"
                      >
                        <h3 className="text-xs font-bold uppercase tracking-wide text-violet-900">
                          {isFr ? "Vocal" : "Voice"} #{turn.index}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-700">
                          <span className="font-semibold text-slate-800">
                            {isFr ? "Transcription" : "Transcript"}: {" "}
                          </span>
                          <span className="whitespace-pre-wrap">{turn.userText}</span>
                        </p>
                        {turn.voiceMood ? (
                          <p className="mt-2 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-[11px] font-medium text-slate-800">
                            {voiceMonitorSummaryLine(turn.voiceMood, isFr)}
                          </p>
                        ) : null}
                        {turn.xai.caption ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-violet-950">{turn.xai.caption}</p>
                        ) : null}
                        {turn.xai.waveform_png_b64 ? (
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] font-semibold text-violet-900">
                              {isFr
                                ? "Forme d'onde (zones saillantes / Grad-CAM projete)"
                                : "Waveform (salient zones / projected Grad-CAM)"}
                            </div>
                            <img
                              src={b64PngDataUrl(turn.xai.waveform_png_b64)}
                              alt={isFr ? `Forme d'onde vocal ${turn.index}` : `Voice waveform ${turn.index}`}
                              className="w-full rounded-lg border border-violet-200 object-contain"
                            />
                          </div>
                        ) : null}
                        {turn.xai.spectrogram_png_b64 ? (
                          <div className="mt-3">
                            <div className="mb-1 text-[10px] font-semibold text-violet-900">
                              {isFr
                                ? "Spectrogramme mel + Grad-CAM (CNN tachyphemia)"
                                : "Mel spectrogram + Grad-CAM (tachyphemia CNN)"}
                            </div>
                            <img
                              src={b64PngDataUrl(turn.xai.spectrogram_png_b64)}
                              alt={isFr ? `Spectrogramme vocal ${turn.index}` : `Voice spectrogram ${turn.index}`}
                              className="w-full rounded-lg border border-violet-200 object-contain"
                            />
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
