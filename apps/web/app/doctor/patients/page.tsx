"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../hooks/useAuth";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

type PatientRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  age: number | null;
  status: "stable" | "manic" | "critical";
  questionnairePending?: boolean;
};

export default function DoctorPatientsPage() {
  const { logout } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const [items, setItems] = useState<PatientRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: PatientRow[] }>("/doctor/patients")
      .then((d) => setItems(d.items))
      .catch((e) => {
        const msg = (e as Error).message || "";
        setErr(msg.includes("Forbidden") ? t.sessionForbidden : msg);
      });
  }, [t.sessionForbidden]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
  }, [items, q]);

  const askQuestion = useCallback(
    async (patientId: string) => {
      setAskingId(patientId);
      setToast(null);
      try {
        await apiFetch<{ ok: boolean }>(`/doctor/patients/${patientId}/request-questionnaire`, {
          method: "POST"
        });
        setItems((prev) =>
          prev.map((p) => (p.id === patientId ? { ...p, questionnairePending: true } : p))
        );
        setToast(t.askQuestionSuccess);
      } catch (e) {
        setToast((e as Error).message || t.askQuestionError);
      } finally {
        setAskingId(null);
      }
    },
    [t.askQuestionError, t.askQuestionSuccess]
  );

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div
        className="rounded-3xl px-6 py-6 shadow-md"
        style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a78bfa 100%)" }}
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-200">👥 Portail Médecin</p>
        <h1 className="text-2xl font-bold text-white">{t.patientsTitle}</h1>
        <p className="mt-1 text-sm text-indigo-200">{t.patientsSubtitle}</p>
      </div>

      {toast && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
          {toast}
        </div>
      )}

      {/* Search */}
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:ring-indigo-900">
          <span className="text-slate-400">🔍</span>
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
          <p>⚠️ {err}</p>
          {err === t.sessionForbidden && (
            <button
              type="button"
              onClick={() => logout()}
              className="mt-2 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              {uiText[language].nav.logout}
            </button>
          )}
        </div>
      )}

      {/* Patient list */}
      <div className="space-y-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 sm:flex-nowrap"
          >
            <Link
              href={`/doctor/patients/${p.id}`}
              className="flex min-w-0 flex-1 items-center gap-4 transition-opacity hover:opacity-90"
            >
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{p.email}</div>
              </div>
            </Link>

            {p.age && <span className="hidden text-xs text-slate-400 sm:inline">{p.age} ans</span>}

            <span
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
                p.status === "stable"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : p.status === "manic"
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
              }`}
            >
              {p.status === "stable" ? "🟢" : p.status === "manic" ? "🟡" : "🔴"} {t.statusLabels[p.status]}
            </span>

            <button
              type="button"
              disabled={askingId === p.id || p.questionnairePending}
              onClick={() => void askQuestion(p.id)}
              className="flex-shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
            >
              {askingId === p.id ? "…" : p.questionnairePending ? t.askQuestionPending : t.askQuestion}
            </button>

            <Link
              href={`/doctor/patients/${p.id}`}
              className="flex-shrink-0 text-slate-300 hover:text-indigo-500 dark:text-slate-500"
              aria-label={`Open ${p.name}`}
            >
              →
            </Link>
          </div>
        ))}
        {!err && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
            <p className="mb-2 text-2xl">👤</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t.noPatientsMatch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
