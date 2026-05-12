import { ReactNode } from "react";
import clsx from "clsx";

type Props = {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "blue" | "teal" | "lavender" | "slate";
};

const accentDot = {
  blue: "bg-sky-400",
  teal: "bg-teal-400",
  lavender: "bg-violet-400",
  slate: "bg-slate-400"
};

export default function OverviewMetric({ label, value, hint, accent = "blue" }: Props) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/50 bg-white/90 p-4 shadow-sm sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className={clsx("h-2 w-2 shrink-0 rounded-full", accentDot[accent])} aria-hidden />
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <div className="text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl">{value}</div>
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
