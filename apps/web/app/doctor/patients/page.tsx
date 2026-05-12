"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

type PatientRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  age: number | null;
  status: "stable" | "manic" | "critical";
};

const STATUS_STYLE: Record<PatientRow["status"], string> = {
  stable: "bg-emerald-100 text-emerald-800",
  manic: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800"
};

export default function DoctorPatientsPage() {
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const [items, setItems] = useState<PatientRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: PatientRow[] }>("/doctor/patients")
      .then((d) => setItems(d.items))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-3xl px-6 py-6 shadow-md"
        style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a78bfa 100%)" }}>
        <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">👥 Portail Médecin</p>
        <h1 className="text-2xl font-bold text-white">{t.patientsTitle}</h1>
        <p className="mt-1 text-indigo-200 text-sm">{t.patientsSubtitle}</p>
      </div>

      {/* Search */}
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <span className="text-slate-400">🔍</span>
          <input
            type="search"
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">⚠️ {err}</div>
      )}

      {/* Patient list */}
      <div className="space-y-2">
        {filtered.map((p) => (
          <Link key={p.id} href={`/doctor/patients/${p.id}`}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              {p.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900">{p.name}</div>
              <div className="truncate text-xs text-slate-500">{p.email}</div>
            </div>
            {p.age && <span className="hidden text-xs text-slate-400 sm:inline">{p.age} ans</span>}
            <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold border ${
              p.status === "stable" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              p.status === "manic"  ? "bg-amber-50  text-amber-700  border-amber-200"   :
                                      "bg-red-50    text-red-700    border-red-200"
            }`}>
              {p.status === "stable" ? "🟢" : p.status === "manic" ? "🟡" : "🔴"} {t.statusLabels[p.status]}
            </span>
            <span className="text-slate-300">→</span>
          </Link>
        ))}
        {!err && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
            <p className="text-2xl mb-2">👤</p>
            <p className="text-sm text-slate-500">{t.noPatientsMatch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
