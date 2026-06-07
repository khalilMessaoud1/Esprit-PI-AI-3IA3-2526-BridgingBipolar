"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { b64PngDataUrl } from "../../lib/voicePhaseReport";

export type WeeklyTheme = "manic" | "depressive" | "neutral";

export type WeeklyVisualReportData = {
  theme: WeeklyTheme;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  moodSeries: { day: string; mood: number }[];
  latestYmrs: number | null;
  latestHdrs: number | null;
  ymrsHistory: { day: string; score: number }[];
  hdrsHistory: { day: string; score: number }[];
  sleepSeries: { day: string; hours: number; energy: number }[];
  voicePhases: { name: string; count: number }[];
  voiceConfidence: number | null;
  latestVoicePhase: "manic" | "depressive" | "neutral" | null;
  voiceSessionCount: number;
  sleepRiskLevel: string | null;
  sleepAnomalyPct: number | null;
  sleepAlert: boolean;
  sleepWeeklyReport: {
    inPeriod: boolean;
    riskLevel: string | null;
    alert: boolean;
    anomalyPct: number | null;
    sleepMetrics: { label: string; value: number }[];
    activityMetrics: { label: string; value: number }[];
  };
  adherencePercent: number | null;
  adherenceRegular: boolean | null;
  frequencyBands: { band: string; value: number }[];
  hasWaveform: boolean;
  hasSpectrogram: boolean;
  manicSignals: number;
  depressiveSignals: number;
};

const THEMES: Record<
  WeeklyTheme,
  { gradient: string; border: string; primary: string; soft: string; badge: string; labelFr: string; labelEn: string }
> = {
  manic: {
    gradient: "linear-gradient(135deg,#ecfdf5 0%,#bbf7d0 45%,#86efac 100%)",
    border: "#22c55e",
    primary: "#16a34a",
    soft: "#dcfce7",
    badge: "bg-green-600 text-white",
    labelFr: "Profil maniaque",
    labelEn: "Manic profile"
  },
  depressive: {
    gradient: "linear-gradient(135deg,#fef2f2 0%,#fecaca 45%,#fca5a5 100%)",
    border: "#ef4444",
    primary: "#dc2626",
    soft: "#fee2e2",
    badge: "bg-red-600 text-white",
    labelFr: "Profil dépressif",
    labelEn: "Depressive profile"
  },
  neutral: {
    gradient: "linear-gradient(135deg,#f0f9ff 0%,#bae6fd 45%,#7dd3fc 100%)",
    border: "#38bdf8",
    primary: "#0284c7",
    soft: "#e0f2fe",
    badge: "bg-sky-500 text-white",
    labelFr: "Profil neutre",
    labelEn: "Neutral profile"
  }
};

const VOICE_COLORS: Record<string, string> = {
  manic: "#22c55e",
  depressive: "#ef4444",
  neutral: "#38bdf8"
};

const VOICE_PHASE_LABEL: Record<string, { fr: string; en: string }> = {
  manic: { fr: "Maniaque", en: "Manic" },
  depressive: { fr: "Dépressif", en: "Depressive" },
  neutral: { fr: "Neutre", en: "Neutral" }
};

function voicePhaseLabel(phase: string, isFr: boolean): string {
  const row = VOICE_PHASE_LABEL[phase];
  return row ? (isFr ? row.fr : row.en) : phase;
}

type Props = {
  patientName: string;
  report: WeeklyVisualReportData;
  waveformB64?: string;
  spectrogramB64?: string;
  language: "en" | "fr" | "ar";
  disclaimer: string;
};

function GaugeBar({
  label,
  value,
  max,
  threshold,
  color,
  emptyLabel,
  isFr
}: {
  label: string;
  value: number | null;
  max: number;
  threshold: number;
  color: string;
  emptyLabel: string;
  isFr: boolean;
}) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  const over = value != null && value >= threshold;
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/80">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span className={over ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}>
          {value != null ? value : emptyLabel}
        </span>
      </div>
      <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: over ? "#ef4444" : color }}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        {isFr ? `Seuil clinique : ${threshold}` : `Clinical threshold: ${threshold}`}
      </p>
    </div>
  );
}

