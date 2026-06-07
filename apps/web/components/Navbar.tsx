"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { uiText } from "../lib/i18n";
import { resolveMediaUrl } from "../lib/mediaUrl";

const NAV_ICONS: Record<string, string> = {
  dashboard: "🏠",
  sleep: "😴",
  handwriting: "✍️",
  companion: "💬",
  bookVisit: "📅",
  settings: "⚙️",
  patients: "👥",
  notifications: "🔔",
  calendar: "📆",
};

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const { language } = useLanguage();
  const nav = uiText[language].nav;
  const pathname = usePathname();
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [codePopupOpen, setCodePopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setAvatarBroken(false); }, [user?.avatarUrl]);

  // Close popup when clicking outside
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
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname);

  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : null;

  const avatarSrc = user?.avatarUrl && !avatarBroken ? resolveMediaUrl(user.avatarUrl) : "";
  const homeHref = user ? (user.role === "DOCTOR" ? "/doctor" : "/dashboard") : "/login";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const linkBase = "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all";
  const linkClass = (href: string) =>
    isActive(href)
      ? `${linkBase} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200`
      : `${linkBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white`;

  const patientLinks: { href: string; key: string; role?: string }[] = [
    { href: "/dashboard",        key: "dashboard" },
    { href: "/sleep-activities", key: "sleep" },
    { href: "/handwriting",      key: "handwriting" },
    { href: "/companion",        key: "companion",  role: "PATIENT" },
    { href: "/book",             key: "bookVisit",  role: "PATIENT" },
    { href: "/settings",         key: "settings" },
  ];

  // Relatives see a minimal nav: only Dashboard and Settings
  const relativeLinks: { href: string; key: string }[] = [
    { href: "/dashboard", key: "dashboard" },
    { href: "/settings",  key: "settings" },
  ];

  const doctorLinks = [
    { href: "/doctor",                key: "patients" },
    { href: "/doctor/notifications",  key: "notifications" },
    { href: "/doctor/calendar",       key: "calendar" },
  ] as const;

  return (
    <nav className={`sticky top-0 z-40 w-full border-b transition-all duration-200 ${
      scrolled
        ? "border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
        : "border-transparent bg-white/80 backdrop-blur-sm dark:bg-slate-900/80"
    }`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">

        {/* Brand */}
        <Link href={homeHref} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="BridgingBipolar" className="h-8 w-8 drop-shadow-sm" />
          <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">BridgingBipolar</span>
          <span className="hidden rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 sm:inline">
            {nav.monitoring}
          </span>
        </Link>

        {loading ? (
          <span className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
        ) : !user ? (
          !onAuthPage && (
            <div className="flex items-center gap-2">
              <Link href="/login"
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-300 dark:hover:bg-slate-800">
                {nav.login}
              </Link>
              <Link href="/signup"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                {nav.signup}
              </Link>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {user.role === "DOCTOR"
              ? doctorLinks.map(({ href, key }) => (
                  <Link key={href} href={href} className={linkClass(href)}>
                    <span className="emoji">{NAV_ICONS[key]}</span>
                    <span>{nav[key]}</span>
                  </Link>
                ))
              : user.role === "RELATIVE"
              ? relativeLinks.map(({ href, key }) => (
                  <Link key={href} href={href} className={linkClass(href)}>
                    <span className="emoji">{NAV_ICONS[key]}</span>
                    <span className="hidden sm:inline">{(nav as Record<string, string>)[key]}</span>
                  </Link>
                ))
              : patientLinks
                  .filter((l) => !l.role || l.role === user.role)
                  .map(({ href, key }) => (
                    <Link key={href} href={href} className={linkClass(href)}>
                      <span className="emoji">{NAV_ICONS[key]}</span>
                      <span className="hidden sm:inline">{(nav as Record<string, string>)[key]}</span>
                    </Link>
                  ))
            }

            {/* Doctor name + code popup */}
            {user.role === "DOCTOR" && (
              <div ref={popupRef} className="relative ml-1">
                <button
                  type="button"
                  onClick={() => setCodePopupOpen(v => !v)}
                  className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 transition-colors dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/50"
                >
                  <span className="emoji">👨‍⚕️</span>
                  <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
                  <span className="text-sky-400 text-[10px]">▲</span>
                </button>

                {codePopupOpen && (
                  <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 w-72 rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl dark:border-sky-800 dark:bg-slate-800">
                    {/* Triangle pointer */}
                    <div className="absolute bottom-[-8px] right-5 h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-sky-200" />
                    <div className="absolute bottom-[-7px] right-5 h-0 w-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />

                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-1">
                      {language === "fr" ? "Votre code médecin" : language === "ar" ? "رمز الطبيب" : "Your doctor code"}
                    </p>
                    <p className="font-bold text-slate-800 text-sm mb-3 truncate">{user.name}</p>
                    <div className="flex items-center gap-3 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
                      <span className="font-mono text-xl font-black text-sky-700 tracking-widest flex-1">
                        {`BB-${(user.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const code = `BB-${(user.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
                          navigator.clipboard?.writeText(code);
                        }}
                        className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-sky-700 transition-colors"
                      >
                        {language === "fr" ? "Copier" : language === "ar" ? "نسخ" : "Copy"}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      {language === "fr"
                        ? "Partagez ce code avec vos patients lors de leur inscription."
                        : language === "ar"
                        ? "شارك هذا الرمز مع مرضاك عند تسجيلهم."
                        : "Share this code with your patients when they sign up."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Logout */}
            <button
              onClick={() => logout()}
              className="ml-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100">
              {nav.logout}
            </button>

            {/* Avatar */}
            {(avatarSrc || initials) && (
              <div className="ml-1 flex-shrink-0" title={user.name}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" onError={() => setAvatarBroken(true)}
                    className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm"
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                    {initials}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
