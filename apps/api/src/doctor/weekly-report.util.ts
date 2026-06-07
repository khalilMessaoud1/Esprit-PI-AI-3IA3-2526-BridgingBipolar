export type WeeklyTheme = "manic" | "depressive" | "neutral";

export type WeeklyVisualReport = {
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

function inLastDays(iso: Date | string, days = 7): boolean {
  const d = new Date(iso);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

function dayLabel(iso: Date | string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

function isStructuredReportLog(notes: string | null | undefined): boolean {
  if (!notes || !notes.startsWith("[")) return false;
  return (
    notes.startsWith("[SLEEP_ACTIVITY_REPORT") ||
    notes.startsWith("[HANDWRITING_RESULT_JSON]")
  );
}

function phaseBucket(phase?: string): "manic" | "depressive" | "neutral" {
  const p = (phase ?? "").toLowerCase();
  if (p.includes("manic") || p.includes("maniaque") || p.includes("hypo")) return "manic";
  if (p.includes("depress") || p.includes("dépress")) return "depressive";
  return "neutral";
}

function scoreTheme(manic: number, depressive: number): WeeklyTheme {
  if (manic > depressive && manic >= 2) return "manic";
  if (depressive > manic && depressive >= 2) return "depressive";
  if (manic > depressive) return "manic";
  if (depressive > manic) return "depressive";
  return "neutral";
}

type PatientSlice = {
  moodEntries: { moodLevel: number; createdAt: Date }[];
  assessments: { type: string; score: number; createdAt: Date }[];
  activityLogs: { sleepHours: number; energyLevel: number; activityNotes: string | null; createdAt: Date }[];
};

export function buildWeeklyVisualReport(input: {
  patient: PatientSlice;
  voiceHistory: { createdAt: Date; phase?: string; confidence?: number }[];
  sleepHistory: { createdAt: Date; riskLevel: string; alert: boolean; anomalyScore?: number }[];
  medicationAdherence: {
    adherencePercent: number | null;
    regular: boolean | null;
  } | null;
  voiceXaiReport: {
    phase?: string;
    confidence?: number;
    frequencySummary?: Record<string, number>;
    waveformPngB64?: string;
    spectrogramPngB64?: string;
  } | null;
  sleepActivityReport: {
    format: string;
    createdAt?: Date;
    riskLevel?: string;
    alert?: boolean;
    anomalyScore?: number;
    features?: Record<string, number>;
  } | null;
  themeOverride?: WeeklyTheme;
}): WeeklyVisualReport {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  let manicSignals = 0;
  let depressiveSignals = 0;

  const moods = input.patient.moodEntries
    .filter((m) => inLastDays(m.createdAt))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (moods.length) {
    const avg = moods.reduce((s, m) => s + m.moodLevel, 0) / moods.length;
    if (avg >= 1) manicSignals += 2;
    else if (avg <= -1) depressiveSignals += 2;
    const latest = moods[moods.length - 1]!.moodLevel;
    if (latest >= 2) manicSignals += 2;
    else if (latest <= -2) depressiveSignals += 2;
  }

  const ymrsInWeek = input.patient.assessments.filter((a) => a.type === "YMRS" && inLastDays(a.createdAt));
  const hdrsInWeek = input.patient.assessments.filter((a) => a.type === "HDRS" && inLastDays(a.createdAt));
  const latestYmrs = ymrsInWeek[0]?.score ?? input.patient.assessments.find((a) => a.type === "YMRS")?.score ?? null;
  const latestHdrs = hdrsInWeek[0]?.score ?? input.patient.assessments.find((a) => a.type === "HDRS")?.score ?? null;

  if (latestYmrs != null && latestYmrs >= 12) manicSignals += 2;
  if (latestHdrs != null && latestHdrs >= 8) depressiveSignals += 2;

  const voiceInWeek = input.voiceHistory.filter((v) => inLastDays(v.createdAt));
  const voiceCounts = { manic: 0, depressive: 0, neutral: 0 };
  for (const v of voiceInWeek) {
    const b = phaseBucket(v.phase);
    voiceCounts[b] += 1;
    if (b === "manic") manicSignals += 1;
    if (b === "depressive") depressiveSignals += 1;
  }
  if (input.voiceXaiReport?.phase) {
    const b = phaseBucket(input.voiceXaiReport.phase);
    if (b === "manic") manicSignals += 1;
    if (b === "depressive") depressiveSignals += 1;
  }

  const sleepInWeek = input.sleepHistory.filter((s) => inLastDays(s.createdAt));
  if (sleepInWeek.some((s) => s.alert)) {
    manicSignals += 1;
    depressiveSignals += 1;
  }

  const theme = input.themeOverride ?? scoreTheme(manicSignals, depressiveSignals);

  const moodSeries = moods.map((m) => ({ day: dayLabel(m.createdAt), mood: m.moodLevel }));

  const ymrsHistory = ymrsInWeek
    .slice()
    .reverse()
    .map((a) => ({ day: dayLabel(a.createdAt), score: a.score }));
  const hdrsHistory = hdrsInWeek
    .slice()
    .reverse()
    .map((a) => ({ day: dayLabel(a.createdAt), score: a.score }));

  const sleepSeries = input.patient.activityLogs
    .filter((a) => inLastDays(a.createdAt) && !isStructuredReportLog(a.activityNotes))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((a) => ({
      day: dayLabel(a.createdAt),
      hours: a.sleepHours,
      energy: a.energyLevel
    }));

  const voicePhases = [
    { name: "manic", count: voiceCounts.manic },
    { name: "depressive", count: voiceCounts.depressive },
    { name: "neutral", count: voiceCounts.neutral }
  ].filter((v) => v.count > 0);

  const voiceSessionCount = voiceCounts.manic + voiceCounts.depressive + voiceCounts.neutral;
  const latestVoicePhase =
    input.voiceXaiReport?.phase != null
      ? phaseBucket(input.voiceXaiReport.phase)
      : voiceInWeek[0]?.phase != null
        ? phaseBucket(voiceInWeek[0].phase)
        : null;
  const latestVoiceConfidence =
    input.voiceXaiReport?.confidence ?? voiceInWeek[0]?.confidence ?? null;

  const freq = input.voiceXaiReport?.frequencySummary;
  const frequencyBands = freq
    ? Object.entries(freq)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([band, value]) => ({ band, value: Number(value) }))
    : [];

  const sleepReport =
    input.sleepActivityReport?.format === "structured" ? input.sleepActivityReport : null;
  const sleepReportInPeriod = Boolean(sleepReport?.createdAt && inLastDays(sleepReport.createdAt));
  const latestSleep = sleepInWeek[0];

  const sleepMetricKeys = ["sleep_mean", "sleep_std", "social_jet_lag"] as const;
  const activityMetricKeys = ["act_mean"] as const;
  const mapMetric = (k: string) => ({
    label: k.replace(/_/g, " "),
    value: sleepReport!.features![k] as number
  });
  const sleepMetrics =
    sleepReportInPeriod && sleepReport?.features
      ? sleepMetricKeys
          .filter((k) => typeof sleepReport.features![k] === "number")
          .map(mapMetric)
      : [];
  const activityMetrics =
    sleepReportInPeriod && sleepReport?.features
      ? activityMetricKeys
          .filter((k) => typeof sleepReport.features![k] === "number")
          .map(mapMetric)
      : [];

  const anomalyRaw =
    sleepReportInPeriod && sleepReport?.anomalyScore != null
      ? sleepReport.anomalyScore
      : latestSleep?.anomalyScore != null
        ? latestSleep.anomalyScore
        : null;
  const anomalyPct = anomalyRaw != null ? Math.round(anomalyRaw * 100) : null;

  const hasDailySleep = sleepSeries.length > 0;

  return {
    theme,
    periodStart: weekStart.toISOString(),
    periodEnd: now.toISOString(),
    generatedAt: now.toISOString(),
    moodSeries,
    latestYmrs,
    latestHdrs,
    ymrsHistory,
    hdrsHistory,
    sleepSeries,
    voicePhases,
    voiceConfidence: latestVoiceConfidence,
    latestVoicePhase,
    voiceSessionCount,
    sleepRiskLevel: hasDailySleep
      ? (latestSleep?.riskLevel ?? null)
      : sleepReportInPeriod
        ? (sleepReport?.riskLevel ?? null)
        : (latestSleep?.riskLevel ?? null),
    sleepAnomalyPct: hasDailySleep
      ? latestSleep?.anomalyScore != null
        ? Math.round(latestSleep.anomalyScore * 100)
        : null
      : sleepReportInPeriod
        ? anomalyPct
        : null,
    sleepAlert: hasDailySleep
      ? Boolean(latestSleep?.alert)
      : sleepReportInPeriod
        ? Boolean(sleepReport?.alert)
        : false,
    sleepWeeklyReport: {
      inPeriod: sleepReportInPeriod,
      riskLevel: sleepReportInPeriod ? (sleepReport?.riskLevel ?? null) : null,
      alert: sleepReportInPeriod ? Boolean(sleepReport?.alert) : false,
      anomalyPct: sleepReportInPeriod ? anomalyPct : null,
      sleepMetrics,
      activityMetrics
    },
    adherencePercent: input.medicationAdherence?.adherencePercent ?? null,
    adherenceRegular: input.medicationAdherence?.regular ?? null,
    frequencyBands,
    hasWaveform: Boolean(input.voiceXaiReport?.waveformPngB64),
    hasSpectrogram: Boolean(input.voiceXaiReport?.spectrogramPngB64),
    manicSignals,
    depressiveSignals
  };
}
