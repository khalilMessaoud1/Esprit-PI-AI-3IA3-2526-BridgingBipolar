"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import Button from "../../../../components/Button";
import { useLanguage } from "../../../../hooks/useLanguage";
import { uiText } from "../../../../lib/i18n";
import { b64PngDataUrl } from "../../../../lib/voicePhaseReport";
import MouseRhythmPanel from "../../../../components/dashboard/MouseRhythmPanel";
import { type MouseBehavior, type MouseState, type MouseLevel } from "../../../../hooks/useMouseTracker";

type Tab = "about" | "report" | "medications" | "appointments";

const SLEEP_FEATURE_ORDER = [
  "sleep_mean",
  "sleep_std",
  "sleep_min",
  "sleep_max",
  "wake_mean",
  "wake_IV",
  "sleep_IV",
  "act_mean",
  "act_std",
  "social_jet_lag",
  "relative_amplitude",
  "sleep_trend",
  "act_trend",
  "corr_sleep_activity"
];

function formatMetricKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function orderedFeatureEntries(features: Record<string, number>): [string, number][] {
  const seen = new Set<string>();
  const out: [string, number][] = [];
  for (const k of SLEEP_FEATURE_ORDER) {
    if (k in features) {
      out.push([k, features[k] as number]);
      seen.add(k);
    }
  }
  const rest = Object.keys(features)
    .filter((k) => !seen.has(k))
    .sort();
  for (const k of rest) {
    out.push([k, features[k] as number]);
  }
  return out;
}

