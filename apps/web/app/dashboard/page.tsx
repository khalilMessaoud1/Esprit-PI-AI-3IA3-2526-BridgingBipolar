"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProtectedRoute from "../../components/ProtectedRoute";
import MoodInput from "../../components/MoodInput";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useMouseBehavior } from "../../hooks/useMouseTracker";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

type AssessmentItem = { createdAt: string; type: string; score: number };
type MedicationItem = { id: string; name: string; dosage: string; frequency: string; time: string };

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].dashboard;
  const readOnly = user?.role === "RELATIVE";
  const [latestMood, setLatestMood] = useState<number | null>(null);
  const [latestYmrs, setLatestYmrs] = useState<number | null>(null);
  const [latestHdrs, setLatestHdrs] = useState<number | null>(null);
  const [medications, setMedications] = useState<MedicationItem[]>([]);
  const [linkedPatientName, setLinkedPatientName] = useState<string | null>(null);
  const mouseBehavior = useMouseBehavior();
  const [crisisTimestamp, setCrisisTimestamp] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role === "DOCTOR") router.replace("/doctor");
  }, [user?.role, router]);

  // Check for crisis flag set by Companion chat
  useEffect(() => {
    if (!user?.id) return;
    const raw = localStorage.getItem(`bb_crisis_${user.id}`);
    if (raw) {
      const ts = Number(raw);
      // Show popup only if the crisis was flagged in the last 24 hours
      if (!isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
        setCrisisTimestamp(ts);
      } else {
        localStorage.removeItem(`bb_crisis_${user.id}`);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (readOnly) {
      // RELATIVE: load linked patient state instead of own data
      apiFetch<{ patient: { id: string; name: string; latestMood: number | null; latestYmrs: number | null; latestHdrs: number | null; mouseState: string | null } | null }>("/user/linked-patient-state")
        .then(({ patient }) => {
          if (!patient) return;
          setLinkedPatientName(patient.name);
          setLatestMood(patient.latestMood);
          setLatestYmrs(patient.latestYmrs);
          setLatestHdrs(patient.latestHdrs);
        })
        .catch(() => {});
      return;
    }

    apiFetch<{ items: { createdAt: string; moodLevel: number }[] }>("/mood")
      .then((data) => {
        setLatestMood(data.items[0]?.moodLevel ?? null);
      })
      .catch(() => setLatestMood(null));

    apiFetch<{ items: AssessmentItem[] }>("/assessment")
      .then((data) => {
        const latest = data.items.reduce<Record<string, AssessmentItem | undefined>>((acc, item) => {
          if (!acc[item.type]) acc[item.type] = item;
          return acc;
        }, {});
        setLatestYmrs(latest.YMRS?.score ?? null);
        setLatestHdrs(latest.HDRS?.score ?? null);
      })
      .catch(() => {});

    apiFetch<{ items: MedicationItem[] }>("/medication")
      .then((data) => setMedications(data.items || []))
      .catch(() => setMedications([]));
  }, [readOnly]);

  const nextMedication = useMemo(() => {
    if (medications.length === 0) return null;
    const timeToMinutes = (time: string) => {
      const match = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return Number.MAX_SAFE_INTEGER;
      return Number(match[1]) * 60 + Number(match[2]);
    };
    return [...medications].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0];
  }, [medications]);

  const moodState = useMemo(() => {
    if (latestMood === null) {
      return { label: t.moodState.noCheckIn, color: "text-slate-500", dot: "bg-slate-300", bgBar: "#94a3b8", bar: 50 };
    }
    if (latestMood > 1) {
      return { label: t.moodState.elevated, color: "text-amber-700", dot: "bg-amber-500", bgBar: "#f59e0b", bar: 75 + latestMood * 12 };
    }
    if (latestMood < -1) {
      return { label: t.moodState.low, color: "text-slate-700", dot: "bg-indigo-500", bgBar: "#6366f1", bar: 25 - Math.abs(latestMood) * 10 };
    }
    return { label: t.moodState.balanced, color: "text-teal-700", dot: "bg-teal-500", bgBar: "#14b8a6", bar: 50 };
  }, [latestMood, t.moodState]);

  const calmAlerts = useMemo(() => {
    const items: { emoji: string; title: string; body: string; color: string; bg: string; border: string }[] = [];
    if (readOnly) items.push({ emoji: "👁️", title: t.alerts.relativeTitle, body: t.alerts.relativeBody, color: "text-violet-800", bg: "bg-violet-50", border: "border-violet-200" });
    if (latestMood === 2 || latestMood === -2) items.push({ emoji: "⚠️", title: t.alerts.moodShiftTitle, body: t.alerts.moodShiftBody, color: "text-amber-800", bg: "bg-amber-50", border: "border-amber-200" });
    if (mouseBehavior.state === "manic" && latestMood !== null && latestMood >= 1) items.push({ emoji: "🚨", title: t.alerts.highActivationTitle, body: t.alerts.highActivationBody, color: "text-orange-800", bg: "bg-orange-50", border: "border-orange-200" });
    if (mouseBehavior.state === "depressed" && latestMood !== null && latestMood <= -1) items.push({ emoji: "💙", title: t.alerts.lowActivationTitle, body: t.alerts.lowActivationBody, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" });
    if (mouseBehavior.state === "manic" && latestMood !== null && latestMood < 1) items.push({ emoji: "🌀", title: t.alerts.mixedSignalsTitle, body: t.alerts.mixedSignalsBody, color: "text-violet-800", bg: "bg-violet-50", border: "border-violet-200" });
    if (!mouseBehavior.connected) items.push({ emoji: "📡", title: t.alerts.mouseOfflineTitle, body: t.alerts.mouseOfflineBody, color: "text-slate-600", bg: "bg-white", border: "border-slate-200" });
    if (items.length === 0) items.push({ emoji: "✨", title: t.alerts.allCalmTitle, body: t.alerts.allCalmBody, color: "text-teal-800", bg: "bg-teal-50", border: "border-teal-200" });
    return items;
  }, [readOnly, latestMood, mouseBehavior.state, mouseBehavior.connected, t.alerts]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return t.greetings.night;
    if (h < 12) return t.greetings.morning;
    if (h < 18) return t.greetings.afternoon;
    return t.greetings.evening;
  })();
  const fallbackName = language === "fr" ? "vous" : language === "ar" ? "there" : "there";

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-8 pb-12">

          {/* ── Crisis popup ─────────────────────────────────────────────── */}
          {crisisTimestamp !== null && (
            <div className="relative rounded-3xl border-2 border-red-400 bg-red-50 px-5 py-5 shadow-lg animate-pulse">
              <div className="flex items-start gap-4">
                <span className="text-4xl shrink-0">🚨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-red-900">
                    {language === "fr" ? "Alerte de sécurité détectée" : language === "ar" ? "تم اكتشاف تنبيه أمني" : "Safety alert detected"}
                  </p>
                  <p className="mt-1 text-sm text-red-800 leading-relaxed">
                    {language === "fr"
                      ? "Notre assistant a détecté un signal de détresse dans votre conversation. Votre contact d'urgence a été informé. Vous n'êtes pas seul(e) — prenez rendez-vous avec votre médecin dès maintenant."
                      : language === "ar"
                      ? "اكتشف مساعدنا إشارة ضيق في محادثتك. تم إخطار جهة الاتصال الطارئ الخاصة بك. أنت لست وحدك — احجز موعدًا مع طبيبك الآن."
                      : "Our assistant detected a distress signal in your conversation. Your emergency contact has been notified. You are not alone — please book an appointment with your doctor now."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/book"
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 shadow transition-all">
                      📅 {language === "fr" ? "Prendre rendez-vous maintenant" : language === "ar" ? "احجز موعدًا الآن" : "Book appointment now"}
                    </Link>
                    <button
                      onClick={() => {
                        if (user?.id) localStorage.removeItem(`bb_crisis_${user.id}`);
                        setCrisisTimestamp(null);
                      }}
                      className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors">
                      {language === "fr" ? "J'ai reçu de l'aide" : language === "ar" ? "تلقيت المساعدة" : "I have received help"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── RELATIVE: state-only view ────────────────────────────────── */}
          {readOnly && (() => {
            const isFr = language === "fr"; const isAr = language === "ar";

            // Weighted fusion (same weights as doctor view)
            type SigW = { value: "manic" | "depressive" | "normal"; weight: number };
            const weightedSigs: SigW[] = [];
            if (latestYmrs !== null) weightedSigs.push({ weight: 3, value: latestYmrs > 12 ? "manic" : "normal" });
            if (latestHdrs !== null) weightedSigs.push({ weight: 3, value: latestHdrs > 8 ? "depressive" : "normal" });
            if (mouseBehavior.state === "manic" || mouseBehavior.state === "depressed" || mouseBehavior.state === "normal")
              weightedSigs.push({ weight: 2, value: mouseBehavior.state === "manic" ? "manic" : mouseBehavior.state === "depressed" ? "depressive" : "normal" });
            if (latestMood !== null) weightedSigs.push({ weight: 1, value: latestMood >= 1 ? "manic" : latestMood <= -1 ? "depressive" : "normal" });

            const manicScore = weightedSigs.filter(s => s.value === "manic").reduce((a, s) => a + s.weight, 0);
            const depScore   = weightedSigs.filter(s => s.value === "depressive").reduce((a, s) => a + s.weight, 0);
            const normScore  = weightedSigs.filter(s => s.value === "normal").reduce((a, s) => a + s.weight, 0);

            type Level = "critical" | "attention" | "stable" | "unknown";
            let level: Level = weightedSigs.length === 0 ? "unknown" : "stable";
            if (crisisTimestamp !== null || (latestYmrs !== null && latestYmrs > 20) || (latestHdrs !== null && latestHdrs > 17)) {
              level = "critical";
            } else if (weightedSigs.length > 0) {
              const top = manicScore > depScore && manicScore > normScore ? "manic"
                : depScore > manicScore && depScore > normScore ? "depressive" : "normal";
              if (top !== "normal") level = "attention";
              if ((manicScore >= 6 || depScore >= 6) && Math.max(manicScore, depScore) > normScore * 2) level = "critical";
            }

            // Intensity: how strongly the dominant signal is pushing vs total
            const totalW = manicScore + depScore + normScore;
            const dominantScore = Math.max(manicScore, depScore, normScore);
            const intensity = totalW > 0 ? Math.round((dominantScore / totalW) * 100) : 0;

            const STATUS = {
              stable:    { dot: "bg-teal-500",  badge: "bg-teal-50 border-teal-300 text-teal-800",  bar: "#14b8a6", label: isFr ? "Stable" : isAr ? "مستقر" : "Stable",   sub: isFr ? "Votre proche va bien." : isAr ? "قريبك بخير." : "Your relative is doing well." },
              attention: { dot: "bg-amber-500", badge: "bg-amber-50 border-amber-300 text-amber-800", bar: "#f59e0b", label: isFr ? "Attention" : isAr ? "تنبيه" : "Attention", sub: isFr ? "Restez en contact." : isAr ? "ابق على تواصل." : "Stay in contact." },
              critical:  { dot: "bg-red-500 animate-ping", badge: "bg-red-50 border-red-400 text-red-800", bar: "#ef4444", label: isFr ? "Critique" : isAr ? "حرج" : "Critical", sub: isFr ? "Contactez le médecin immédiatement." : isAr ? "اتصل بالطبيب فوراً." : "Contact the doctor immediately." },
              unknown:   { dot: "bg-slate-300",  badge: "bg-slate-50 border-slate-200 text-slate-600", bar: "#94a3b8", label: isFr ? "Inconnu" : isAr ? "غير معروف" : "Unknown",  sub: isFr ? "Données insuffisantes." : isAr ? "بيانات غير كافية." : "Insufficient data." }
            }[level];

            return (
              <div className="space-y-5 pb-12">

                {/* ── Critical alert banner ─────────────────────────────────── */}
                {level === "critical" && (
                  <div className="rounded-2xl border-2 border-red-500 bg-red-50 px-5 py-4 shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600" />
                      </span>
                      <p className="font-bold text-red-900 text-base">
                        🚨 {isFr ? "ALERTE — Situation critique détectée" : isAr ? "تنبيه — حالة حرجة" : "ALERT — Critical situation detected"}
                      </p>
                    </div>
                    <p className="text-sm text-red-800 mb-3 ml-7">
                      {linkedPatientName
                        ? (isFr ? `${linkedPatientName} nécessite une attention immédiate.` : `${linkedPatientName} needs immediate attention.`)
                        : (isFr ? "Votre proche nécessite une attention immédiate." : "Your relative needs immediate attention.")}
                    </p>
                    <a href="tel:15"
                      className="ml-7 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors shadow">
                      📞 {isFr ? "Appeler les urgences (15)" : isAr ? "اتصل بالطوارئ" : "Call emergency (15)"}
                    </a>
                  </div>
                )}

                {/* ── Patient header card ───────────────────────────────────── */}
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white text-xl font-black shadow-sm"
                      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      {linkedPatientName ? linkedPatientName.slice(0, 1).toUpperCase() : "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                        {isFr ? "Vous suivez" : isAr ? "تتابع" : "Following"}
                      </p>
                      <p className="text-lg font-bold text-slate-900 truncate">
                        {linkedPatientName ?? (isFr ? "Aucun patient lié" : "No linked patient")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Status card ───────────────────────────────────────────── */}
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm space-y-5">

                  {/* Status row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3 w-3">
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS.dot}`} />
                        <span className={`relative inline-flex h-3 w-3 rounded-full ${STATUS.dot.replace(" animate-ping", "")}`} />
                      </span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {isFr ? "État clinique" : isAr ? "الحالة السريرية" : "Clinical state"}
                        </p>
                        <p className="text-2xl font-extrabold text-slate-900 leading-tight">{STATUS.label}</p>
                      </div>
                    </div>
                    <span className={`rounded-xl border px-4 py-2 text-sm font-bold ${STATUS.badge}`}>
                      {STATUS.label}
                    </span>
                  </div>

                  {/* Intensity bar */}
                  {totalW > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] font-semibold text-slate-400 mb-1.5">
                        <span>{isFr ? "Intensité du signal" : isAr ? "قوة الإشارة" : "Signal intensity"}</span>
                        <span>{intensity}%</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${intensity}%`, backgroundColor: STATUS.bar }} />
                      </div>
                    </div>
                  )}

                  {/* Message */}
                  <p className="text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
                    {STATUS.sub}
                  </p>
                </div>

                {/* ── No patient warning ────────────────────────────────────── */}
                {!linkedPatientName && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                    ⚠️ {isFr ? "Aucun patient lié à ce compte. Créez votre compte en renseignant le code de votre proche." : "No patient linked. Re-create your account with a valid patient code."}
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Hero header (patient & anonymous only) ────────────────────── */}
          {!readOnly && <>
          {/* ── Hero header ──────────────────────────────────────────────── */}
          <div className="relative overflow-hidden rounded-3xl px-6 py-8 shadow-md"
            style={{ background: "linear-gradient(135deg,#dbeafe 0%,#e0f2fe 50%,#f0f9ff 100%)" }}>
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px),radial-gradient(circle at 80% 20%,#fff 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sky-700 text-sm font-medium mb-1">🧠 {t.heroTagline}</p>
                <h1 className="text-3xl font-bold text-slate-900">
                  {greeting}, {user?.name?.split(" ")[0] || fallbackName} 👋
                </h1>
                <p className="mt-2 text-sky-700 text-sm max-w-lg">
                  {t.heroSubtitle}
                </p>
              </div>
            </div>
          </div>

          {readOnly && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm text-violet-900 flex items-center gap-3">
              <span className="text-xl">👁️</span>
              <span><strong>{t.readOnlyBannerTitle} :</strong> {t.readOnlyBannerBody}</span>
            </div>
          )}

          {/* ── Accès rapides ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🗺️</span>
              <h2 className="text-base font-bold text-slate-900">{t.quickAccessTitle}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { href: "/assessment",       emoji: "📋", label: t.quickAccessItems.assessmentLabel, sub: t.quickAccessItems.assessmentSub, color: "hover:border-indigo-300 hover:bg-indigo-50/40" },
                { href: "/handwriting",     emoji: "✍️", label: t.quickAccessItems.handwritingLabel, sub: t.quickAccessItems.handwritingSub, color: "hover:border-violet-300 hover:bg-violet-50/40" },
                { href: "/medications/new", emoji: "💊", label: t.quickAccessItems.medsLabel, sub: t.quickAccessItems.medsSub, color: "hover:border-teal-300  hover:bg-teal-50/40" },
                { href: "/sleep-activities",emoji: "😴", label: t.quickAccessItems.sleepLabel, sub: t.quickAccessItems.sleepSub, color: "hover:border-blue-300  hover:bg-blue-50/40" },
              ].map((item) => (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-all shadow-sm hover:shadow-md ${item.color}`}>
                  <span className="text-3xl">{item.emoji}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-800">{item.label}</div>
                    <div className="text-[11px] text-slate-400">{item.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Quick metrics row ────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Mood */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.metrics.mood}</span>
                <span className={`h-3 w-3 rounded-full ${moodState.dot}`} aria-hidden />
              </div>
              <div className={`text-lg font-bold ${moodState.color}`}>{moodState.label}</div>
              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(5, moodState.bar))}%`, background: moodState.bgBar }} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">{t.metrics.lastSelfReport}</p>
            </div>

            {/* YMRS */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.metrics.ymrs}</span>
                <span className="text-2xl">📊</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">{latestYmrs ?? "—"}</div>
              {latestYmrs !== null && (
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (latestYmrs / 60) * 100)}%`, background: latestYmrs > 12 ? "#f59e0b" : "#14b8a6" }} />
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">{t.metrics.clinicalThreshold}: 12</p>
            </div>

            {/* HDRS */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.metrics.hdrs}</span>
                <span className="text-2xl">📉</span>
              </div>
              <div className="text-3xl font-bold text-slate-800">{latestHdrs ?? "—"}</div>
              {latestHdrs !== null && (
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (latestHdrs / 52) * 100)}%`, background: latestHdrs > 8 ? "#6366f1" : "#14b8a6" }} />
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-400">{t.metrics.clinicalThreshold}: 8</p>
            </div>
          </div>

          {/* ── Gentle alerts ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🔔</span>
              <h2 className="text-base font-bold text-slate-900">{t.alertsTitle}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {calmAlerts.map((a) => (
                <div key={a.title} className={`rounded-2xl border px-5 py-4 shadow-sm ${a.bg} ${a.border}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">{a.emoji}</span>
                    <p className={`text-sm font-bold ${a.color}`}>{a.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{a.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Mood check-in ───────────────────────────────────────────── */}
          <div id="mood-check" className="scroll-mt-24">
            <div className="rounded-3xl border border-slate-200 bg-white p-1 shadow-sm">
              <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                <span className="text-2xl">😊</span>
                <h2 className="text-base font-bold text-slate-900">{t.moodCheckinTitle}</h2>
              </div>
              <div className="px-5 pb-3 text-xs text-slate-500">{t.moodCheckinHint}</div>
              <MoodInput onSaved={(level) => setLatestMood(level)} />
            </div>
          </div>

          {/* ── Medication preview ───────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">💊</span>
                <h2 className="text-base font-bold text-slate-900">{t.medicationTitle}</h2>
              </div>
              <div className="rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-center gap-3">
                <span className="text-xl">⏰</span>
                <div>
                  <div className="text-sm font-bold text-indigo-800">
                    {nextMedication
                      ? `${nextMedication.time} — ${nextMedication.name} ${nextMedication.dosage}`
                      : t.medicationEmpty}
                  </div>
                  <div className="text-xs text-indigo-600">
                    {nextMedication ? t.medicationConfigured : t.medicationEmptySub}
                  </div>
                </div>
              </div>
              <Link href="/medications/new?manage=1" className="mt-3 block text-center text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                {t.medicationManage}
              </Link>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">📷</span>
                <h2 className="text-base font-bold text-slate-900">{t.scanTitle}</h2>
              </div>
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm text-slate-500 mb-3">{t.scanBody}</p>
                <Link href="/medications/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:from-indigo-600 hover:to-purple-700 shadow transition-all">
                  📸 {t.scanAction}
                </Link>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 leading-relaxed">
            🤖 {t.disclaimer}
          </p>
          </>}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
