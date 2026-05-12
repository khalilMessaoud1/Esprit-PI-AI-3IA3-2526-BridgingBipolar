import { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg,#f0f4ff 0%,#faf5ff 50%,#f0fdf4 100%)" }}>

      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle,#818cf8,transparent)" }} />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle,#34d399,transparent)" }} />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="BridgingBipolar" className="mx-auto mb-3 h-20 w-20 drop-shadow-lg" />
          <div className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">BridgingBipolar</div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl backdrop-blur-sm space-y-5">
          {children}
        </div>

        <p className="text-center text-[11px] text-slate-400">
          BridgingBipolar · AI-powered bipolar disorder monitoring
        </p>
      </div>
    </div>
  );
}
