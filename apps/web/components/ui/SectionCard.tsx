import { ReactNode } from "react";
import clsx from "clsx";

type Props = {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  id?: string;
  variant?: "default" | "muted" | "lavender" | "teal";
};

const variants = {
  default: "border-slate-200/60 bg-white dark:border-slate-600 dark:bg-slate-800/90",
  muted: "border-slate-200/50 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-900/50",
  lavender: "border-violet-100/80 bg-[#FAF8FF] dark:border-violet-800/60 dark:bg-violet-950/30",
  teal: "border-teal-100/80 bg-[#F4FBFA] dark:border-teal-800/60 dark:bg-slate-800/90"
};

export default function SectionCard({ children, className, title, subtitle, id, variant = "default" }: Props) {
  return (
    <section
      id={id}
      className={clsx(
        "rounded-2xl border p-5 shadow-soft transition-shadow duration-300 sm:p-6",
        "hover:shadow-[0_12px_40px_rgba(46,58,89,0.07)] dark:hover:shadow-none",
        variants[variant],
        className
      )}
    >
      {(title || subtitle) && (
        <header className="mb-4 space-y-1">
          {title && <h2 className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">{title}</h2>}
          {subtitle && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
