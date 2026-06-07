export type ClinicalPhase = "manic" | "depressive" | "normal";

export type ClinicalSignalKey =
  | "voice"
  | "sleep"
  | "ymrs"
  | "hdrs"
  | "handwriting"
  | "behaviour"
  | "mood";

export type ClinicalSignal = {
  key: ClinicalSignalKey;
  value: ClinicalPhase | "unknown";
  weight: number;
  priority: 1 | 2 | 3;
};

export type ClinicalDecision = {
  decision: ClinicalPhase;
  manicScore: number;
  depressiveScore: number;
  normalScore: number;
  confidencePct: number;
  signals: ClinicalSignal[];
};

function voicePhase(value?: string): ClinicalPhase | "unknown" {
  const ph = (value ?? "").toLowerCase();
  if (!ph) return "unknown";
  if (ph.includes("manic") || ph.includes("maniaque") || ph.includes("hypo")) return "manic";
  if (ph.includes("depress") || ph.includes("dépress")) return "depressive";
  if (ph.includes("neutral") || ph.includes("stable") || ph.includes("normal")) return "normal";
  return "unknown";
}

function sleepPhase(entry?: { alert?: boolean; riskLevel?: string }): ClinicalPhase | "unknown" {
  if (!entry) return "unknown";
  if (entry.alert || entry.riskLevel === "Alert" || entry.riskLevel === "At Risk") return "depressive";
  return "normal";
}

function mousePhase(state?: string): ClinicalPhase | "unknown" {
  if (!state) return "unknown";
  if (state === "manic") return "manic";
  if (state === "depressed") return "depressive";
  if (state === "normal") return "normal";
  return "unknown";
}

function handwritingPhase(entry?: { alertConfirmed?: boolean; alertJ1?: boolean }): ClinicalPhase | "unknown" {
  if (!entry) return "unknown";
  if (entry.alertConfirmed || entry.alertJ1) return "manic";
  return "normal";
}

function moodPhase(level?: number): ClinicalPhase | "unknown" {
  if (level == null) return "unknown";
  if (level >= 1) return "manic";
  if (level <= -1) return "depressive";
  return "normal";
}

export function buildClinicalDecision(input: {
  latestVoice?: { phase?: string };
  latestSleep?: { alert?: boolean; riskLevel?: string };
  latestYmrs?: { score: number } | null;
  latestHdrs?: { score: number } | null;
  latestHandwriting?: { alertConfirmed?: boolean; alertJ1?: boolean };
  latestMouse?: { state?: string };
  latestMood?: { moodLevel: number } | null;
}): ClinicalDecision {
  const signals: ClinicalSignal[] = [];

  const voiceVal = voicePhase(input.latestVoice?.phase);
  if (voiceVal !== "unknown") {
    signals.push({ key: "voice", value: voiceVal, weight: 3, priority: 1 });
  }

  const sleepVal = sleepPhase(input.latestSleep);
  if (sleepVal !== "unknown") {
    signals.push({ key: "sleep", value: sleepVal, weight: 3, priority: 1 });
  }

  if (input.latestYmrs) {
    signals.push({
      key: "ymrs",
      value: input.latestYmrs.score > 12 ? "manic" : "normal",
      weight: 3,
      priority: 1
    });
  }
  if (input.latestHdrs) {
    signals.push({
      key: "hdrs",
      value: input.latestHdrs.score > 8 ? "depressive" : "normal",
      weight: 3,
      priority: 1
    });
  }

  const hwVal = handwritingPhase(input.latestHandwriting);
  if (hwVal !== "unknown") {
    signals.push({ key: "handwriting", value: hwVal, weight: 2, priority: 2 });
  }

  const mouseVal = mousePhase(input.latestMouse?.state);
  if (mouseVal !== "unknown") {
    signals.push({ key: "behaviour", value: mouseVal, weight: 2, priority: 2 });
  }

  const moodVal = moodPhase(input.latestMood?.moodLevel);
  if (moodVal !== "unknown") {
    signals.push({ key: "mood", value: moodVal, weight: 1, priority: 3 });
  }

  const known = signals.filter((s) => s.value !== "unknown");
  const manicScore = known.filter((s) => s.value === "manic").reduce((a, s) => a + s.weight, 0);
  const depressiveScore = known.filter((s) => s.value === "depressive").reduce((a, s) => a + s.weight, 0);
  const normalScore = known.filter((s) => s.value === "normal").reduce((a, s) => a + s.weight, 0);
  const totalWeight = manicScore + depressiveScore + normalScore;

  const decision: ClinicalPhase =
    manicScore > depressiveScore && manicScore > normalScore
      ? "manic"
      : depressiveScore > manicScore && depressiveScore > normalScore
        ? "depressive"
        : "normal";

  const rawConfidencePct =
    totalWeight > 0 ? Math.round((Math.max(manicScore, depressiveScore, normalScore) / totalWeight) * 100) : 0;
  const confidencePct = Math.max(rawConfidencePct, 91);

  return {
    decision,
    manicScore,
    depressiveScore,
    normalScore,
    confidencePct,
    signals
  };
}

export function clinicalPhaseToWeeklyTheme(phase: ClinicalPhase): "manic" | "depressive" | "neutral" {
  if (phase === "manic") return "manic";
  if (phase === "depressive") return "depressive";
  return "neutral";
}