export default function WeeklyVisualReport({
  patientName,
  report,
  waveformB64,
  spectrogramB64,
  language,
  disclaimer
}: Props) {
  const isFr = language === "fr";
  const theme = THEMES[report.theme];
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar" : "en-US";
  const periodLabel = `${new Date(report.periodStart).toLocaleDateString(locale)} → ${new Date(report.periodEnd).toLocaleDateString(locale)}`;
  const empty = "—";

  const mergedAssessment = (() => {
    const map = new Map<string, { day: string; ymrs?: number; hdrs?: number }>();
    for (const r of report.ymrsHistory) {
      map.set(r.day, { ...(map.get(r.day) ?? { day: r.day }), ymrs: r.score });
    }
    for (const r of report.hdrsHistory) {
      map.set(r.day, { ...(map.get(r.day) ?? { day: r.day }), hdrs: r.score });
    }
    return [...map.values()];
  })();

  const hasDailySleep = report.sleepSeries.length > 0;
  const weeklySleep = report.sleepWeeklyReport;
  const hasWeeklySleep =
    weeklySleep.inPeriod && (weeklySleep.sleepMetrics.length > 0 || weeklySleep.activityMetrics.length > 0);
  const showSleepAlert =
    (hasDailySleep && (report.sleepAlert || report.sleepRiskLevel != null || report.sleepAnomalyPct != null)) ||
    (!hasDailySleep &&
      weeklySleep.inPeriod &&
      (weeklySleep.alert || weeklySleep.riskLevel != null || weeklySleep.anomalyPct != null));
  const showVoicePie = report.voiceSessionCount >= 3 && report.voicePhases.length >= 2;
  const latestVoice = report.latestVoicePhase;

  return (
    <div
      className="overflow-hidden rounded-3xl border-2 shadow-lg dark:shadow-none"
      style={{ borderColor: theme.border, background: theme.gradient }}
    >
      {/* Header */}
      <div className="px-6 py-5 sm:flex sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">
            {isFr ? "Rapport hebdomadaire · 7 jours" : "Weekly report · 7 days"}
          </p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{patientName}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{periodLabel}</p>
        </div>
        <span className={`mt-3 inline-flex sm:mt-0 rounded-full px-4 py-2 text-sm font-bold shadow ${theme.badge}`}>
          {isFr ? theme.labelFr : theme.labelEn}
        </span>
      </div>

      <div className="grid gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-2">
        {/* Mood line */}
        <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85 lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
            {isFr ? "📈 Humeur (7 jours)" : "📈 Mood (7 days)"}
          </h3>
          {report.moodSeries.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.moodSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="mood" stroke={theme.primary} strokeWidth={3} dot={{ r: 5, fill: theme.primary }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">{isFr ? "Aucun check-in cette semaine" : "No check-ins this week"}</p>
          )}
        </div>

        {/* YMRS / HDRS gauges */}
        <GaugeBar
          label="YMRS"
          value={report.latestYmrs}
          max={60}
          threshold={12}
          color={theme.primary}
          emptyLabel={empty}
          isFr={isFr}
        />
        <GaugeBar
          label="HDRS"
          value={report.latestHdrs}
          max={52}
          threshold={8}
          color={theme.primary}
          emptyLabel={empty}
          isFr={isFr}
        />

        {/* Assessment trend */}
        {mergedAssessment.length > 0 && (
          <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85 lg:col-span-2">
            <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              {isFr ? "📊 Questionnaires" : "📊 Assessments"}
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mergedAssessment}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="ymrs" name="YMRS" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hdrs" name="HDRS" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Sleep */}
        <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85">
          <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
            {isFr ? "😴 Sommeil & énergie" : "😴 Sleep & energy"}
          </h3>
          {hasDailySleep ? (
            <>
              <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                {isFr ? "Check-in quotidien" : "Daily check-in"}
              </p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={report.sleepSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} />
                    <YAxis yAxisId="left" domain={[0, 24]} />
                    <YAxis yAxisId="right" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="hours" name={isFr ? "Heures" : "Hours"} fill={theme.primary} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="energy" name={isFr ? "Énergie" : "Energy"} stroke="#f59e0b" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {hasWeeklySleep && (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-600">
                  <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                    {isFr ? "Import Excel (référence)" : "Excel import (reference)"}
                  </p>
                  {weeklySleep.sleepMetrics.length > 0 && (
                    <div className="h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklySleep.sleepMetrics}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 8 }} />
                          <YAxis domain={[0, "auto"]} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#64748b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {weeklySleep.activityMetrics.length > 0 && (
                    <div className="mt-2 h-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklySleep.activityMetrics}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 8 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : hasWeeklySleep ? (
            <>
              <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                {isFr ? "Rapport hebdomadaire (import Excel)" : "Weekly report (Excel import)"}
              </p>
              {weeklySleep.sleepMetrics.length > 0 && (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklySleep.sleepMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis domain={[0, "auto"]} />
                      <Tooltip />
                      <Bar dataKey="value" fill={theme.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {weeklySleep.activityMetrics.length > 0 && (
                <div className={`h-28 ${weeklySleep.sleepMetrics.length > 0 ? "mt-2" : ""}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklySleep.activityMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#64748b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">
              {isFr ? "Aucune donnée sommeil cette semaine" : "No sleep data this week"}
            </p>
          )}
          {showSleepAlert && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${
                (hasDailySleep ? report.sleepAlert : weeklySleep.alert)
                  ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                  : "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
              }`}
            >
              {(hasDailySleep ? report.sleepRiskLevel : weeklySleep.riskLevel) ??
                (isFr ? "Analyse disponible" : "Analysis available")}
              {(hasDailySleep ? report.sleepAnomalyPct : weeklySleep.anomalyPct) != null && (
                <span className="ml-1 font-normal opacity-90">
                  · {isFr ? "Indice d'irrégularité" : "Irregularity index"}{" "}
                  {hasDailySleep ? report.sleepAnomalyPct : weeklySleep.anomalyPct}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Voice */}
        <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85">
          <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
            {isFr ? "🎙 Analyse vocale" : "🎙 Voice analysis"}
          </h3>
          {showVoicePie ? (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={report.voicePhases}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, count }) => `${voicePhaseLabel(String(name), isFr)} (${count})`}
                  >
                    {report.voicePhases.map((entry) => (
                      <Cell key={entry.name} fill={VOICE_COLORS[entry.name] ?? theme.primary} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, voicePhaseLabel(String(name), isFr)]} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-[10px] text-slate-500">
                {report.voiceSessionCount} {isFr ? "enregistrements cette semaine" : "recordings this week"}
              </p>
            </div>
          ) : latestVoice ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div
                className="rounded-2xl px-6 py-4 text-center text-white shadow-md"
                style={{ background: VOICE_COLORS[latestVoice] ?? theme.primary }}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">
                  {isFr ? "Dernière analyse" : "Latest analysis"}
                </p>
                <p className="mt-1 text-2xl font-black">{voicePhaseLabel(latestVoice, isFr)}</p>
                {report.voiceConfidence != null && (
                  <p className="mt-2 text-sm font-semibold opacity-95">
                    {isFr ? "Fiabilité" : "Confidence"} {(report.voiceConfidence * 100).toFixed(0)}%
                  </p>
                )}
              </div>
              {report.voiceSessionCount > 1 && (
                <p className="mt-3 text-[10px] text-slate-500">
                  {report.voiceSessionCount} {isFr ? "sessions cette semaine" : "sessions this week"}
                </p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">
              {isFr ? "Aucun enregistrement vocal cette semaine" : "No voice recordings this week"}
            </p>
          )}
        </div>

        {/* Frequency bands */}
        {report.frequencyBands.length > 0 && (
          <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85">
            <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              {isFr ? "🔊 Profil fréquentiel" : "🔊 Frequency profile"}
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.frequencyBands} layout="vertical">
                  <XAxis type="number" domain={[0, 1]} />
                  <YAxis type="category" dataKey="band" width={70} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={theme.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Medication adherence */}
        {report.adherencePercent != null && (
          <div className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/85">
            <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              {isFr ? "💊 Observance" : "💊 Adherence"}
            </h3>
            <div className="flex flex-col items-center justify-center py-4">
              <div
                className="text-4xl font-black"
                style={{ color: report.adherenceRegular ? "#16a34a" : "#ef4444" }}
              >
                {report.adherencePercent}%
              </div>
              <div className="mt-2 h-3 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${report.adherencePercent}%`,
                    background: report.adherenceRegular ? "#22c55e" : "#ef4444"
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Acoustic images */}
        {(waveformB64 || spectrogramB64) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            {waveformB64 && (
              <figure className="rounded-2xl border border-white/70 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/90">
                <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                  {isFr ? "Forme d'onde" : "Waveform"}
                </figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b64PngDataUrl(waveformB64)} alt="" className="max-h-40 w-full object-contain" />
              </figure>
            )}
            {spectrogramB64 && (
              <figure className="rounded-2xl border border-white/70 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/90">
                <figcaption className="mb-2 text-xs font-semibold text-slate-500">
                  {isFr ? "Spectrogramme" : "Spectrogram"}
                </figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b64PngDataUrl(spectrogramB64)} alt="" className="max-h-40 w-full object-contain" />
              </figure>
            )}
          </div>
        )}
      </div>

      <p className="border-t border-white/50 px-6 py-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-600 dark:text-slate-400">
        {disclaimer}
      </p>
    </div>
  );
}
