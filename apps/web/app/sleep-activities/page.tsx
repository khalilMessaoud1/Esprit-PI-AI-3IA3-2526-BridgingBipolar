"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProtectedRoute from "../../components/ProtectedRoute";
import Card from "../../components/Card";
import ButtonPrimary from "../../components/ButtonPrimary";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";
const ML_URL = process.env.NEXT_PUBLIC_ML_URL || "http://localhost:5000";

// ── Types ────────────────────────────────────────────────────────────────────
type DayRecord = {
  day_num: number;
  day_of_week: number;
  sleep_hours: number;
  activity_mims: number;
  wake_minutes: number;
};

type AnalysisResult = {
  reconstruction_error: number;
  global_threshold: number;
  anomaly_score: number;
  alert: boolean;
  risk_level: "Normal" | "Watch" | "At Risk" | "Alert";
  features: Record<string, number>;
  llm_report: string;
};

// ── Risk config ───────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  Normal:   { bg: "bg-[#E8F9EF]", text: "text-[#27AE60]", bar: "#27AE60", desc: "Sleep and activity patterns are within normal range." },
  Watch:    { bg: "bg-[#FFF8E1]", text: "text-[#F59E0B]", bar: "#F59E0B", desc: "Some irregularities detected. Consider monitoring more closely." },
  "At Risk":{ bg: "bg-[#FEF3EA]", text: "text-[#F2994A]", bar: "#F2994A", desc: "Significant anomalies in your patterns. Consider consulting a healthcare provider." },
  Alert:    { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", bar: "#DC2626", desc: "Critical irregularities detected. Medical attention is recommended." },
};

/** Plain-language bullets for patients (no model jargon). */
function patientInsights(f: AnalysisResult["features"], alert: boolean): string[] {
  const out: string[] = [];
  if (f.sleep_std > 1.5) {
    out.push("Sleep length bounced around more than usual from one night to the next.");
  }
  if (f.sleep_IV > 2) {
    out.push("Time spent awake at night varied a lot — nights may have felt more restless or broken up.");
  }
  if (f.social_jet_lag > 1.5) {
    out.push("Weekend sleep looked quite different from weekday sleep.");
  }
  if (f.relative_amplitude < 0.5) {
    out.push("The contrast between your quieter night hours and busier day hours looked softer than typical.");
  }
  if (f.sleep_trend < -0.3) {
    out.push("Sleep hours seemed to drift downward over the week.");
  }
  if (f.act_trend > 500) {
    out.push("Daily movement seemed to climb steadily across the week.");
  }
  if (f.corr_sleep_activity < -0.3) {
    out.push("On nights with less sleep, daytime movement tended to be higher.");
  }
  if (out.length === 0 && !alert) {
    out.push("Nothing in this snapshot stood out strongly — patterns look fairly steady for the days you uploaded.");
  } else if (out.length === 0 && alert) {
    out.push("The overall check flagged this week for extra attention; discussing it with a clinician can help make sense of it.");
  }
  return out;
}

/** Split pattern checks into sleep vs activity for the glance row (same thresholds as insights). */
function sleepActivityAlertFlags(f: AnalysisResult["features"]): { sleepAlert: boolean; activityAlert: boolean } {
  const sleepAlert =
    f.sleep_std > 1.5 ||
    f.sleep_IV > 2 ||
    f.social_jet_lag > 1.5 ||
    f.sleep_trend < -0.3 ||
    f.corr_sleep_activity < -0.3;
  const activityAlert =
    f.act_trend > 500 || f.relative_amplitude < 0.5 || f.corr_sleep_activity < -0.3;
  return { sleepAlert, activityAlert };
}

/** Strip dev-only lines; keep paragraph breaks from real LLM text. */
function formatReportForDisplay(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  return s
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^\[dev/i.test(t)) return false;
      if (/apps\/ml-service/i.test(t)) return false;
      if (/heuristic anomaly score/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function renderInlineBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{part}</span>;
  });
}

function SleepClinicalReportBody({ text }: { text: string }) {
  const blocks = text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const single = block
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" ");
        if (single.startsWith("*") && single.endsWith("*") && single.length > 2) {
          return (
            <p key={i} className="text-xs italic leading-relaxed text-textSecondary">
              {single.slice(1, -1)}
            </p>
          );
        }
        if (single.startsWith("## ")) {
          return (
            <h3 key={i} className="border-b border-slate-200 pb-1 text-sm font-semibold text-textPrimary">
              {single.slice(3)}
            </h3>
          );
        }
        if (single === "---") {
          return <hr key={i} className="border-slate-200" />;
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-textPrimary">
            {renderInlineBold(single)}
          </p>
        );
      })}
    </div>
  );
}

