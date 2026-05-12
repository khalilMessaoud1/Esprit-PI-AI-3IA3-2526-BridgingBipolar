/** Phases returned by the bipolar monitor on `/predict_audio`. */
export type VoicePhase = "depressive" | "neutral" | "manic";

const PHASES: VoicePhase[] = ["manic", "neutral", "depressive"];

function normalizePhase(raw: string | undefined | null): VoicePhase | null {
  const p = String(raw || "").toLowerCase();
  if (p === "depressive" || p === "neutral" || p === "manic") return p;
  return null;
}

/**
 * Majority vote over successful voice detections only (`monitor_reached`).
 * Tie-break order: manic → neutral → depressive (first among max count).
 */
export function majorityVoicePhaseReport(phases: (string | null | undefined)[]): {
  counts: Record<VoicePhase, number>;
  winner: VoicePhase | null;
  totalVotes: number;
} {
  const counts: Record<VoicePhase, number> = { depressive: 0, neutral: 0, manic: 0 };
  for (const raw of phases) {
    const p = normalizePhase(raw);
    if (p) counts[p] += 1;
  }
  const totalVotes = counts.depressive + counts.neutral + counts.manic;
  if (totalVotes === 0) {
    return { counts, winner: null, totalVotes: 0 };
  }
  const best = Math.max(counts.manic, counts.neutral, counts.depressive);
  const winner = PHASES.find((k) => counts[k] === best) ?? null;
  return { counts, winner, totalVotes };
}

export function b64PngDataUrl(b64: string): string {
  const t = b64.trim();
  if (!t) return "";
  if (t.startsWith("data:image")) return t;
  return `data:image/png;base64,${t}`;
}
