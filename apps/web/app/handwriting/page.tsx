"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../../components/Navbar";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";
import { apiFetch } from "../../lib/api";

const HANDWRITING_API = process.env.NEXT_PUBLIC_HANDWRITING_API_URL || "http://localhost:5002";

const MIN_POINTS = 80;
const MIN_PATH = 400;
const MIN_LOOPS = 25;
const TARGET_LOOPS = 25;

interface Point {
  x: number;
  y: number;
  t: number;
  pressure: number;
  pen_down: boolean;
}

interface QCResult {
  nPoints: number;
  duration: number;
  pathLen: number;
  loops: number;
  countedLoops: number;
  confidence: number;
}

interface ApiResult {
  score?: number;
  threshold?: number;
  qc_confidence?: number;
  deviation?: boolean;
  alert_j1?: boolean;
  alert_confirmed?: boolean;
  consecutive_count?: number;
  z_robust?: number;
  direction_prediction?: string;
  score_manie?: number;
  score_depression?: number;
  dre_confidence?: number;
  cusum_value?: number;
  cusum_alert?: boolean;
  status_label?: string;
  clinical_label?: string;
  message?: string;
  questionnaire_required?: string[];
  n_baseline?: number;
  baseline_complete?: boolean;
  remaining_sessions?: number;
  model_fitted?: boolean;
  error?: string;
}

interface QuestionItem {
  id: string;
  label: string;
  max_score: number;
  options: string[];
  non_scored?: boolean;
}

interface ScaleCatalog {
  items: QuestionItem[];
  cutoff?: number;
  max_total?: number;
  instructions?: string;
  functional_item?: { id: string; label: string; options: string[] };
}

interface QuestionnaireCatalog {
  language: string;
  scales: Record<string, ScaleCatalog>;
}

interface QuestionnaireScoreResult {
  ymrs_total?: number;
  madrs_total?: number;
  asrm_total?: number;
  phq9_total?: number;
  ymrs_label?: string;
  madrs_label?: string;
  asrm_label?: string;
  phq9_label?: string;
  direction?: string;
  clinical_label?: string;
  message?: string;
  stable_for_baseline?: boolean;
  baseline_complete?: boolean;
  remaining_sessions?: number;
  model_fitted?: boolean;
}

const SCALE_LABEL: Record<string, string> = {
  ymrs: "YMRS", madrs: "MADRS", asrm: "ASRM", phq9: "PHQ-9",
};