export default function DoctorPatientDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const d = t.detail;
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar" : "en-US";
  const [tab, setTab] = useState<Tab>("about");
  const [data, setData] = useState<{
    patient: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      age: number | null;
      bio: string | null;
      moodEntries: { id: string; moodLevel: number; note: string | null; createdAt: string }[];
      medications: { id: string; name: string; dosage: string; frequency: string; time: string }[];
      assessments: { id: string; type: string; score: number; createdAt: string }[];
      activityLogs: { id: string; sleepHours: number; energyLevel: number; activityNotes: string | null; createdAt: string }[];
      mouseBehaviorLogs: { id: string; date: string; state: string; score: number; level: string; windowCount: number; anomalyPct: number; savedAt: string }[];
    };
    notes: { id: string; body: string; createdAt: string }[];
    appointments: { id: string; startAt: string; endAt: string; status: string }[];
    reports: {
      voiceXaiReport: {
        createdAt: string;
        model: string;
        phase?: string;
        rawPhase?: string;
        confidence?: number;
        monitorReached?: boolean;
        errorHint?: string;
        caption?: string;
        frequencySummary?: Record<string, number>;
        waveformPngB64?: string;
        spectrogramPngB64?: string;
        transcript?: string;
        assistantReply?: string;
      } | null;
      sleepActivityReport:
        | { createdAt: string; format: "structured"; riskLevel: string; alert: boolean; anomalyScore?: number; reconstructionError?: number; globalThreshold?: number; features?: Record<string, number>; narrative?: string; }
        | { createdAt: string; format: "legacy"; rawText: string; }
        | null;
      voiceHistory: { createdAt: string; phase?: string; confidence?: number; monitorReached?: boolean; errorHint?: string }[];
      sleepHistory: { createdAt: string; riskLevel: string; alert: boolean; anomalyScore?: number }[];
      handwritingHistory: { createdAt: string; date: string; phase: string; state: string; alertConfirmed: boolean; alertJ1: boolean; clinicalLabel?: string; statusLabel?: string; score?: number; threshold?: number; nBaseline?: number; directionPrediction?: string }[];
    };
  } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Build a MouseBehavior from the patient's most recent log (or pending if none)
  const patientBehavior = useMemo((): MouseBehavior => {
    const logs = data?.patient.mouseBehaviorLogs ?? [];
    if (logs.length === 0) return { state: "pending", score: 0, level: "Low", windowCount: 0, anomalyPct: 0, connected: false, eventCount: 0, lastUpdated: null };
    const latest = logs[0];
    const validStates: MouseState[] = ["normal", "manic", "depressed", "pending"];
    const validLevels: MouseLevel[] = ["Low", "Mild", "Moderate", "High"];
    return {
      state: validStates.includes(latest.state as MouseState) ? (latest.state as MouseState) : "pending",
      score: Number(latest.score) || 0,
      level: validLevels.includes(latest.level as MouseLevel) ? (latest.level as MouseLevel) : "Low",
      windowCount: Number(latest.windowCount) || 0,
      anomalyPct: Number(latest.anomalyPct) || 0,
      lastUpdated: new Date(latest.savedAt),
      connected: true,
      eventCount: 0
    };
  }, [data?.patient.mouseBehaviorLogs]);

  const load = () => {
    apiFetch<NonNullable<typeof data>>(`/doctor/patients/${id}`)
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, [id]);

  const saveNote = async () => {
    if (!note.trim()) return;
    await apiFetch(`/doctor/patients/${id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) });
    setNote("");
    load();
  };

  if (err) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{err}</p>
        <Link href="/doctor/patients" className="mt-4 inline-block text-sm text-blue-600">
          ← {t.backToPatients}
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-sm text-slate-500">{t.loading}</div>;
  }

  const { patient, notes, appointments, reports } = data;
  const lastMood = patient.moodEntries[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: "about", label: t.tabs.about },
    { key: "report", label: t.tabs.report },
    { key: "medications", label: t.tabs.medications },
    { key: "appointments", label: t.tabs.appointments }
  ];

  return (
    <div className="p-8">
      <Link href="/doctor/patients" className="text-sm text-blue-600 hover:underline">
        ← {t.patientsTitle}
      </Link>

      <div className="mt-4 flex flex-wrap items-end gap-4 border-b border-slate-200 pb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
          {patient.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{patient.name}</h1>
          <p className="text-sm text-slate-500">
            {patient.age != null ? `${patient.age} ${d.ageSuffix} · ` : ""}
            {patient.email}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {tab === "about" && (() => {
          const moodEmojiMap: Record<number, string> = { 2: "😄", 1: "🙂", 0: "😐", "-1": "😕", "-2": "😞" };
          const moodColorMap: Record<number, string> = {
            2: "bg-amber-100 text-amber-800 border-amber-200",
            1: "bg-yellow-100 text-yellow-800 border-yellow-200",
            0: "bg-teal-100 text-teal-800 border-teal-200",
            [-1]: "bg-slate-200 text-slate-700 border-slate-300",
            [-2]: "bg-indigo-100 text-indigo-800 border-indigo-200"
          };

          // ── Clinical overview (weighted multi-modal fusion) ───────────────
          // Weights reflect clinical relevance:
          //   Priority 1 (weight 3): voice, sleep/activity, clinical assessments (YMRS/HDRS)
          //   Priority 2 (weight 2): handwriting, digital behaviour (mouse/keyboard)
          //   Priority 3 (weight 1): self-reported mood
          const latestMouse = patient.mouseBehaviorLogs?.[0];
          const latestVoice = reports.voiceHistory[0];
          const latestSleep = reports.sleepHistory[0];
          const latestHW = reports.handwritingHistory[0];
          const latestMoodEntry = patient.moodEntries[0];
          const latestYmrsAss = patient.assessments.find(a => a.type === "YMRS");
          const latestHdrsAss = patient.assessments.find(a => a.type === "HDRS");

          type Sig = { label: string; value: "manic" | "depressive" | "normal" | "unknown"; weight: number; priority: 1 | 2 | 3 };

          const signals: Sig[] = [];

          // Priority 1 — voice (weight 3)
          if (latestVoice?.phase) {
            const ph = latestVoice.phase.toLowerCase();
            signals.push({ label: language === "fr" ? "🎙 Voix" : "🎙 Voice", weight: 3, priority: 1, value: ph.includes("manic") ? "manic" : ph.includes("depress") ? "depressive" : ph.includes("neutral") ? "normal" : "unknown" });
          }
          // Priority 1 — sleep/activity (weight 3)
          if (latestSleep) {
            signals.push({ label: language === "fr" ? "😴 Sommeil" : "😴 Sleep", weight: 3, priority: 1, value: latestSleep.alert || latestSleep.riskLevel === "Alert" || latestSleep.riskLevel === "At Risk" ? "depressive" : "normal" });
          }
          // Priority 1 — clinical assessments YMRS/HDRS (weight 3)
          if (latestYmrsAss || latestHdrsAss) {
            const ymrsManic = latestYmrsAss && latestYmrsAss.score > 12;
            const hdrsDepressive = latestHdrsAss && latestHdrsAss.score > 8;
            const assessVal = ymrsManic ? "manic" : hdrsDepressive ? "depressive" : "normal";
            signals.push({ label: language === "fr" ? "📊 Questionnaires" : "📊 Assessments", weight: 3, priority: 1, value: assessVal });
          }
          // Priority 2 — handwriting (weight 2)
          if (latestHW) {
            signals.push({ label: language === "fr" ? "✍️ Écriture" : "✍️ Handwriting", weight: 2, priority: 2, value: latestHW.alertConfirmed ? "manic" : latestHW.alertJ1 ? "manic" : "normal" });
          }
          // Priority 2 — digital behaviour / mouse (weight 2)
          if (latestMouse) {
            signals.push({ label: language === "fr" ? "🖱 Comportement" : "🖱 Behaviour", weight: 2, priority: 2, value: latestMouse.state === "manic" ? "manic" : latestMouse.state === "depressed" ? "depressive" : latestMouse.state === "normal" ? "normal" : "unknown" });
          }
          // Priority 3 — self-reported mood (weight 1)
          if (latestMoodEntry) {
            const mv = latestMoodEntry.moodLevel;
            signals.push({ label: language === "fr" ? "🧠 Humeur déclarée" : "🧠 Self-reported mood", weight: 1, priority: 3, value: mv >= 1 ? "manic" : mv <= -1 ? "depressive" : "normal" });
          }

          const known = signals.filter(s => s.value !== "unknown");
          // Weighted score per outcome
          const manicScore  = known.filter(s => s.value === "manic"      ).reduce((a, s) => a + s.weight, 0);
          const depScore    = known.filter(s => s.value === "depressive" ).reduce((a, s) => a + s.weight, 0);
          const normScore   = known.filter(s => s.value === "normal"     ).reduce((a, s) => a + s.weight, 0);
          const totalWeight = manicScore + depScore + normScore;
          const decision = manicScore > depScore && manicScore > normScore ? "manic"
            : depScore > manicScore && depScore > normScore ? "depressive"
            : "normal";
          const dcfg = {
            manic: { label: language === "fr" ? "Risque maniaque" : language === "ar" ? "خطر هوسي" : "Manic risk", bg: "bg-amber-50 border-amber-300", text: "text-amber-900", dot: "bg-amber-500", accent: "from-amber-400 to-orange-400" },
            depressive: { label: language === "fr" ? "Risque dépressif" : language === "ar" ? "خطر اكتئابي" : "Depressive risk", bg: "bg-indigo-50 border-indigo-300", text: "text-indigo-900", dot: "bg-indigo-500", accent: "from-indigo-400 to-violet-400" },
            normal: { label: language === "fr" ? "Stable" : language === "ar" ? "مستقر" : "Stable", bg: "bg-teal-50 border-teal-300", text: "text-teal-900", dot: "bg-teal-500", accent: "from-teal-400 to-emerald-400" }
          }[decision];

          // ── Per-modality signal cards ──────────────────────────────────
          const modalityCards = [
            {
              key: "mouse",
              icon: "🖱",
              label: language === "fr" ? "Comportement numérique" : "Digital behaviour",
              value: latestMouse ? (latestMouse.state === "manic" ? "manic" : latestMouse.state === "depressed" ? "depressive" : latestMouse.state === "normal" ? "normal" : "pending") as Sig["value"] : "unknown" as Sig["value"],
              detail: latestMouse ? `${(latestMouse.score * 100).toFixed(0)}% — ${latestMouse.level}` : null,
              bar: latestMouse ? latestMouse.score : null,
              date: latestMouse?.savedAt ? new Date(latestMouse.savedAt).toLocaleDateString(locale) : null,
            },
            {
              key: "voice",
              icon: "🎙",
              label: language === "fr" ? "Analyse vocale" : "Voice analysis",
              value: latestVoice?.phase ? (latestVoice.phase.toLowerCase().includes("manic") ? "manic" : latestVoice.phase.toLowerCase().includes("depress") ? "depressive" : "normal") as Sig["value"] : "unknown" as Sig["value"],
              detail: latestVoice ? `${language === "fr" ? "Phase" : "Phase"}: ${latestVoice.phase ?? "—"}${latestVoice.confidence != null ? ` · ${(latestVoice.confidence * 100).toFixed(0)}%` : ""}` : null,
              bar: latestVoice?.confidence ?? null,
              date: latestVoice?.createdAt ? new Date(latestVoice.createdAt).toLocaleDateString(locale) : null,
            },
            {
              key: "sleep",
              icon: "😴",
              label: language === "fr" ? "Sommeil & activité" : "Sleep & activity",
              value: latestSleep ? (latestSleep.alert || latestSleep.riskLevel === "Alert" || latestSleep.riskLevel === "At Risk" ? "depressive" : "normal") as Sig["value"] : "unknown" as Sig["value"],
              detail: latestSleep ? `${language === "fr" ? "Risque" : "Risk"}: ${language === "fr" ? (latestSleep.riskLevel === "Normal" ? "Normal" : latestSleep.riskLevel === "Watch" ? "Vigilance" : "Alerte") : latestSleep.riskLevel}` : null,
              bar: latestSleep ? (latestSleep.anomalyScore ?? (latestSleep.alert ? 0.8 : 0.2)) : null,
              date: latestSleep?.createdAt ? new Date(latestSleep.createdAt).toLocaleDateString(locale) : null,
            },
            {
              key: "handwriting",
              icon: "✍️",
              label: language === "fr" ? "Écriture manuscrite" : "Handwriting",
              value: latestHW ? (latestHW.alertConfirmed ? "manic" : latestHW.alertJ1 ? "manic" : "normal") as Sig["value"] : "unknown" as Sig["value"],
              detail: latestHW ? `${language === "fr" ? "État" : "State"}: ${latestHW.alertConfirmed ? (language === "fr" ? "Alerte" : "Alert") : latestHW.alertJ1 ? (language === "fr" ? "Vigilance" : "Watch") : (language === "fr" ? "Stable" : "Stable")} · ${language === "fr" ? "Phase" : "Phase"}: ${latestHW.phase}` : null,
              bar: latestHW ? (latestHW.alertConfirmed ? 0.85 : latestHW.alertJ1 ? 0.5 : 0.15) : null,
              date: latestHW?.createdAt ? new Date(latestHW.createdAt).toLocaleDateString(locale) : null,
            },
            {
              key: "mood",
              icon: "🧠",
              label: language === "fr" ? "Humeur déclarée" : "Self-reported mood",
              value: patient.moodEntries[0]
                ? (patient.moodEntries[0].moodLevel >= 1 ? "manic" : patient.moodEntries[0].moodLevel <= -1 ? "depressive" : "normal") as Sig["value"]
                : "unknown" as Sig["value"],
              detail: patient.moodEntries[0] ? `Score: ${patient.moodEntries[0].moodLevel > 0 ? "+" : ""}${patient.moodEntries[0].moodLevel} / 2` : null,
              bar: patient.moodEntries[0] ? (patient.moodEntries[0].moodLevel + 2) / 4 : null,
              date: patient.moodEntries[0]?.createdAt ? new Date(patient.moodEntries[0].createdAt).toLocaleDateString(locale) : null,
            },
            {
              key: "assessment",
              icon: "📊",
              label: language === "fr" ? "Évaluations cliniques" : "Clinical assessments",
              value: (() => {
                const ymrs = patient.assessments.find(a => a.type === "YMRS");
                const hdrs = patient.assessments.find(a => a.type === "HDRS");
                if (ymrs && ymrs.score > 12) return "manic" as Sig["value"];
                if (hdrs && hdrs.score > 8) return "depressive" as Sig["value"];
                if (ymrs || hdrs) return "normal" as Sig["value"];
                return "unknown" as Sig["value"];
              })(),
              detail: (() => {
                const ymrs = patient.assessments.find(a => a.type === "YMRS");
                const hdrs = patient.assessments.find(a => a.type === "HDRS");
                if (!ymrs && !hdrs) return null;
                return [ymrs ? `YMRS ${ymrs.score}` : null, hdrs ? `HDRS ${hdrs.score}` : null].filter(Boolean).join(" · ");
              })(),
              bar: (() => {
                const ymrs = patient.assessments.find(a => a.type === "YMRS");
                const hdrs = patient.assessments.find(a => a.type === "HDRS");
                if (ymrs) return Math.min(1, ymrs.score / 60);
                if (hdrs) return Math.min(1, hdrs.score / 52);
                return null;
              })(),
              date: patient.assessments[0]?.createdAt ? new Date(patient.assessments[0].createdAt).toLocaleDateString(locale) : null,
            },
          ];

          const signalColorCfg = {
            manic:      { bg: "bg-amber-50",  border: "border-amber-200",  bar: "#f59e0b", badge: "bg-amber-100 text-amber-800",  dot: "bg-amber-500",  label: language === "fr" ? "Maniaque" : "Manic"      },
            depressive: { bg: "bg-indigo-50", border: "border-indigo-200", bar: "#6366f1", badge: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-500", label: language === "fr" ? "Dépressif" : "Depressive" },
            normal:     { bg: "bg-teal-50",   border: "border-teal-200",   bar: "#14b8a6", badge: "bg-teal-100 text-teal-800",    dot: "bg-teal-500",   label: language === "fr" ? "Stable" : "Stable"       },
            unknown:    { bg: "bg-slate-50",  border: "border-slate-200",  bar: "#94a3b8", badge: "bg-slate-100 text-slate-500",  dot: "bg-slate-300",  label: language === "fr" ? "Aucune donnée" : "No data"  },
            pending:    { bg: "bg-slate-50",  border: "border-slate-200",  bar: "#94a3b8", badge: "bg-slate-100 text-slate-500",  dot: "bg-slate-300",  label: language === "fr" ? "En cours" : "Collecting"  },
          };

          return (
          <div className="space-y-5">
            {/* ── FINAL DECISION — prominent card ─────────────────────── */}
            {known.length > 0 && (
              <div className={`relative overflow-hidden rounded-3xl border-2 p-6 shadow-md ${dcfg.bg}`}>
                <div className="absolute inset-0 opacity-5"
                  style={{ backgroundImage: "radial-gradient(circle at 80% 20%,#6366f1,transparent 60%)" }} />
                <div className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {language === "fr" ? "Décision clinique globale" : language === "ar" ? "القرار السريري الشامل" : "Overall clinical decision"}
                      </div>
                      <div className={`text-3xl font-extrabold ${dcfg.text}`}>{dcfg.label}</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${dcfg.dot}`} />
                        <span className="text-xs text-slate-500">
                          {known.length} {language === "fr" ? "signaux pondérés" : "weighted signals"} · {language === "fr" ? "score total" : "total score"}: {totalWeight} pts
                        </span>
                      </div>
                    </div>
                    <div className={`rounded-2xl bg-gradient-to-br ${dcfg.accent} p-4 text-center text-white shadow-lg min-w-[110px]`}>
                      <div className="text-2xl font-black">{totalWeight > 0 ? `${Math.round((Math.max(manicScore, depScore, normScore) / totalWeight) * 100)}%` : "—"}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-80 mb-1">{language === "fr" ? "confiance" : "confidence"}</div>
                      <div className="flex justify-center gap-1">
                        {manicScore > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">{manicScore}M</span>}
                        {depScore > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">{depScore}D</span>}
                        {normScore > 0 && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">{normScore}S</span>}
                      </div>
                    </div>
                  </div>
                  {/* Signal contribution row with weight indicators */}
                  <div className="space-y-2">
                    {[1, 2, 3].map(priority => {
                      const group = signals.filter(s => s.priority === priority);
                      if (group.length === 0) return null;
                      const priorityLabel = priority === 1
                        ? (language === "fr" ? "Signaux principaux" : language === "ar" ? "الإشارات الأساسية" : "Primary signals")
                        : priority === 2
                        ? (language === "fr" ? "Signaux complémentaires" : language === "ar" ? "الإشارات التكميلية" : "Supporting signals")
                        : (language === "fr" ? "Signaux subjectifs" : language === "ar" ? "الإشارات الذاتية" : "Subjective signals");
                      return (
                        <div key={priority}>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{priorityLabel}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {group.map((s, i) => {
                              const sCfg = signalColorCfg[s.value as keyof typeof signalColorCfg] ?? signalColorCfg.unknown;
                              return (
                                <span key={i} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold ${sCfg.badge} border-current/20`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${sCfg.dot}`} />
                                  {s.label}
                                  <span className="opacity-50">·</span>
                                  {sCfg.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[10px] text-slate-500 leading-relaxed">
                    {language === "fr"
                      ? "Synthèse pondérée par priorité clinique — signaux principaux en tête, humeur déclarée en appoint. Ne remplace pas l'évaluation clinique."
                      : language === "ar"
                      ? "تركيب موزون حسب الأولوية السريرية — الإشارات الأساسية أولاً. لا يغني عن التقييم السريري."
                      : "Clinically weighted synthesis — primary signals take precedence. Does not replace clinical assessment."}
                  </p>
                </div>
              </div>
            )}

            {/* ── SIGNAL ANALYSIS CARDS ────────────────────────────────── */}
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-3">
                {language === "fr" ? "Tableau de bord des indicateurs" : language === "ar" ? "لوحة المؤشرات" : "Clinical indicators overview"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {modalityCards.map((card) => {
                  const sCfg = signalColorCfg[card.value as keyof typeof signalColorCfg] ?? signalColorCfg.unknown;
                  return (
                    <div key={card.key} className={`rounded-2xl border p-4 ${sCfg.bg} ${sCfg.border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{card.icon}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${sCfg.badge}`}>
                          {sCfg.label}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-800 mb-1">{card.label}</div>
                      {card.detail && <div className="text-[11px] text-slate-500 mb-2 truncate">{card.detail}</div>}
                      {card.bar !== null && (
                        <div className="h-1.5 w-full rounded-full bg-white/60 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, Math.max(3, (card.bar ?? 0) * 100))}%`, backgroundColor: sCfg.bar }} />
                        </div>
                      )}
                      {card.date && <div className="mt-1.5 text-[9px] text-slate-400">{card.date}</div>}
                      {card.value === "unknown" && (
                        <div className="text-[10px] text-slate-400 italic mt-1">{language === "fr" ? "Aucune donnée disponible" : "No data available yet"}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* ── Mood history — emoji chips ──────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">{t.historyMood}</h2>
                {patient.moodEntries.length === 0 ? (
                  <p className="text-xs text-slate-400">{t.noMoodEntries}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {patient.moodEntries.slice(0, 30).map((m) => {
                      const lvl = m.moodLevel as keyof typeof moodColorMap;
                      const cls = moodColorMap[lvl] ?? "bg-slate-100 text-slate-600 border-slate-200";
                      const emoji = moodEmojiMap[m.moodLevel] ?? "😐";
                      return (
                        <div key={m.id} title={m.note ?? ""} className={`flex flex-col items-center rounded-xl border px-2.5 py-2 cursor-default hover:scale-105 transition-transform ${cls}`}>
                          <span className="text-base leading-none">{emoji}</span>
                          <span className="text-[10px] font-bold mt-1">{m.moodLevel > 0 ? `+${m.moodLevel}` : m.moodLevel}</span>
                          <span className="text-[9px] opacity-70">{new Date(m.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Mouse behavioral rhythm ─────────────────────────────── */}
              <section className="lg:col-span-2 space-y-3">
                <MouseRhythmPanel behavior={patientBehavior} />
                {(data?.patient.mouseBehaviorLogs ?? []).length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                      {language === "fr" ? "Rythme comportemental — 30 jours" : language === "ar" ? "الإيقاع السلوكي — 30 يوماً" : "Behavioural rhythm — last 30 days"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(data?.patient.mouseBehaviorLogs ?? []).map((log) => {
                        const cls = log.state === "normal" ? "bg-teal-100 text-teal-800 border-teal-200" : log.state === "manic" ? "bg-amber-100 text-amber-800 border-amber-200" : log.state === "depressed" ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-gray-100 text-gray-500 border-gray-200";
                        return (
                          <div key={log.id} title={`Score: ${(log.score * 100).toFixed(0)}% — ${log.level}\n${log.windowCount} fenêtres, ${log.anomalyPct.toFixed(0)}% signalées`} className={`flex flex-col items-center rounded-xl border px-2.5 py-2 text-center cursor-default transition-transform hover:scale-105 ${cls}`}>
                            <span className="text-[10px] font-bold">{log.date.slice(5)}</span>
                            <span className="text-[10px] capitalize mt-0.5">{language === "fr" ? (log.state === "normal" ? "stable" : log.state === "manic" ? "maniaque" : log.state === "depressed" ? "dépressif" : "—") : log.state}</span>
                            <span className="text-[9px] opacity-70">{(log.score * 100).toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* ── Voice history ───────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  {language === "fr" ? "🎙 Historique vocal" : language === "ar" ? "🎙 السجل الصوتي" : "🎙 Voice history"}
                </h2>
                {reports.voiceHistory.length === 0 ? <p className="text-xs text-slate-400">{language === "fr" ? "Aucune session vocale enregistrée." : "No voice sessions yet."}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {reports.voiceHistory.map((v, i) => {
                      const ph = (v.phase ?? "").toLowerCase();
                      const cls = ph.includes("manic") ? "bg-amber-100 text-amber-800 border-amber-200" : ph.includes("depress") ? "bg-indigo-100 text-indigo-800 border-indigo-200" : ph.includes("neutral") ? "bg-teal-100 text-teal-800 border-teal-200" : "bg-slate-100 text-slate-600 border-slate-200";
                      return (
                        <div key={i} title={`Fiabilité: ${v.confidence != null ? (v.confidence * 100).toFixed(0) + "%" : "—"}`} className={`flex flex-col items-center rounded-xl border px-2.5 py-2 text-center cursor-default hover:scale-105 transition-transform ${cls}`}>
                          <span className="text-[10px] font-bold">{new Date(v.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                          <span className="text-[10px] capitalize mt-0.5">{language === "fr" ? (ph.includes("manic") ? "maniaque" : ph.includes("depress") ? "dépressif" : ph.includes("neutral") ? "neutre" : v.phase ?? "—") : v.phase ?? "—"}</span>
                          {v.confidence != null && <span className="text-[9px] opacity-70">{(v.confidence * 100).toFixed(0)}%</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Sleep/activity history ──────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  {language === "fr" ? "😴 Historique sommeil" : language === "ar" ? "😴 سجل النوم" : "😴 Sleep history"}
                </h2>
                {reports.sleepHistory.length === 0 ? <p className="text-xs text-slate-400">{language === "fr" ? "Aucun rapport sommeil/activité." : "No sleep/activity reports yet."}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {reports.sleepHistory.map((s, i) => {
                      const cls = s.alert ? "bg-red-100 text-red-800 border-red-200" : s.riskLevel === "At Risk" ? "bg-orange-100 text-orange-800 border-orange-200" : s.riskLevel === "Watch" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-teal-100 text-teal-800 border-teal-200";
                      return (
                        <div key={i} title={`Score d'anomalie: ${s.anomalyScore != null ? s.anomalyScore.toFixed(3) : "—"}`} className={`flex flex-col items-center rounded-xl border px-2.5 py-2 text-center cursor-default hover:scale-105 transition-transform ${cls}`}>
                          <span className="text-[10px] font-bold">{new Date(s.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                          <span className="text-[10px] mt-0.5">{language === "fr" ? (s.riskLevel === "Normal" ? "Normal" : s.riskLevel === "Watch" ? "Vigilance" : s.riskLevel === "At Risk" ? "À risque" : "Alerte") : s.riskLevel}</span>
                          {s.alert && <span className="text-[9px] font-bold">⚠</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Handwriting history ─────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  {language === "fr" ? "✍️ Historique écriture" : language === "ar" ? "✍️ سجل الكتابة" : "✍️ Handwriting history"}
                </h2>
                {reports.handwritingHistory.length === 0 ? <p className="text-xs text-slate-400">{language === "fr" ? "Aucune session d'écriture enregistrée." : "No handwriting sessions yet. They appear here after the patient submits an analysis."}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {reports.handwritingHistory.map((h, i) => {
                      const cls = h.alertConfirmed ? "bg-red-100 text-red-800 border-red-200" : h.alertJ1 ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-teal-100 text-teal-800 border-teal-200";
                      const label = h.alertConfirmed ? (language === "fr" ? "Alerte" : "Alert") : h.alertJ1 ? (language === "fr" ? "Vigilance" : "Watch") : (language === "fr" ? "Stable" : "Stable");
                      return (
                        <div key={i} title={`${h.phase} · ${h.clinicalLabel ?? h.statusLabel ?? ""}\nCalibration: ${h.nBaseline ?? "??"}/3${h.directionPrediction ? "\nDirection: " + h.directionPrediction : ""}`} className={`flex flex-col items-center rounded-xl border px-2.5 py-2 text-center cursor-default hover:scale-105 transition-transform ${cls}`}>
                          <span className="text-[10px] font-bold">{h.date || new Date(h.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                          <span className="text-[10px] mt-0.5">{label}</span>
                          <span className="text-[9px] opacity-70">{language === "fr" ? (h.phase === "baseline" ? "calibration" : "suivi") : h.phase}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── Activity & sleep logs ───────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">{d.activitySleepTitle}</h2>
                <ul className="max-h-48 space-y-2 overflow-auto text-xs">
                  {patient.activityLogs.filter(a => !a.activityNotes?.startsWith("[")).slice(0, 14).map((a) => (
                    <li key={a.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-slate-500">{new Date(a.createdAt).toLocaleDateString(locale)}</span>
                      <span className="font-medium">
                        🌙 {a.sleepHours}h · ⚡ {a.energyLevel}/5
                      </span>
                    </li>
                  ))}
                  {patient.activityLogs.filter(a => !a.activityNotes?.startsWith("[")).length === 0 && <li className="text-slate-400">{d.noActivityLogs}</li>}
                </ul>
              </section>

              {/* ── Consultations ───────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">{d.consultationsTitle}</h2>
                <ul className="space-y-2 text-xs">
                  {patient.assessments.map((a) => {
                    const isHDRS = a.type === "HDRS";
                    const isHigh = isHDRS ? a.score > 8 : a.score > 12;
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <span className="font-semibold text-slate-700">{a.type}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isHigh ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{a.score}</span>
                        <span className="text-slate-400">{new Date(a.createdAt).toLocaleDateString(locale)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* ── Doctor notes ─────────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">{d.doctorNotesTitle}</h2>
                <div className="flex gap-2 mb-3">
                  <input className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={d.addNotePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={saveNote}>{d.saveNote}</Button>
                </div>
                <ul className="space-y-2 text-xs">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                      <div className="text-[10px] text-slate-400 mb-1">{new Date(n.createdAt).toLocaleString(locale)}</div>
                      {n.body}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
          );
        })()}

        {tab === "report" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{d.reportTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {d.summaryFor} <strong>{patient.name}</strong>
              {lastMood != null ? (
                <>
                  : {d.latestMoodScore} <strong>{lastMood.moodLevel}</strong> {d.recordedOn}{" "}
                  {new Date(lastMood.createdAt).toLocaleDateString(locale)}.
                </>
              ) : (
                <> — {d.noMoodEntriesInline}.</>
              )}{" "}
              {d.recentAssessments}:{" "}
              {patient.assessments.length
                ? patient.assessments
                    .slice(0, 4)
                    .map((a) => `${a.type} ${a.score}`)
                    .join(", ")
                : `${d.none}.`}{" "}
              {t.reportNote}
            </p>

            <div className="mt-6 space-y-4">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">
                  {language === "fr" ? "🎙 Analyse vocale — dernier enregistrement" : language === "ar" ? "🎙 التحليل الصوتي — آخر تسجيل" : "🎙 Voice analysis — latest recording"}
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  {language === "fr"
                    ? "Détection de phase bipolaire à partir de l'enregistrement vocal du patient. Indicateur clinique d'aide à la décision."
                    : language === "ar"
                    ? "كشف الطور الثنائي القطب من التسجيل الصوتي للمريض."
                    : "Bipolar phase detection from the patient's voice recording. Clinical decision-support indicator."}
                </p>
                {reports.voiceXaiReport ? (
                  <div className="space-y-4 text-sm text-slate-700">
                    <p className="text-xs text-slate-400">{new Date(reports.voiceXaiReport.createdAt).toLocaleString(locale)}</p>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{language === "fr" ? "Phase détectée" : "Detected phase"}</div>
                        <div className={`text-lg font-bold capitalize ${(reports.voiceXaiReport.phase ?? "").toLowerCase().includes("manic") ? "text-amber-700" : (reports.voiceXaiReport.phase ?? "").toLowerCase().includes("depress") ? "text-indigo-700" : "text-teal-700"}`}>
                          {language === "fr"
                            ? ((reports.voiceXaiReport.phase ?? "").toLowerCase().includes("manic") ? "Maniaque" : (reports.voiceXaiReport.phase ?? "").toLowerCase().includes("depress") ? "Dépressif" : (reports.voiceXaiReport.phase ?? "").toLowerCase().includes("neutral") ? "Neutre" : reports.voiceXaiReport.phase || "—")
                            : reports.voiceXaiReport.phase || "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{language === "fr" ? "Indice de fiabilité" : "Reliability score"}</div>
                        <div className="text-lg font-bold text-slate-800">
                          {reports.voiceXaiReport.confidence != null ? `${(Number(reports.voiceXaiReport.confidence) * 100).toFixed(0)}%` : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{language === "fr" ? "Analyse complète" : "Full analysis"}</div>
                        <div className="text-lg font-bold text-slate-800">
                          {reports.voiceXaiReport.monitorReached === undefined ? "—" : reports.voiceXaiReport.monitorReached ? (language === "fr" ? "Oui" : "Yes") : (language === "fr" ? "Partielle" : "Partial")}
                        </div>
                      </div>
                      {reports.voiceXaiReport.rawPhase && (
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{language === "fr" ? "Classification brute" : "Raw classification"}</div>
                          <div className="text-base font-semibold text-slate-700 capitalize">{reports.voiceXaiReport.rawPhase}</div>
                        </div>
                      )}
                    </div>

                    {reports.voiceXaiReport.errorHint ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                        <span className="font-semibold">{language === "fr" ? "Note : " : "Note: "}</span>
                        {reports.voiceXaiReport.errorHint}
                      </div>
                    ) : null}

                    {reports.voiceXaiReport.caption ? (
                      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 mb-2">{language === "fr" ? "Analyse acoustique" : "Acoustic analysis"}</div>
                        <p className="text-sm leading-relaxed text-slate-700">{reports.voiceXaiReport.caption}</p>
                      </div>
                    ) : null}

                    {reports.voiceXaiReport.frequencySummary &&
                    Object.keys(reports.voiceXaiReport.frequencySummary).length > 0 ? (
                      <div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400 mb-2">
                          {language === "fr" ? "Profil fréquentiel vocal" : "Vocal frequency profile"}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                                <th className="px-3 py-2 font-medium text-slate-600">{language === "fr" ? "Bande fréquentielle" : "Frequency band"}</th>
                                <th className="px-3 py-2 font-medium text-slate-600">{language === "fr" ? "Énergie relative" : "Relative energy"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(reports.voiceXaiReport.frequencySummary)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([band, val]) => (
                                  <tr key={band} className="border-b border-slate-50">
                                    <td className="px-3 py-1.5 font-medium text-slate-700">{band}</td>
                                    <td className="px-3 py-1.5 font-semibold">{typeof val === "number" ? val.toFixed(3) : String(val)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {(reports.voiceXaiReport.waveformPngB64 || reports.voiceXaiReport.spectrogramPngB64) && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase text-slate-400 mb-2">
                          {language === "fr" ? "Visualisations acoustiques" : "Acoustic visualisations"}
                        </div>
                        <div className="mt-2 grid gap-4 lg:grid-cols-2">
                          {reports.voiceXaiReport.waveformPngB64 ? (
                            <figure className="rounded-xl border border-slate-200 bg-white p-3">
                              <figcaption className="mb-2 text-[11px] font-medium text-slate-500">
                                {language === "fr" ? "Signal vocal — évolution temporelle" : "Voice signal — over time"}
                              </figcaption>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={b64PngDataUrl(reports.voiceXaiReport.waveformPngB64)}
                                alt="Voice waveform"
                                className="max-h-56 w-full object-contain"
                              />
                            </figure>
                          ) : null}
                          {reports.voiceXaiReport.spectrogramPngB64 ? (
                            <figure className="rounded-xl border border-slate-200 bg-white p-3">
                              <figcaption className="mb-2 text-[11px] font-medium text-slate-500">
                                {language === "fr" ? "Profil fréquentiel au fil du temps" : "Frequency profile over time"}
                              </figcaption>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={b64PngDataUrl(reports.voiceXaiReport.spectrogramPngB64)}
                                alt="Voice spectrogram"
                                className="max-h-56 w-full object-contain"
                              />
                            </figure>
                          ) : null}
                        </div>
                      </div>
                    )}

                    {reports.voiceXaiReport.transcript ? (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase text-slate-400 mb-2">
                          {language === "fr" ? "Paroles du patient" : "Patient's words"}
                        </div>
                        <blockquote className="text-sm italic text-slate-700 leading-relaxed">
                          &ldquo;{reports.voiceXaiReport.transcript}&rdquo;
                        </blockquote>
                      </div>
                    ) : null}

                    {reports.voiceXaiReport.assistantReply ? (
                      <details className="rounded-xl border border-slate-200 bg-white text-xs">
                        <summary className="cursor-pointer px-4 py-2.5 font-medium text-slate-700">
                          {language === "fr" ? "Réponse de l'assistant (texte complet)" : "Assistant response (full text)"}
                        </summary>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">
                          {reports.voiceXaiReport.assistantReply}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">{language === "fr" ? "Aucune analyse vocale enregistrée pour ce patient." : "No voice analysis recorded for this patient yet."}</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">
                  {language === "fr" ? "😴 Sommeil & activité — rapport détaillé" : language === "ar" ? "😴 تقرير النوم والنشاط" : "😴 Sleep & activity — detailed report"}
                </h3>
                <p className="mt-1 text-xs text-slate-500 mb-4">
                  {language === "fr" ? "Analyse hebdomadaire des rythmes de sommeil et d'activité physique du patient." : "Weekly analysis of the patient's sleep and physical activity rhythms."}
                </p>
                {reports.sleepActivityReport ? (
                  reports.sleepActivityReport.format === "structured" ? (
                    <div className="mt-3 space-y-4">
                      <p className="text-xs text-slate-500">
                        Generated {new Date(reports.sleepActivityReport.createdAt).toLocaleString(locale)}
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <div className={`rounded-xl border px-4 py-3 ${reports.sleepActivityReport.alert ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                          <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">{language === "fr" ? "Signalement" : "Flag"}</div>
                          <div className={`text-lg font-bold ${reports.sleepActivityReport.alert ? "text-red-700" : "text-emerald-700"}`}>
                            {reports.sleepActivityReport.alert ? (language === "fr" ? "Irrégularités détectées" : "Irregularities detected") : (language === "fr" ? "Dans la norme" : "Within normal range")}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">{language === "fr" ? "Niveau de risque" : "Risk level"}</div>
                          <div className="text-lg font-bold text-slate-800 capitalize">
                            {language === "fr"
                              ? (reports.sleepActivityReport.riskLevel === "Normal" ? "Normal" : reports.sleepActivityReport.riskLevel === "Watch" ? "Vigilance" : reports.sleepActivityReport.riskLevel === "At Risk" ? "À surveiller" : "Alerte")
                              : reports.sleepActivityReport.riskLevel || "—"}
                          </div>
                        </div>
                        {reports.sleepActivityReport.anomalyScore != null && (
                          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">{language === "fr" ? "Indice d'irrégularité" : "Irregularity index"}</div>
                            <div className="text-lg font-bold text-slate-800">{(reports.sleepActivityReport.anomalyScore * 100).toFixed(0)}%</div>
                          </div>
                        )}
                      </div>

                      {reports.sleepActivityReport.features &&
                      Object.keys(reports.sleepActivityReport.features).length > 0 ? (
                        <div>
                          <div className="text-[10px] font-semibold uppercase text-slate-500">
                            {language === "fr" ? "Mesures hebdomadaires" : language === "ar" ? "القياسات الأسبوعية" : "Weekly measurements"}
                          </div>
                          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                                  <th className="px-3 py-2 font-medium text-slate-600">Metric</th>
                                  <th className="px-3 py-2 font-medium text-slate-600">Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {orderedFeatureEntries(reports.sleepActivityReport.features).map(([key, val]) => (
                                  <tr key={key} className="border-b border-slate-50">
                                    <td className="px-3 py-1.5">{formatMetricKey(key)}</td>
                                    <td className="px-3 py-1.5 font-mono">
                                      {typeof val === "number" && Number.isFinite(val) ? val.toFixed(4) : String(val)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      {reports.sleepActivityReport.narrative ? (
                        <div>
                          <div className="text-[10px] font-semibold uppercase text-slate-500">
                            Narrative (&quot;your week in words&quot;)
                          </div>
                          <div className="mt-2 space-y-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800">
                            {reports.sleepActivityReport.narrative
                              .split(/\n{2,}/)
                              .map((para, i) => (
                                <p key={i} className="whitespace-pre-wrap">
                                  {para.trim()}
                                </p>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No narrative paragraph stored for this export.</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-500">
                        Legacy format · {new Date(reports.sleepActivityReport.createdAt).toLocaleString(locale)}
                      </p>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                        {reports.sleepActivityReport.rawText}
                      </pre>
                    </div>
                  )
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No sleep/activity report saved yet.</p>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === "medications" && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl px-5 py-5 shadow-sm" style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)" }}>
              <h2 className="text-base font-bold text-white">💊 {d.medicationsTitle}</h2>
              <p className="text-indigo-200 text-xs mt-1">{patient.medications.length} {language === "fr" ? "médicament(s) enregistré(s)" : "medication(s) on file"}</p>
            </div>
            {patient.medications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">{d.noMedications}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {patient.medications.map((m) => {
                  const times = m.time?.split(",").map((ti: string) => ti.trim()).filter(Boolean) ?? [];
                  return (
                    <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                        <span className="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-xs font-bold shrink-0">{m.dosage}</span>
                      </div>
                      <div className="text-xs text-slate-500 mb-3">{m.frequency}</div>
                      {times.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {times.map((time: string, i: number) => (
                            <span key={i} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              ⏰ {time}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "appointments" && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl px-5 py-5 shadow-sm" style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)" }}>
              <h2 className="text-base font-bold text-white">📅 {d.appointmentsTitle}</h2>
              <p className="text-sky-200 text-xs mt-1">{appointments.length} {language === "fr" ? "rendez-vous" : "appointment(s)"}</p>
            </div>
            {appointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">{d.noAppointments}</div>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => {
                  const statusCfg: Record<string, string> = {
                    confirmed: "bg-teal-100 text-teal-800",
                    pending: "bg-amber-100 text-amber-800",
                    cancelled: "bg-red-100 text-red-700"
                  };
                  const localStatus = language === "fr" ? { confirmed: "Confirmé", pending: "En attente", cancelled: "Annulé" }[a.status] ?? a.status : a.status;
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                      <div>
                        <div className="font-medium text-slate-900 text-sm">{new Date(a.startAt).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</div>
                        <div className="text-xs text-slate-500">{new Date(a.startAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} → {new Date(a.endAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusCfg[a.status] ?? "bg-slate-100 text-slate-600"}`}>{localStatus}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
