"use client";

import SectionCard from "../ui/SectionCard";
import { type MouseBehavior } from "../../hooks/useMouseTracker";

const STATE_CONFIG = {
  normal: { label: "Steady rhythm", bg: "bg-teal-50 dark:bg-teal-950/50", text: "text-teal-800 dark:text-teal-300", bar: "#5FB8A8", desc: "Movement pattern close to your usual baseline." },
  manic: { label: "Elevated rhythm", bg: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-900 dark:text-amber-300", bar: "#E8B87A", desc: "Possible elevated activation — worth monitoring with your clinician." },
  depressed: { label: "Reduced rhythm", bg: "bg-slate-100 dark:bg-indigo-950/40", text: "text-slate-700 dark:text-indigo-300", bar: "#94A8B8", desc: "Slower movement pattern — gentle check-in with yourself or your team may help." },
  pending: { label: "Collecting signal", bg: "bg-slate-50 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", bar: "#94a3b8", desc: "We are still gathering enough interaction samples for a stable read." }
};

export default function MouseRhythmPanel({ behavior }: { behavior: MouseBehavior }) {
  const stateKey = behavior.state in STATE_CONFIG ? behavior.state : "pending";
  const cfg = STATE_CONFIG[stateKey as keyof typeof STATE_CONFIG];
  const score = Number(behavior.score) || 0;
  const level = behavior.level ?? "Low";
  const windows = Number(behavior.windowCount) || 0;
  const anomalyPct = Number(behavior.anomalyPct) || 0;
  const connected = Boolean(behavior.connected);
  const eventCount = Number(behavior.eventCount) || 0;
  const updatedAt = behavior.lastUpdated ? new Date(behavior.lastUpdated).toLocaleTimeString() : null;

  return (
    <SectionCard
      id="activity-rhythm"
      variant="teal"
      title="Digital activity rhythm"
      subtitle="Movement and timing patterns on this device complement voice-based monitoring. Same underlying analysis as before — clearer presentation only."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                connected ? "bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-teal-500" : "bg-amber-500"}`} />
              {connected ? "Analysis service connected" : "Analysis service offline"}
            </span>
            {updatedAt && <span className="text-xs text-slate-500 dark:text-slate-400">Updated {updatedAt}</span>}
          </div>
        </div>

        {!connected && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            The local analysis service is not running. When you are ready to test, start it with:
            <code className="mt-1 block rounded-lg bg-white/80 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
              cd apps/ml-service &amp;&amp; uvicorn main:app --reload --port 5000
            </code>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{cfg.desc}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Agitation / dysregulation index</span>
                <span>
                  {(score * 100).toFixed(0)}% — {level}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score * 100}%`, backgroundColor: cfg.bar }} />
              </div>
            </div>
          </div>
          {/* Show live buffer when in patient mode (eventCount > 0),
              or analysis-window summary when viewing historical doctor data */}
          {(eventCount > 0 || windows > 0) && (
            <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 text-right dark:border-slate-600 dark:bg-slate-900/50 sm:min-w-[140px]">
              {eventCount > 0 ? (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Buffered events</span>
                  <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{eventCount}</span>
                </>
              ) : null}
              {windows > 0 && (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {eventCount > 0 ? "" : "Analysis windows"}
                  </span>
                  <span className={eventCount > 0 ? "text-xs text-slate-500 dark:text-slate-400" : "text-2xl font-semibold text-slate-800 dark:text-slate-100"}>
                    {eventCount > 0 ? `${windows} window${windows > 1 ? "s" : ""}` : windows}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{anomalyPct.toFixed(0)}% flagged</span>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          AI-assisted behavioral indicator only — not a diagnosis. Processing stays on-device where configured.
        </p>
      </div>
    </SectionCard>
  );
}