function useSpeech() {
  const speak = useCallback((text: string, lang = "fr-FR") => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const parseSpokenNumber = useCallback((text: string): number | null => {
    const normalized = text.toLowerCase().trim();
    const digitMatch = normalized.match(/\d+/);
    if (digitMatch) return Number(digitMatch[0]);
    const numMap: Record<string, number> = {
      "zéro": 0, "zero": 0,
      "un": 1, "une": 1,
      "deux": 2,
      "trois": 3,
      "quatre": 4,
      "cinq": 5,
      "six": 6,
      "sept": 7,
      "huit": 8,
      "neuf": 9,
    };
    const found = Object.entries(numMap).find(([k]) => normalized.includes(k));
    return found ? found[1] : null;
  }, []);

  const listen = useCallback((onResult: (num: number | null) => void) => {
    type SRConstructor = new () => {
      lang: string; interimResults: boolean; maxAlternatives: number;
      onresult: ((evt: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    };
    const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { onResult(null); return false; }
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let handled = false;
    rec.onresult = (evt) => {
      handled = true;
      const alts = evt.results[0];
      const altCount = Object.keys(alts).filter(k => !isNaN(Number(k))).length;
      for (let a = 0; a < altCount; a++) {
        const t = String(alts[a]?.transcript || "");
        const num = parseSpokenNumber(t);
        if (num !== null) { onResult(num); return; }
      }
      onResult(null);
    };
    rec.onerror = () => { handled = true; onResult(null); };
    rec.onend = () => { if (!handled) onResult(null); };
    rec.start();
    return true;
  }, [parseSpokenNumber]);

  return { speak, stopSpeaking, listen };
}

/* ── Questionnaire Modal ─────────────────────────────────────────────────── */
function QuestionnaireModal({
  required, onClose, onSubmit, apiBase, patientId, lang,
}: {
  required: string[];
  onClose: () => void;
  onSubmit: (result: QuestionnaireScoreResult) => void;
  apiBase: string;
  patientId: string;
  lang: string;
}) {
  const [catalog, setCatalog] = useState<QuestionnaireCatalog | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, number>>>({});
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [micFeedback, setMicFeedback] = useState("");
  const [isReading, setIsReading] = useState(false);
  const { speak, stopSpeaking, listen } = useSpeech();

  const questions: Array<QuestionItem & { scale: string; scaleInstructions?: string }> =
    catalog
      ? Object.entries(catalog.scales).flatMap(([scaleId, scale]) => [
          ...scale.items.map((item) => ({ ...item, scale: scaleId, scaleInstructions: scale.instructions })),
          ...(scale.functional_item
            ? [{
                id: scale.functional_item.id,
                label: scale.functional_item.label,
                max_score: scale.functional_item.options.length - 1,
                options: scale.functional_item.options,
                non_scored: true,
                scale: scaleId,
                scaleInstructions: scale.instructions,
              }]
            : []),
        ])
      : [];

  useEffect(() => {
    fetch(`${apiBase}/questionnaire_catalog?lang=${lang}&scales=${encodeURIComponent(required.join(","))}`)
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [required, apiBase]);

  const currentQ = questions[cursor];
  const totalQ = questions.length;

  const setAnswer = useCallback((scale: string, id: string, val: number) => {
    setAnswers((prev) => ({ ...prev, [scale]: { ...(prev[scale] || {}), [id]: val } }));
    setError("");
  }, []);

  const getAnswer = (scale: string, id: string): number | undefined => answers[scale]?.[id];
  const allAnswered = questions.every((q) => getAnswer(q.scale, q.id) !== undefined);

  const readCurrentQuestion = useCallback(() => {
    if (!currentQ) return;
    const optText = currentQ.options.map((o, i) => `${i} : ${o}`).join(". ");
    const text = `Question ${cursor + 1}. ${currentQ.label}. ${optText}`;
    setIsReading(true);
    speak(text, "fr-FR");
    const ms = Math.max(3000, text.split(" ").length * 450);
    setTimeout(() => setIsReading(false), ms);
  }, [currentQ, cursor, speak]);

  const handleStopReading = useCallback(() => {
    stopSpeaking();
    setIsReading(false);
  }, [stopSpeaking]);

  // Auto-read on question change (skip very first render)
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    if (currentQ) readCurrentQuestion();
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMic = useCallback(() => {
    if (!currentQ) return;
    stopSpeaking();
    setIsReading(false);
    setListening(true);
    setMicFeedback("🎙️ Écoute...");
    const ok = listen((num) => {
      setListening(false);
      if (num !== null && num >= 0 && num <= currentQ.max_score) {
        setAnswer(currentQ.scale, currentQ.id, num);
        setMicFeedback(`✅ Réponse sélectionnée : ${num}`);
        setTimeout(() => {
          setMicFeedback("");
          if (cursor < totalQ - 1) setCursor((c) => c + 1);
        }, 1200);
      } else {
        setMicFeedback(`❌ Non reconnu — dites un chiffre entre 0 et ${currentQ.max_score}`);
        setTimeout(() => setMicFeedback(""), 3000);
      }
    });
    if (!ok) {
      setListening(false);
      setMicFeedback("Micro non disponible dans ce navigateur");
      setTimeout(() => setMicFeedback(""), 3000);
    }
  }, [currentQ, cursor, totalQ, listen, setAnswer, stopSpeaking]);

  const handleSubmit = async () => {
    if (!allAnswered) { setError("Veuillez répondre à toutes les questions."); return; }
    stopSpeaking();
    setIsReading(false);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/questionnaires/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire_answers: answers, lang, patient_id: patientId }),
      });
      const data: QuestionnaireScoreResult = await res.json();
      onSubmit(data);
    } catch {
      setError("Erreur de connexion à l'API.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!catalog)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-2xl bg-white p-10 shadow-2xl text-sm text-gray-500">Chargement du questionnaire...</div>
      </div>
    );

  if (totalQ === 0)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-2xl bg-white p-10 shadow-2xl text-sm text-gray-500">
          Aucune question disponible.{" "}
          <button onClick={onClose} className="ml-2 text-blue-600 underline">Fermer</button>
        </div>
      </div>
    );

  const isFirstOfScale = cursor === 0 || questions[cursor - 1]?.scale !== currentQ?.scale;
  const scaleColor: Record<string, string> = {
    asrm: "bg-amber-500",
    phq9: "bg-violet-500",
    ymrs: "bg-orange-500",
    madrs: "bg-blue-500",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-4 px-7 py-5 flex-shrink-0 border-b border-gray-100">
          <div className={`h-3 w-3 rounded-full ${scaleColor[currentQ?.scale ?? ""] ?? "bg-gray-400"}`} />
          <div className="flex-1">
            <div className="text-base font-bold text-gray-900">
              {SCALE_LABEL[currentQ?.scale ?? ""] ?? "Questionnaire"}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Question {cursor + 1} sur {totalQ}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isReading ? (
              <button onClick={handleStopReading}
                className="flex items-center gap-1.5 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors animate-pulse">
                ⏹ Arrêter
              </button>
            ) : (
              <button onClick={readCurrentQuestion}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                🔊 Lire
              </button>
            )}
            <button onClick={() => { stopSpeaking(); onClose(); }}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-100 transition-colors">
              ✕ Fermer
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 flex-shrink-0 bg-gray-100">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${((cursor + 1) / totalQ) * 100}%`,
              background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            }}
          />
        </div>

        {/* Scale instructions */}
        {isFirstOfScale && currentQ?.scaleInstructions && (
          <div className="border-b border-indigo-50 bg-indigo-50/60 px-7 py-3 flex-shrink-0">
            <div className="text-[11px] text-indigo-700 leading-relaxed">
              {currentQ.scaleInstructions}
            </div>
          </div>
        )}

        {/* Question body */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
            {SCALE_LABEL[currentQ?.scale ?? ""]}
          </div>
          <div className="mb-6 text-lg font-semibold leading-snug text-gray-900">
            {currentQ?.label}
            {currentQ?.non_scored && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Non scoré
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {currentQ?.options.map((opt, i) => {
              const active = getAnswer(currentQ.scale, currentQ.id) === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    stopSpeaking();
                    setIsReading(false);
                    setAnswer(currentQ.scale, currentQ.id, i);
                  }}
                  className={`w-full rounded-2xl border-2 px-5 py-3.5 text-left text-sm transition-all duration-150 flex items-start gap-3 ${
                    active
                      ? "border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-200"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/40"
                  }`}
                >
                  <span className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full border-2 text-center text-xs font-bold leading-5 transition-all ${
                    active ? "border-indigo-500 bg-indigo-600 text-white scale-110" : "border-gray-300 bg-white text-gray-500"
                  }`}>
                    {i}
                  </span>
                  <span className={active ? "font-semibold text-indigo-900" : ""}>{opt}</span>
                </button>
              );
            })}
          </div>
          {error && <div className="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
        </div>

        {/* Voice + navigation footer */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50/50 px-7 py-4 rounded-b-3xl">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleMic}
              disabled={listening}
              className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
                listening
                  ? "border-red-300 bg-red-50 text-red-600 animate-pulse"
                  : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
              }`}
            >
              🎤 {listening ? "Écoute..." : "Répondre par micro"}
            </button>
            {micFeedback && (
              <span className={`text-sm font-medium ${micFeedback.includes("✅") ? "text-green-600" : "text-amber-700"}`}>
                {micFeedback}
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-400">Dites le chiffre (0–{currentQ?.max_score})</span>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => { stopSpeaking(); setIsReading(false); setCursor((c) => Math.max(0, c - 1)); }}
              disabled={cursor === 0}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              ← Précédent
            </button>
            {cursor < totalQ - 1 ? (
              <button
                onClick={() => {
                  if (getAnswer(currentQ.scale, currentQ.id) === undefined) {
                    setError("Veuillez sélectionner une réponse avant de continuer.");
                    return;
                  }
                  setError("");
                  stopSpeaking();
                  setIsReading(false);
                  setCursor((c) => c + 1);
                }}
                disabled={getAnswer(currentQ.scale, currentQ.id) === undefined}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                Suivant →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700 transition-colors"
              >
                {submitting ? "Envoi..." : "✓ Valider"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Drawing helpers ─────────────────────────────────────────────────────── */
function estimateLoopCount(rep: Point[]): number {
  if (rep.length < 12) return 0;
  const ys = rep.map((p) => p.y);
  const smooth = ys.map((_, i) => {
    const from = Math.max(0, i - 2);
    const to = Math.min(ys.length - 1, i + 2);
    let s = 0;
    for (let j = from; j <= to; j++) s += ys[j];
    return s / (to - from + 1);
  });
  const dy = smooth.slice(1).map((v, i) => v - smooth[i]);
  const signs = dy.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] === 0) signs[i] = signs[i - 1];
  }
  let peaks = 0;
  let troughs = 0;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i - 1] > 0 && signs[i] <= 0) peaks++;
    if (signs[i - 1] < 0 && signs[i] >= 0) troughs++;
  }
  return Math.max(0, Math.min(peaks, troughs));
}

function computePathLen(rep: Point[]): number {
  let path = 0;
  for (let i = 1; i < rep.length; i++) {
    const dx = rep[i].x - rep[i - 1].x;
    const dy = rep[i].y - rep[i - 1].y;
    path += Math.sqrt(dx * dx + dy * dy);
  }
  return path;
}

function computeQC(rep: Point[]): QCResult {
  if (rep.length < 2) return { nPoints: 0, duration: 0, pathLen: 0, loops: 0, countedLoops: 0, confidence: 0 };
  const n = rep.length;
  const dur = Math.max(0, rep[n - 1].t - rep[0].t);
  const path = computePathLen(rep);
  const loops = estimateLoopCount(rep);
  const countedLoops = Math.max(0, loops);
  let conf = 1.0;
  if (n < MIN_POINTS) conf -= 0.35;
  if (countedLoops < MIN_LOOPS) conf -= 0.30;
  if (path < MIN_PATH) conf -= 0.40;
  return { nPoints: n, duration: dur, pathLen: path, loops, countedLoops, confidence: Math.max(0, Math.min(1, conf)) };
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function HandwritingPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const th = uiText[language].handwritingPage;
  // Ref so callbacks always read current translations without re-creating on every language change
  const thRef = useRef(th);
  thRef.current = th;
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniTrajRef = useRef<HTMLCanvasElement>(null);
  const miniSpeedRef = useRef<HTMLCanvasElement>(null);

  const [patientId, setPatientId] = useState("");
  const [phase, setPhase] = useState<"baseline" | "monitoring">("baseline");
  const [baselineComplete, setBaselineComplete] = useState(false);
  const [sessionId] = useState(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `S_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  });

  const [repetitions, setRepetitions] = useState<Point[][]>([]);
  const [currentRep, setCurrentRep] = useState<Point[]>([]);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [status, setStatus] = useState({ msg: "", type: "ok" as "ok" | "warn" | "alert" | "info" });
  const [apiResult, setApiResult] = useState<ApiResult | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [questionnaireRequired, setQuestionnaireRequired] = useState<string[]>([]);
  const [questionnaireResult, setQuestionnaireResult] = useState<QuestionnaireScoreResult | null>(null);
  const [signupUnstable, setSignupUnstable] = useState(false);

  const drawingRef = useRef(false);
  const repStartTRef = useRef<number | null>(null);
  const currentRepRef = useRef<Point[]>([]);
  const pressureFallbackRef = useRef(false);
  const autoStoppedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    setPatientId(user.id);
    const saved = localStorage.getItem(`bb_handwriting_baseline_${user.id}`);
    if (saved === "complete") {
      setBaselineComplete(true);
      setPhase("monitoring");
    }
    const riskFlag = localStorage.getItem(`bb_signup_unstable_${user.id}`);
    setSignupUnstable(riskFlag === "1");
  }, [user?.id]);

  const setStatusMsg = useCallback((msg: string, type: "ok" | "warn" | "alert" | "info" = "ok") => {
    setStatus({ msg, type });
  }, []);

  // Set translated ready message whenever language changes
  useEffect(() => {
    setStatus((s) => s.msg === "" || s.msg === th.ready || s.type === "ok" ? { msg: th.ready, type: "ok" } : s);
  }, [th.ready]);

  useEffect(() => {
    fetch(`${HANDWRITING_API}/health`)
      .then((r) => setBackendOnline(r.ok))
      .catch(() => setBackendOnline(false));
  }, []);

  /* ── Canvas drawing ─────────────────────────────────────────────────── */
  const redrawMain = useCallback((rep: Point[]) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Baseline lines
    const baseY = Math.round(canvas.height * 0.68);
    const topY = Math.round(canvas.height * 0.25);
    ctx.strokeStyle = "#dde6f5";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(canvas.width, baseY); ctx.stroke();
    ctx.strokeStyle = "#edf2fa";
    ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(canvas.width, topY); ctx.stroke();

    if (rep.length < 2) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 1; i < rep.length; i++) {
      const a = rep[i - 1];
      const b = rep[i];
      if (!a.pen_down || !b.pen_down) continue;
      const w = Math.max(1.5, ((a.pressure + b.pressure) / 2) * 5.5);
      ctx.lineWidth = w;
      ctx.strokeStyle = "#3730a3";
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, []);

  const drawMiniTraj = useCallback((rep: Point[]) => {
    const canvas = miniTrajRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8faff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const drawn = rep.filter((p) => p.pen_down);
    if (drawn.length < 2) return;
    let mx = Infinity, my = Infinity, xx = -Infinity, xy = -Infinity;
    drawn.forEach((p) => { mx = Math.min(mx, p.x); my = Math.min(my, p.y); xx = Math.max(xx, p.x); xy = Math.max(xy, p.y); });
    const pad = 10;
    const w = Math.max(1, xx - mx);
    const h = Math.max(1, xy - my);
    const s = Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h);
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let i = 0; i < rep.length; i++) {
      const pt = rep[i];
      if (!pt.pen_down) continue;
      const prev = rep[i - 1];
      const x = pad + (pt.x - mx) * s;
      const y = pad + (pt.y - my) * s;
      if (!prev || !prev.pen_down) { ctx.beginPath(); ctx.moveTo(x, y); }
      else { ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); }
    }
  }, []);

  const drawMiniSpeed = useCallback((rep: Point[]) => {
    const canvas = miniSpeedRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8faff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (rep.length < 3) return;
    const speeds: number[] = [];
    for (let i = 1; i < rep.length; i++) {
      const dx = rep[i].x - rep[i - 1].x;
      const dy = rep[i].y - rep[i - 1].y;
      const dt = Math.max(0.001, rep[i].t - rep[i - 1].t);
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    const maxV = Math.max(...speeds, 1);
    const pad = 10;
    // Gradient line
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, "#6366f1");
    grad.addColorStop(1, "#8b5cf6");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    speeds.forEach((v, i) => {
      const x = pad + (i / Math.max(1, speeds.length - 1)) * (canvas.width - pad * 2);
      const y = canvas.height - pad - (v / maxV) * (canvas.height - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, []);

  const getCanvasXY = useCallback((evt: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (canvas.width / r.width),
      y: (evt.clientY - r.top) * (canvas.height / r.height),
    };
  }, []);

  const pushPoint = useCallback((evt: React.PointerEvent<HTMLCanvasElement>, penDown: boolean) => {
    const { x, y } = getCanvasXY(evt);
    const now = performance.now();
    if (repStartTRef.current === null) repStartTRef.current = now;
    let p = typeof evt.pressure === "number" ? evt.pressure : 0;
    if (p === 0) { pressureFallbackRef.current = true; p = 0.5; }
    const point: Point = {
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      t: parseFloat((now - (repStartTRef.current || now)).toFixed(2)),
      pressure: parseFloat(p.toFixed(4)),
      pen_down: penDown,
    };
    currentRepRef.current = [...currentRepRef.current, point];
    setCurrentRep([...currentRepRef.current]);
  }, [getCanvasXY]);

  const onPointerDown = useCallback((evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (sessionLocked) return;
    drawingRef.current = true;
    (evt.target as HTMLCanvasElement).setPointerCapture(evt.pointerId);
    pushPoint(evt, true);
    redrawMain(currentRepRef.current);
  }, [sessionLocked, pushPoint, redrawMain]);

  const onPointerMove = useCallback((evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || sessionLocked) return;
    pushPoint(evt, true);
    redrawMain(currentRepRef.current);
    drawMiniTraj(currentRepRef.current);
    drawMiniSpeed(currentRepRef.current);

    if (!autoStoppedRef.current && estimateLoopCount(currentRepRef.current) >= TARGET_LOOPS) {
      autoStoppedRef.current = true;
      drawingRef.current = false;
      const rep = [...currentRepRef.current];
      currentRepRef.current = [];
      repStartTRef.current = null;
      setRepetitions([rep]);
      setCurrentRep([]);
      setSessionLocked(true);
      redrawMain([]);
      drawMiniTraj([]);
      drawMiniSpeed([]);
      setStatusMsg(thRef.current.loopsDetected, "ok");
    }
  }, [sessionLocked, pushPoint, redrawMain, drawMiniTraj, drawMiniSpeed, setStatusMsg]);

  const onPointerUp = useCallback((evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || sessionLocked) return;
    drawingRef.current = false;
    pushPoint(evt, false);
    redrawMain(currentRepRef.current);
    drawMiniTraj(currentRepRef.current);
    drawMiniSpeed(currentRepRef.current);
  }, [sessionLocked, pushPoint, redrawMain, drawMiniTraj, drawMiniSpeed]);

  const finalizeRep = useCallback(() => {
    if (sessionLocked || currentRepRef.current.length < 2) return false;
    const rep = [...currentRepRef.current];
    currentRepRef.current = [];
    repStartTRef.current = null;
    setRepetitions([rep]);
    setCurrentRep([]);
    setSessionLocked(true);
    redrawMain([]); drawMiniTraj([]); drawMiniSpeed([]);
    return true;
  }, [sessionLocked, redrawMain, drawMiniTraj, drawMiniSpeed]);

  const handleFinish = useCallback(() => {
    const th = thRef.current;
    if (currentRepRef.current.length >= 2) {
      const qcNow = computeQC(currentRepRef.current);
      if (qcNow.countedLoops < TARGET_LOOPS) {
        setStatusMsg(th.minLoopsRequired, "alert");
        return;
      }
      finalizeRep();
    }
    setRepetitions((prev) => {
      if (prev.length === 0) { setStatusMsg(th.noRepCaptured, "alert"); return prev; }
      const last = prev[prev.length - 1];
      const qc = computeQC(last);
      if (qc.nPoints < MIN_POINTS) { setStatusMsg(`${th.tooShortPoints} (${qc.nPoints}/${MIN_POINTS})`, "warn"); return prev; }
      if (qc.pathLen < MIN_PATH) { setStatusMsg(`${th.tooShortLoops} (${qc.pathLen.toFixed(0)}/${MIN_PATH})`, "warn"); return prev; }
      if (qc.countedLoops < TARGET_LOOPS) { setStatusMsg(th.minLoopsRequired, "alert"); return prev; }
      setSessionLocked(true);
      setStatusMsg(`${th.sessionLockedReps} — ${prev.length}`, "ok");
      return prev;
    });
  }, [finalizeRep, setStatusMsg]);

  const handleReset = useCallback(() => {
    if (!confirm(thRef.current.confirmReset)) return;
    setRepetitions([]); currentRepRef.current = []; repStartTRef.current = null;
    pressureFallbackRef.current = false; autoStoppedRef.current = false;
    setCurrentRep([]); setSessionLocked(false); setApiResult(null);
    setQuestionnaireRequired([]); setQuestionnaireResult(null);
    setStatusMsg(thRef.current.ready, "ok");
    redrawMain([]); drawMiniTraj([]); drawMiniSpeed([]);
  }, [setStatusMsg, redrawMain, drawMiniTraj, drawMiniSpeed]);

  const handleClearRep = useCallback(() => {
    if (sessionLocked) return;
    currentRepRef.current = []; repStartTRef.current = null;
    setCurrentRep([]); redrawMain([]); drawMiniTraj([]); drawMiniSpeed([]);
    setStatusMsg(thRef.current.erased, "warn");
  }, [sessionLocked, setStatusMsg, redrawMain, drawMiniTraj, drawMiniSpeed]);

  const handleSend = useCallback(async () => {
    const th = thRef.current;
    if (!sessionLocked) { setStatusMsg(th.lockFirst, "warn"); return; }
    if (repetitions.length === 0) { setStatusMsg(th.noRepsToSend, "warn"); return; }
    const pid = patientId.trim();
    if (!pid) { setStatusMsg(th.patientIdRequired, "warn"); return; }

    const payload = {
      patient_id: pid,
      session_id: sessionId,
      phase,
      signup_unstable: signupUnstable,
      task_type: "letter_l",
      repetitions: repetitions.map((rep) => rep.map(({ pen_down, ...rest }) => ({ ...rest, pen_down }))),
    };

    setIsSending(true);
    setStatusMsg(th.sending, "info");

    try {
      // Always use the onboarding endpoint — the server determines if baseline
      // is complete and switches to monitoring mode automatically. This prevents
      // the localStorage "complete" flag from bypassing sessions 2 and 3.
      const url = `${HANDWRITING_API}/onboarding/${encodeURIComponent(pid)}/session`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: ApiResult = await res.json();

      if (!res.ok) {
        setStatusMsg(`${th.errorPrefix} ${res.status}: ${data.error || "?"}`, "warn");
        setApiResult(data);
      } else {
        setApiResult(data);
        if (data.baseline_complete && user?.id) {
          setBaselineComplete(true);
          setPhase("monitoring");
          localStorage.setItem(`bb_handwriting_baseline_${user.id}`, "complete");
        }
        const qReq = data.questionnaire_required ?? [];
        if (qReq.length > 0) {
          setQuestionnaireRequired(qReq);
          setStatusMsg(`${th.questRequired} ${qReq.join(", ")}`, "info");
        } else {
          setStatusMsg(th.resultReceived, "ok");
        }
        // Persist result to NestJS backend so the doctor can track history
        void apiFetch("/activity", {
          method: "POST",
          body: JSON.stringify({
            sleepHours: 0,
            energyLevel: 3,
            activityNotes: `[HANDWRITING_RESULT_JSON]\n${JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              session_id: sessionId,
              phase,
              state: data.alert_confirmed ? "alert_confirmed" : data.alert_j1 ? "alert_j1" : "stable",
              deviation: data.deviation ?? false,
              score: data.score,
              threshold: data.threshold,
              n_baseline: data.n_baseline,
              baseline_complete: data.baseline_complete,
              alert_j1: data.alert_j1 ?? false,
              alert_confirmed: data.alert_confirmed ?? false,
              clinical_label: data.clinical_label,
              status_label: data.status_label,
              direction_prediction: data.direction_prediction,
              score_manie: data.score_manie,
              score_depression: data.score_depression
            })}`
          })
        }).catch(() => { /* non-blocking — result is still shown locally */ });
      }
    } catch {
      setStatusMsg(th.cannotReach, "alert");
      setApiResult(null);
    } finally {
      setIsSending(false);
    }
  }, [sessionLocked, repetitions, patientId, sessionId, phase, setStatusMsg, user?.id]);

  const currentQC = computeQC(currentRep);
  const loopCount = estimateLoopCount(currentRep);
  const loopPct = Math.min(100, Math.round((loopCount / TARGET_LOOPS) * 100));

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col" style={{ background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)" }}>
        <Navbar />

        {/* Questionnaire modal */}
        {questionnaireRequired.length > 0 && (
          <QuestionnaireModal
            required={questionnaireRequired}
            apiBase={HANDWRITING_API}
            lang={language}
            onClose={() => setQuestionnaireRequired([])}
            onSubmit={(result) => {
              setQuestionnaireResult(result);
              setQuestionnaireRequired([]);
              if (phase === "baseline" && result.baseline_complete && user?.id) {
                setBaselineComplete(true);
                setPhase("monitoring");
                localStorage.setItem(`bb_handwriting_baseline_${user.id}`, "complete");
              }
              setStatusMsg(`${result.clinical_label ?? "✓"}`, "ok");
            }}
            patientId={patientId}
          />
        )}

        <div className="flex flex-1 flex-col max-w-7xl mx-auto w-full px-4 py-6 gap-5">

          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg text-lg">✍️</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{th.title}</h1>
                <p className="text-xs text-gray-500">{th.subtitle}</p>
              </div>
              {user?.name && (
                <span className="rounded-2xl bg-white/80 border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                  {user.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border ${
                backendOnline === null
                  ? "bg-gray-100 border-gray-200 text-gray-500"
                  : backendOnline
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-600"
              }`}>
                <span className={`h-2 w-2 rounded-full ${
                  backendOnline === null ? "bg-gray-400" : backendOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`} />
                {backendOnline === null ? th.serviceChecking : backendOnline ? th.serviceReady : th.serviceOffline}
              </span>
            </div>
          </div>

          {/* Main layout: canvas + sidebar */}
          <div className="flex flex-col xl:flex-row gap-5 flex-1">

            {/* ── Canvas Area ─────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 gap-4">

              {/* Instruction strip */}
              <div className="rounded-2xl bg-white/90 border border-indigo-100 px-5 py-3 shadow-sm flex items-center gap-4">
                <span className="font-mono text-2xl font-light tracking-[0.25em] text-indigo-400 select-none">lllllllllllllll</span>
                <div className="text-xs text-gray-500 border-l border-gray-200 pl-4">
                  {th.instructionStrip}
                </div>
              </div>

              {/* Canvas card */}
              <div className={`rounded-3xl overflow-hidden border-2 bg-white shadow-xl transition-all duration-300 ${
                sessionLocked
                  ? "border-emerald-400 shadow-emerald-100"
                  : "border-indigo-200 hover:border-indigo-300"
              }`}>
                {/* Canvas toolbar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-indigo-700">{th.inProgress}</span>
                    {sessionLocked && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                        {th.locked}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Loop progress */}
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${loopPct}%`,
                            background: loopCount >= TARGET_LOOPS
                              ? "linear-gradient(90deg,#10b981,#059669)"
                              : loopCount >= MIN_LOOPS
                              ? "linear-gradient(90deg,#f59e0b,#d97706)"
                              : "linear-gradient(90deg,#6366f1,#8b5cf6)",
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-600">{loopCount}/{TARGET_LOOPS}</span>
                    </div>
                    {currentRep.length > 1 && (
                      <span className="text-xs text-gray-400">
                        {((currentRep[currentRep.length - 1].t - currentRep[0].t) / 1000).toFixed(0)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* The actual canvas — large */}
                <canvas
                  ref={mainCanvasRef}
                  width={1400}
                  height={640}
                  style={{
                    width: "100%",
                    height: "480px",
                    display: "block",
                    touchAction: "none",
                    cursor: sessionLocked ? "default" : "crosshair",
                    background: "linear-gradient(180deg, #fafbff 0%, #ffffff 100%)",
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={(e) => { if (drawingRef.current) onPointerUp(e); }}
                />
              </div>

              {/* Status bar */}
              <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium shadow-sm ${
                status.type === "ok"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : status.type === "warn"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : status.type === "alert"
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-blue-50 text-blue-800 border border-blue-200"
              }`}>
                <span className="text-base">
                  {status.type === "ok" ? "🟢" : status.type === "warn" ? "🟡" : status.type === "alert" ? "🔴" : "🔵"}
                </span>
                {status.msg}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2.5">
                {!sessionLocked && (
                  <>
                    <button
                      onClick={() => { if (finalizeRep()) setStatusMsg(`${thRef.current.sessionLockedReps} #${repetitions.length + 1}`, "ok"); else setStatusMsg(thRef.current.noPointsDraw, "warn"); }}
                      className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm transition-all"
                    >
                      {th.validateRep}
                    </button>
                    <button
                      onClick={handleClearRep}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-all"
                    >
                      {th.erase}
                    </button>
                    <button
                      onClick={handleFinish}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-all"
                    >
                      {th.finishSession}
                    </button>
                  </>
                )}
                <button
                  onClick={handleReset}
                  className="rounded-2xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                >
                  {th.newSession}
                </button>
                {sessionLocked && (
                  <button
                    onClick={handleSend}
                    disabled={isSending}
                    className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-bold text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-md transition-all"
                  >
                    {isSending ? th.sending : th.send}
                  </button>
                )}
              </div>

              {/* Mini canvases — kept in DOM for data capture but hidden from patients */}
              <canvas ref={miniTrajRef} width={600} height={120} style={{ display: "none" }} />
              <canvas ref={miniSpeedRef} width={600} height={120} style={{ display: "none" }} />
            </div>

            {/* ── Right Sidebar ────────────────────────────────────────── */}
            <aside className="xl:w-80 flex-shrink-0 flex flex-col gap-4">

              {/* Session info card */}
              <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{th.sessionCard}</div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {user?.name?.[0]?.toUpperCase() || "P"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{user?.name || "Patient"}</div>
                    <div className="text-[11px] text-gray-400">ID: {patientId || "—"}</div>
                  </div>
                </div>

                {/* Instructions */}
                <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-gray-600">
                  <li className="flex gap-2"><span className="text-indigo-400">·</span> {th.instrA}</li>
                  <li className="flex gap-2"><span className="text-indigo-400">·</span> {th.instrB}</li>
                  <li className="flex gap-2"><span className="text-indigo-400">·</span> {th.instrC}</li>
                </ul>
              </div>

              {/* Results card */}
              <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm flex-1">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">{th.resultCard}</div>

                {!apiResult ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center text-gray-400">
                    <span className="text-4xl">✍️</span>
                    <div className="text-sm font-medium text-gray-500">{th.noResult}</div>
                    <div className="text-xs text-gray-400">{th.noResultSub}</div>
                    {!backendOnline && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-700">
                        <div className="font-semibold mb-1">⚠ Service hors ligne</div>
                        <code className="block rounded-lg bg-amber-100 px-2 py-1.5 font-mono text-[10px] mt-1">
                          npm run dev:handwriting
                        </code>
                        <div className="mt-1 text-amber-600">Port 5002</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold border ${
                      apiResult.error
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : apiResult.alert_confirmed
                        ? "bg-red-50 text-red-700 border-red-200"
                        : apiResult.alert_j1
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {apiResult.error
                        ? `⚠ ${apiResult.error}`
                        : apiResult.status_label || apiResult.clinical_label || th.resultCard}
                    </div>

                    {apiResult.message && (
                      <div className="rounded-xl bg-gray-50 px-4 py-2.5 text-xs text-gray-600 border border-gray-100">
                        {apiResult.message}
                      </div>
                    )}

                    {apiResult.n_baseline != null && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-xs text-indigo-800">
                        <div className="font-semibold mb-1">{th.calibration}</div>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3].map((n) => (
                            <div key={n} className={`h-2 flex-1 rounded-full ${(apiResult.n_baseline ?? 0) >= n ? "bg-indigo-500" : "bg-indigo-200"}`} />
                          ))}
                        </div>
                        <div className="mt-1">
                          {apiResult.n_baseline}/3 sessions
                          {apiResult.baseline_complete ? " — complète ✓" : ` — ${apiResult.remaining_sessions} restante(s)`}
                        </div>
                      </div>
                    )}

                    {apiResult.score != null && apiResult.threshold != null && (
                      <div>
                        <div className="mb-1 text-[10px] font-medium text-gray-500">{th.vsBaseline}</div>
                        <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (apiResult.score / apiResult.threshold) * 100).toFixed(1)}%`,
                              background: apiResult.deviation ? "#ef4444" : "#10b981",
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">
                          {apiResult.deviation ? th.aboveRange : th.withinRange}
                        </p>
                      </div>
                    )}

                    {apiResult.alert_j1 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
                        <div className="font-semibold">{th.firstDayAlert}</div>
                        <div className="mt-0.5">{th.comeBackTomorrow}</div>
                      </div>
                    )}

                    {apiResult.alert_confirmed && (
                      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-800">
                        <div className="font-semibold">{th.followUpSuggested}</div>
                        {apiResult.questionnaire_required?.length && (
                          <button onClick={() => setQuestionnaireRequired(apiResult.questionnaire_required!)} className="mt-1 underline font-semibold">
                            {th.openQuestionnaires}
                          </button>
                        )}
                      </div>
                    )}

                    {apiResult.questionnaire_required && apiResult.questionnaire_required.length > 0 && !questionnaireResult && (
                      <button
                        onClick={() => setQuestionnaireRequired(apiResult.questionnaire_required!)}
                        className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm"
                      >
                        {th.answerQuestionnaires}
                      </button>
                    )}
                  </div>
                )}

                {/* Questionnaire result */}
                {questionnaireResult && (
                  <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{th.yourAnswers}</div>
                    <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-semibold border ${
                      questionnaireResult.direction === "manic_risk"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : questionnaireResult.direction === "depressive_risk"
                        ? "bg-violet-50 text-violet-800 border-violet-200"
                        : questionnaireResult.direction === "mixed_risk"
                        ? "bg-orange-50 text-orange-800 border-orange-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {questionnaireResult.clinical_label}
                    </div>
                    <div className="space-y-2 text-xs">
                      {questionnaireResult.asrm_total != null && (
                        <div className="flex justify-between"><span className="text-gray-500">ASRM</span><span className="font-semibold">{questionnaireResult.asrm_total}/20 — {questionnaireResult.asrm_label}</span></div>
                      )}
                      {questionnaireResult.phq9_total != null && (
                        <div className="flex justify-between"><span className="text-gray-500">PHQ-9</span><span className="font-semibold">{questionnaireResult.phq9_total}/27 — {questionnaireResult.phq9_label}</span></div>
                      )}
                    </div>
                    <div className="mt-2 text-[10px] text-gray-400">{questionnaireResult.message}</div>
                  </div>
                )}

                <p className="mt-5 text-[10px] leading-relaxed text-gray-400">{th.clinicalSupport}</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
