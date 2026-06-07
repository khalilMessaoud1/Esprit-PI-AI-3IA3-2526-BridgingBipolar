"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

type PatientSummary = { id: string; name: string; email: string; status: "stable" | "manic" | "critical" };
type ApptRequest = { id: string; startAt: string; patient: { name: string } };

const HANDLED_KEY = "bb_handled_patients";

function loadHandled(): Set<string> {
  try {
    const raw = localStorage.getItem(HANDLED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
function saveHandled(set: Set<string>) {
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export default function DoctorNotificationsPage() {
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar" : "en-US";
  const isFr = language === "fr";
  const isAr = language === "ar";

  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [pendingAppts, setPendingAppts] = useState<ApptRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [showHandled, setShowHandled] = useState(false);

  useEffect(() => {
    setHandled(loadHandled());
    Promise.all([
      apiFetch<{ items: PatientSummary[] }>("/doctor/patients")
        .then((d) => d.items ?? [])
        .catch(() => []),
      apiFetch<ApptRequest[]>("/doctor/appointments")
        .then((all) => (all as (ApptRequest & { status: string })[]).filter((a) => a.status === "pending"))
        .catch(() => [])
    ]).then(([pts, appts]) => {
      setPatients(pts);
      setPendingAppts(appts);
    }).finally(() => setLoading(false));
  }, []);

  const markHandled = (id: string) => {
    const next = new Set(handled);
    next.add(id);
    setHandled(next);
    saveHandled(next);
  };

  const unmarkHandled = (id: string) => {
    const next = new Set(handled);
    next.delete(id);
    setHandled(next);
    saveHandled(next);
  };

  const crisisPatients = patients.filter((p) => p.status === "critical" && !handled.has(p.id));
  const manicPatients = patients.filter((p) => p.status === "manic" && !handled.has(p.id));
  const handledPatients = patients.filter((p) => handled.has(p.id));

  return (
    <div className="max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 px-5 py-5 shadow-sm dark:from-indigo-700 dark:to-violet-800"
      >
        <h1 className="text-xl font-bold text-white">🔔 {t.notificationsTitle}</h1>
        <p className="mt-1 text-xs text-indigo-200">
          {isFr ? "Alertes et demandes en temps réel" : isAr ? "التنبيهات والطلبات الفورية" : "Real-time alerts and requests"}
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">{t.loading}</p>}

      {/* ── Crisis alerts ─────────────────────────────────────────── */}
      {crisisPatients.length > 0 && (
        <div className="space-y-3 rounded-2xl border-2 border-red-400 bg-red-50 p-5 dark:border-red-700 dark:bg-red-950/40">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-2xl">🚨</span>
            <h2 className="text-base font-bold text-red-900 dark:text-red-200">
              {isFr ? "Alerte critique — intervention immédiate" : isAr ? "تنبيه حرج — تدخل فوري" : "Critical alert — immediate attention"}
            </h2>
          </div>
          <p className="text-sm text-red-800 dark:text-red-300">
            {isFr ? "Ces patients présentent des signaux extrêmes. Contactez-les immédiatement." : "These patients show extreme signals. Contact them immediately."}
          </p>
          <div className="space-y-2">
            {crisisPatients.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 dark:border-red-800 dark:bg-slate-800/80"
              >
                <div>
                  <div className="font-bold text-red-900 dark:text-red-200">{p.name}</div>
                  <div className="text-xs text-red-600 dark:text-red-400">{p.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/doctor/patients/${p.id}`}
                    className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
                  >
                    {isFr ? "Voir le dossier" : "View patient"}
                  </Link>
                  <button
                    onClick={() => markHandled(p.id)}
                    className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/50"
                    title={isFr ? "Marquer comme pris en charge" : "Mark as handled"}
                  >
                    ✓ {isFr ? "Pris en charge" : isAr ? "تمت المعالجة" : "Handled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manic alerts ──────────────────────────────────────────── */}
      {manicPatients.length > 0 && (
        <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/40">
          <div className="flex items-center gap-2">
            <span className="emoji text-2xl">⚠️</span>
            <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">
              {isFr ? "Signaux d'activation élevée" : isAr ? "إشارات نشاط مرتفع" : "Elevated activation signals"}
            </h2>
          </div>
          <div className="space-y-2">
            {manicPatients.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 dark:border-amber-800 dark:bg-slate-800/80"
              >
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-200">{p.name}</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400">{p.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/doctor/patients/${p.id}`}
                    className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600"
                  >
                    {isFr ? "Voir" : "View"}
                  </Link>
                  <button
                    onClick={() => markHandled(p.id)}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/50"
                  >
                    ✓ {isFr ? "Pris en charge" : isAr ? "تمت المعالجة" : "Handled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending appointments ───────────────────────────────────── */}
      {pendingAppts.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-indigo-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="text-base font-bold text-indigo-900 dark:text-indigo-200">
              {isFr ? "Demandes de rendez-vous" : isAr ? "طلبات المواعيد" : "Appointment requests"}
            </h2>
          </div>
          <div className="space-y-2">
            {pendingAppts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 dark:border-indigo-800 dark:bg-slate-800/80"
              >
                <div>
                  <div className="font-semibold text-indigo-900 dark:text-indigo-200">{a.patient.name}</div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400">
                    {new Date(a.startAt).toLocaleString(locale, {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>
                <Link
                  href="/doctor/calendar"
                  className="shrink-0 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
                >
                  {isFr ? "Gérer" : "Manage"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All stable ────────────────────────────────────────────── */}
      {!loading && crisisPatients.length === 0 && manicPatients.length === 0 && pendingAppts.length === 0 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center dark:border-teal-800 dark:bg-teal-950/40">
          <div className="mb-2 text-3xl">✅</div>
          <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
            {isFr ? "Aucune alerte active pour l'instant." : isAr ? "لا توجد تنبيهات نشطة حالياً." : "No active alerts right now."}
          </p>
        </div>
      )}

      {/* ── Handled cases ─────────────────────────────────────────── */}
      {handledPatients.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
          <button
            onClick={() => setShowHandled((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            <span className="flex items-center gap-2">
              <span>✅</span>
              {isFr
                ? `Cas traités (${handledPatients.length})`
                : isAr
                  ? `الحالات المعالجة (${handledPatients.length})`
                  : `Handled cases (${handledPatients.length})`}
            </span>
            <span className="text-slate-400 dark:text-slate-500">{showHandled ? "▲" : "▼"}</span>
          </button>
          {showHandled && (
            <div className="mt-3 space-y-2">
              {handledPatients.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-600 dark:bg-slate-900/50"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{p.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/doctor/patients/${p.id}`}
                      className="rounded-xl border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {isFr ? "Dossier" : "View"}
                    </Link>
                    <button
                      onClick={() => unmarkHandled(p.id)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    >
                      {isFr ? "Rouvrir" : isAr ? "إعادة فتح" : "Reopen"}
                    </button>
                  </div>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                {isFr
                  ? "Ces cas sont masqués des alertes actives. Cliquez « Rouvrir » pour les faire réapparaître."
                  : "These cases are hidden from active alerts. Click Reopen to restore them."}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        {t.notificationsBody}
      </div>
    </div>
  );
}