// ── Excel parsing ─────────────────────────────────────────────────────────────
const REQUIRED_COLS = ["day_num", "day_of_week", "sleep_hours", "activity_mims", "wake_minutes"];

function parseExcel(file: File): Promise<DayRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: 0 });
        if (rows.length === 0) throw new Error("File is empty.");
        const headers = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
        if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(", ")}`);
        const records = rows.map((row) => {
          const norm: Record<string, unknown> = {};
          Object.keys(row).forEach((k) => { norm[k.trim().toLowerCase()] = row[k]; });
          return {
            day_num:       Number(norm.day_num),
            day_of_week:   Number(norm.day_of_week),
            sleep_hours:   Number(norm.sleep_hours),
            activity_mims: Number(norm.activity_mims),
            wake_minutes:  Number(norm.wake_minutes),
          };
        });
        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsBinaryString(file);
  });
}

// ── Template download ─────────────────────────────────────────────────────────
async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["day_num", "day_of_week", "sleep_hours", "activity_mims", "wake_minutes"],
    [2, 2, 7.5, 14000, 900],
    [3, 3, 6.8, 12000, 950],
    [4, 4, 8.1, 15500, 870],
    [5, 5, 7.2, 13000, 910],
    [6, 6, 6.5, 11000, 980],
    [7, 7, 9.0, 10000, 840],
    [8, 1, 7.8, 13500, 890],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SleepActivity");
  XLSX.writeFile(wb, "sleep_activity_template.xlsx");
}

const MOOD_EMOJIS: Record<string, string> = { "-2": "😞", "-1": "😕", "0": "😐", "1": "🙂", "2": "😄" };
const MOOD_VALUES = [-2, -1, 0, 1, 2] as const;
const ACTIVITY_VALUES = [1, 2, 3, 4, 5] as const;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SleepActivitiesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].sleepPage;
  const moodT = uiText[language].mood;
  const canSave = user?.role === "PATIENT";
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [sleepHours, setSleepHours] = useState("");
  const [moodLevel, setMoodLevel] = useState<number | null>(null);
  const [activityLevel, setActivityLevel] = useState<number | null>(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<DayRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.role === "DOCTOR") {
      router.replace("/doctor");
    }
  }, [user?.role, router]);

  const persistDoctorFacingSleepReport = useCallback(async (analysis: AnalysisResult) => {
    const sleepMean = Number(analysis.features?.sleep_mean ?? 0);
    const riskToEnergy: Record<AnalysisResult["risk_level"], number> = {
      Normal: 4,
      Watch: 3,
      "At Risk": 2,
      Alert: 1
    };
    const narrative = formatReportForDisplay(analysis.llm_report || "").slice(0, 12000);
    const payload = {
      v: 1 as const,
      risk_level: analysis.risk_level,
      alert: analysis.alert,
      anomaly_score: analysis.anomaly_score,
      reconstruction_error: analysis.reconstruction_error,
      global_threshold: analysis.global_threshold,
      features: analysis.features,
      llm_report: narrative
    };
    const note = `[SLEEP_ACTIVITY_REPORT_JSON]\n${JSON.stringify(payload)}`;
    await apiFetch("/activity", {
      method: "POST",
      body: JSON.stringify({
        sleepHours: Number.isFinite(sleepMean) ? sleepMean : 0,
        energyLevel: riskToEnergy[analysis.risk_level] ?? 3,
        activityNotes: note
      })
    });
  }, []);

  const submitDailyCheckIn = async () => {
    if (!canSave) {
      setFormError(t.patientOnly);
      return;
    }
    setFormError(null);
    setFormSuccess(false);
    const hours = parseFloat(sleepHours.replace(",", "."));
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      setFormError(t.invalidSleep);
      return;
    }
    if (moodLevel === null) {
      setFormError(t.selectMood);
      return;
    }
    if (activityLevel === null) {
      setFormError(t.selectActivity);
      return;
    }
    setFormSaving(true);
    try {
      const noteTrim = checkInNote.trim();
      const payload = { v: 1 as const, moodLevel, activityLevel, note: noteTrim || undefined };
      await apiFetch("/activity", {
        method: "POST",
        body: JSON.stringify({
          sleepHours: hours,
          moodLevel,
          activityLevel,
          note: noteTrim || undefined,
          activityNotes: `[DAILY_CHECKIN]${JSON.stringify(payload)}`
        })
      });
      setFormSuccess(true);
      setCheckInNote("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("Forbidden")) {
        setFormError(t.patientOnly);
      } else {
        setFormError(t.checkInError);
      }
    } finally {
      setFormSaving(false);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setResult(null);
    setApiError(null);
    setFileName(file.name);
    try {
      const parsed = await parseExcel(file);
      setRows(parsed);
    } catch (e) {
      setParseError((e as Error).message);
      setRows([]);
    }
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const analyze = async () => {
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/ml/sleep-activity/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: rows }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail ?? `Error ${res.status}`);
      }
      const analysis = (await res.json()) as AnalysisResult;
      setResult(analysis);
      void persistDoctorFacingSleepReport(analysis).catch(() => {
        /* optional doctor log — ignore if session is not a patient account */
      });
    } catch (e) {
      setApiError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const riskCfg = result ? RISK_CONFIG[result.risk_level] : null;
  const reportText = result?.llm_report ? formatReportForDisplay(result.llm_report) : "";
  const insights = result ? patientInsights(result.features, result.alert) : [];

  const glance = useMemo(() => {
    if (!result || rows.length === 0) return null;
    const n = rows.length;
    const { sleepAlert, activityAlert } = sleepActivityAlertFlags(result.features);
    return { n, sleepAlert, activityAlert };
  }, [result, rows]);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-6">
          {/* Header */}
          <div className="relative overflow-hidden rounded-3xl px-6 py-7 shadow-md"
            style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 50%,#8b5cf6 100%)" }}>
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
            <div className="relative">
              <p className="text-sky-200 text-xs font-semibold uppercase tracking-widest mb-1">😴 {t.tagline}</p>
              <h1 className="text-2xl font-bold text-white">{t.title}</h1>
              <p className="mt-2 text-sky-100 text-sm max-w-xl">{t.subtitle}</p>
            </div>
          </div>

          {/* Daily check-in form */}
          <Card className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-textPrimary">{t.formTitle}</h2>
              <p className="mt-1 text-xs text-textSecondary">{t.formSubtitle}</p>
            </div>

            {!canSave && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {t.patientOnly}
              </p>
            )}

            <div>
              <label htmlFor="sleep-hours" className="mb-1.5 block text-xs font-medium text-textPrimary">
                {t.sleepHoursLabel}
              </label>
              <input
                id="sleep-hours"
                type="number"
                min={0}
                max={24}
                step={0.5}
                placeholder={t.sleepHoursHint}
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                disabled={!canSave}
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-textPrimary disabled:opacity-60 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-textPrimary">{t.moodLabel}</p>
              <p className="mb-2 text-[10px] text-textSecondary">{moodT.scaleHint}</p>
              <div className="grid grid-cols-5 gap-2">
                {MOOD_VALUES.map((value) => {
                  const key = String(value) as keyof typeof moodT.levels;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMoodLevel(value)}
                      disabled={!canSave}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        moodLevel === value
                          ? "border-primary bg-secondary text-textPrimary dark:bg-primary/20"
                          : "border-slate-200 text-textPrimary hover:border-primary/40 dark:border-slate-500 dark:bg-slate-700/80"
                      }`}
                    >
                      <span className="emoji text-base" aria-hidden>{MOOD_EMOJIS[String(value)]}</span>
                      <span className="font-semibold">{value}</span>
                      <span className="text-center text-textSecondary leading-tight">{moodT.levels[key]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-textPrimary">{t.activityLabel}</p>
              <p className="mb-2 text-[10px] text-textSecondary">{t.activityHint}</p>
              <div className="grid grid-cols-5 gap-2">
                {ACTIVITY_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActivityLevel(value)}
                    disabled={!canSave}
                    className={`rounded-xl border px-1 py-2.5 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      activityLevel === value
                        ? "border-primary bg-secondary text-textPrimary dark:bg-primary/20"
                        : "border-slate-200 text-textSecondary hover:border-primary/40 dark:border-slate-500 dark:bg-slate-700/80 dark:text-slate-200"
                    }`}
                  >
                    {t.activityLevels[String(value) as keyof typeof t.activityLevels]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="checkin-note" className="mb-1.5 block text-xs font-medium text-textPrimary">
                {t.optionalNote}
              </label>
              <textarea
                id="checkin-note"
                rows={2}
                value={checkInNote}
                onChange={(e) => setCheckInNote(e.target.value)}
                disabled={!canSave}
                placeholder={t.optionalNotePh}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-textPrimary dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>

            {formError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </p>
            )}
            {formSuccess && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                {t.checkInSaved}
              </p>
            )}

            <ButtonPrimary
              type="button"
              onClick={() => void submitDailyCheckIn()}
              disabled={formSaving || !canSave}
              className="w-full"
            >
              {formSaving ? t.savingCheckIn : t.saveCheckIn}
            </ButtonPrimary>

            <p className="text-xs leading-relaxed text-textSecondary">{t.awarenessNotice}</p>
          </Card>

          {/* Optional Excel import */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowExcelUpload((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-textSecondary transition hover:border-primary/50 hover:text-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary/50"
            >
              {showExcelUpload ? t.excelToggleHide : t.excelToggleShow}
            </button>
          </div>

          {showExcelUpload && (
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-textPrimary">{t.uploadTitle}</h2>
              <button onClick={downloadTemplate} className="text-xs text-primary hover:underline">
                {t.downloadTemplate}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {REQUIRED_COLS.map((col) => (
                <span key={col} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-textSecondary">
                  {col}
                </span>
              ))}
            </div>

            {/* Drop zone */}
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition ${
                dragging ? "border-primary bg-blue-50" : "border-slate-200 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <svg className="mb-3 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {fileName ? (
                <p className="text-sm font-medium text-textPrimary">{fileName}</p>
              ) : (
                <p className="text-sm text-textSecondary">{t.dragOrClick}</p>
              )}
              {rows.length > 0 && (
                <p className="mt-1 text-xs text-[#27AE60]">{rows.length} {t.daysLoaded}</p>
              )}
            </div>

            {parseError && (
              <p className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{parseError}</p>
            )}

            {rows.length > 0 && (
              <button onClick={analyze} disabled={loading}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                {loading ? t.analysing : t.analyzeButton}
              </button>
            )}

            {apiError && (
              <p className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {apiError.includes("fetch") || apiError.includes("Failed") || apiError.includes("aborted") ? (
                  <>
                    Cannot reach ML API at <span className="font-mono">{ML_URL}</span>
                    <code className="mt-1 block font-mono text-[11px]">POST /sleep-activity/analyze</code>
                    <span className="mt-1 block">
                      Start: <code className="rounded bg-red-100/80 px-1 py-0.5 font-mono">npm run dev:ml</code>{" "}
                      (install: <code className="rounded bg-red-100/80 px-1 py-0.5 font-mono">pip install -r apps/ml-service/requirements.txt</code>)
                    </span>
                  </>
                ) : apiError}
              </p>
            )}
          </Card>
          )}

          {/* Preview table */}
          {rows.length > 0 && !result && (
            <Card className="space-y-3 overflow-x-auto">
              <h2 className="text-sm font-semibold text-textPrimary">{t.loadedPreview} — {rows.length} {t.days}</h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {REQUIRED_COLS.map((c) => (
                      <th key={c} className="pb-2 pr-4 text-left font-medium text-textSecondary">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 text-textPrimary">{row.day_num}</td>
                      <td className="py-1.5 pr-4 text-textPrimary">{row.day_of_week}</td>
                      <td className="py-1.5 pr-4 text-textPrimary">{row.sleep_hours}</td>
                      <td className="py-1.5 pr-4 text-textPrimary">{row.activity_mims}</td>
                      <td className="py-1.5 pr-4 text-textPrimary">{row.wake_minutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Results */}
          {result && riskCfg && glance && (
            <div className="space-y-4">
              <Card className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary">{t.glanceTitle}</h2>
                  <p className="mt-1 text-xs text-textSecondary">
                    {glance.n} {t.days} · {t.glanceSub}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <span className="text-sm font-medium text-textPrimary">{t.sleep}</span>
                    {glance.sleepAlert ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{t.alert}</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{t.noAlert}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <span className="text-sm font-medium text-textPrimary">{t.activity}</span>
                    {glance.activityAlert ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{t.alert}</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{t.noAlert}</span>
                    )}
                  </div>
                </div>

                <div className={`flex flex-col gap-3 rounded-2xl border border-slate-100 p-4 sm:flex-row sm:items-start ${riskCfg.bg}`}>
                  <div className={`shrink-0 self-start rounded-xl px-3 py-1.5 text-lg font-bold ${riskCfg.text}`}>
                    {result.risk_level}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm leading-relaxed text-textPrimary">{riskCfg.desc}</p>
                    {result.alert && (
                      <p className="text-sm leading-relaxed text-textPrimary">
                        {t.awarenessNotice}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="space-y-3">
                <h2 className="text-sm font-semibold text-textPrimary">{t.patternsTitle}</h2>
                <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-textSecondary">
                  {insights.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
                <p className="text-xs leading-relaxed text-textSecondary">{t.awarenessNotice}</p>
              </Card>

              {reportText && (
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-textPrimary">{t.reportTitle}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-textSecondary">
                      {t.educationalOnly}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-textSecondary">{t.reportSub}</p>
                  <div className="max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/90 p-4 pr-3">
                    <SleepClinicalReportBody text={reportText} />
                  </div>
                  <p className="text-xs leading-relaxed text-textSecondary">{t.notMedicalAdvice}</p>
                </Card>
              )}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
