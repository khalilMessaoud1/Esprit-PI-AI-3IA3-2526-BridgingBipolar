import { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12 bg-gradient-to-br from-indigo-50 via-purple-50 to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-20 dark:opacity-10"
          style={{ background: "radial-gradient(circle,#818cf8,transparent)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-15 dark:opacity-10"
          style={{ background: "radial-gradient(circle,#34d399,transparent)" }}
        />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="BridgingBipolar" className="mx-auto mb-3 h-20 w-auto max-w-[16rem] object-contain drop-shadow-lg" />
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-300">
            BridgingBipolar
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>

        <div className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90">
          {children}
        </div>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          BridgingBipolar · AI-powered bipolar disorder monitoring
        </p>
      </div>
    </div>
  );
}
