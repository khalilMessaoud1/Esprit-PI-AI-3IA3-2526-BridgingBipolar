"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import ProtectedRoute from "./ProtectedRoute";
import { useLanguage } from "../hooks/useLanguage";
import { useAuth } from "../hooks/useAuth";
import { uiText } from "../lib/i18n";

type Props = {
  children: ReactNode;
};

const profileIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.6-3.6 5-5 8-5s6.4 1.4 8 5" strokeLinecap="round" />
  </svg>
);
const languageIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" strokeLinecap="round" />
    <path d="M12 3c3 3 3 15 0 18" strokeLinecap="round" />
    <path d="M12 3c-3 3-3 15 0 18" strokeLinecap="round" />
  </svg>
);
const appearanceIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
  </svg>
);
const notificationsIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M6 8a6 6 0 0 1 12 0v5l2 2H4l2-2V8" strokeLinecap="round" />
    <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
  </svg>
);
const privacyIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4" strokeLinecap="round" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" />
  </svg>
);
const logoutIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M9 7v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
    <path d="M5 12h9" strokeLinecap="round" />
    <path d="M10 9l4 3-4 3" strokeLinecap="round" />
  </svg>
);

const linkClass = (isActive: boolean) =>
  `flex items-center gap-3 rounded-lg border px-3 py-2 text-xs transition ${
    isActive
      ? "border-primary bg-secondary text-textPrimary"
      : "border-transparent text-textSecondary hover:border-primary/40 hover:bg-secondary/30"
  }`;

export default function SettingsShell({ children }: Props) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const { logout } = useAuth();
  const s = uiText[language].settings;

  const navLinks: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/settings/profile", label: s.profile, icon: profileIcon },
    { href: "/settings/language", label: s.language, icon: languageIcon },
    { href: "/settings/appearance", label: s.appearance, icon: appearanceIcon },
    { href: "/settings/notifications", label: s.notifications, icon: notificationsIcon },
    { href: "/settings/privacy", label: s.privacy, icon: privacyIcon }
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-6">
          {/* Settings hero */}
          <div className="rounded-3xl px-6 py-6 shadow-md"
            style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a78bfa 100%)" }}>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">⚙️ Préférences</p>
            <h1 className="text-2xl font-bold text-white">{s.title}</h1>
            <p className="mt-1 text-indigo-200 text-sm">{s.subtitle}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            <aside className="md:sticky md:top-6">
              <div className="flex min-h-[calc(100vh-280px)] flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{s.navLabel}</p>
                <nav className="flex flex-1 flex-col gap-1">
                  {navLinks.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link key={item.href} href={item.href}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                          isActive
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                        }`}>
                        <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${
                          isActive ? "bg-white/20" : "bg-slate-100"
                        }`}>{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse" />}
                      </Link>
                    );
                  })}
                  <button type="button" onClick={() => logout()}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors mt-1">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-base">{logoutIcon}</span>
                    <span className="flex-1 text-left">{s.logout}</span>
                  </button>
                </nav>
                <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-[10px] leading-relaxed text-slate-400">{s.navFooter}</div>
              </div>
            </aside>

            <div className="space-y-6">{children}</div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
