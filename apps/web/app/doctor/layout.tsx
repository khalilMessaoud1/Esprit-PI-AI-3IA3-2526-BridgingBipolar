"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

const NAV_ITEMS = [
  { key: "patientsTitle",     href: "/doctor/patients",      emoji: "👥" },
  { key: "notificationsTitle",href: "/doctor/notifications",  emoji: "🔔" },
  { key: "calendarTitle",     href: "/doctor/calendar",       emoji: "📆" },
] as const;

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const nav = uiText[language].nav;
  const isFr = language === "fr";
  const isAr = language === "ar";

  const [codePopupOpen, setCodePopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!codePopupOpen) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setCodePopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [codePopupOpen]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "DOCTOR") router.replace("/dashboard");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "DOCTOR") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500"
        style={{ background: "linear-gradient(135deg,#f0f4ff,#faf5ff)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          {t.loading}
        </div>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || (href !== "/doctor" && pathname.startsWith(href));

  return (
    <div className="flex min-h-screen" style={{ background: "linear-gradient(135deg,#f0f4ff 0%,#faf5ff 50%,#f0fdf4 100%)" }}>

      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200/60 bg-white/90 shadow-lg backdrop-blur-sm">
        {/* Brand */}
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg shadow-sm"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              🧠
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">BridgingBipolar</div>
              <div className="text-sm font-bold text-slate-900">🩺 {t.workspace}</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {NAV_ITEMS.map(({ key, href, emoji }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
                isActive(href)
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
              }`}>
              <span className="text-base">{emoji}</span>
              <span>{String((t as unknown as Record<string, unknown>)[key] ?? key)}</span>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 space-y-2">

          {/* Clickable doctor name → code popup */}
          {user.name && (
            <div ref={popupRef} className="relative">
              <button
                type="button"
                onClick={() => setCodePopupOpen(v => !v)}
                className="flex w-full items-center gap-2.5 rounded-2xl bg-slate-50 hover:bg-sky-50 hover:border-sky-200 border border-transparent px-3 py-2 transition-all text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{user.name}</div>
                  <div className="text-[10px] text-sky-500 font-medium">
                    {isFr ? "Voir mon code" : isAr ? "عرض رمزي" : "View my code"} ↑
                  </div>
                </div>
              </button>

              {/* Code popup — opens above the button */}
              {codePopupOpen && (() => {
                const code = `BB-${(user.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
                return (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-50 rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl">
                    {/* Triangle pointer */}
                    <div className="absolute bottom-[-8px] left-6 h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-sky-200" />
                    <div className="absolute bottom-[-7px] left-6 h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />

                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-1">
                      {isFr ? "Code médecin" : isAr ? "رمز الطبيب" : "Doctor code"}
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mb-3 truncate">{user.name}</p>

                    <div className="flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 mb-3">
                      <span className="font-mono text-xl font-black text-sky-700 tracking-widest flex-1">{code}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(code)}
                        className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-sky-700 transition-colors shrink-0"
                      >
                        📋 {isFr ? "Copier" : isAr ? "نسخ" : "Copy"}
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {isFr
                        ? "Partagez ce code avec vos patients lors de leur inscription pour qu'ils soient automatiquement affectés à vous."
                        : isAr
                        ? "شارك هذا الرمز مع مرضاك عند تسجيلهم ليتم تعيينهم لك تلقائياً."
                        : "Share this code with your patients at sign-up so they are automatically assigned to you."}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <button type="button" onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            🚪 {nav.logout}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
