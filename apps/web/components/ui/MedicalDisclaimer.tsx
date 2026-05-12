export default function MedicalDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-slate-200/70 bg-slate-50/90 px-3 py-2 text-[11px] leading-relaxed text-slate-600"
          : "rounded-2xl border border-sky-100/80 bg-gradient-to-r from-sky-50/90 via-white to-violet-50/50 px-4 py-3 text-xs leading-relaxed text-slate-600 sm:px-5 sm:py-4 sm:text-sm"
      }
      role="note"
    >
      <span className="font-medium text-slate-700">Important: </span>
      This system supports monitoring and does not replace clinical diagnosis. AI-assisted insights are indicators only —
      not a medical diagnosis. Please discuss any concerns with your care team.
    </div>
  );
}
