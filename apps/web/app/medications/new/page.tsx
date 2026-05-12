"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../components/AppShell";
import ProtectedRoute from "../../../components/ProtectedRoute";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { apiFetch, apiUploadFile } from "../../../lib/api";
import { useAuth } from "../../../hooks/useAuth";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

type ExtractedMed = {
  name?: string;
  dose?: string;
  frequency?: string;
  duration?: string | null;
  route?: string | null;
  instructions?: string | null;
};

type ParsePayload = {
  structured?: {
    patient?: string | null;
    prescriber?: string | null;
    date?: string | null;
    remarks?: string | null;
    medications?: ExtractedMed[];
  };
  structured_source?: string;
  raw_text?: string;
  corrected_text?: string;
  errors?: string[];
};

/** Professional medication draft — structured fields */
type DraftRow = {
  id: string;
  name: string;
  strength: string;       // e.g. "500 mg", "10 mg/ml"
  pillsPerDose: number;   // pills per single dose
  timesPerDay: number;    // how many times per day
  times: string[];        // notification times, one per dose (length = timesPerDay)
  endDate: string;        // YYYY-MM-DD, empty = ongoing
  saved: boolean;
  serverId?: string;
};

function defaultTimes(count: number): string[] {
  const base = ["08:00", "12:00", "18:00", "22:00", "14:00", "10:00"];
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
}

function resizeTimes(times: string[], count: number): string[] {
  if (times.length === count) return times;
  if (times.length > count) return times.slice(0, count);
  const extra = defaultTimes(count).slice(times.length);
  return [...times, ...extra];
}

function extractedToDraft(m: ExtractedMed, i: number): DraftRow {
  // Try to parse times-per-day from frequency ("2x", "trois fois", "3 times")
  const freqStr = (m.frequency ?? "").toLowerCase();
  const timesMatch = freqStr.match(/(\d+)/);
  const timesPerDay = timesMatch ? Math.min(Math.max(parseInt(timesMatch[1], 10), 1), 6) : 1;
  // Separate pills from strength
  const doseStr = m.dose ?? "";
  const pillMatch = doseStr.match(/^(\d+)\s*(cp|comp|comprimé|pill|tablet|tab|gélule|gel)/i);
  const pillsPerDose = pillMatch ? parseInt(pillMatch[1], 10) : 1;
  const strength = pillMatch ? doseStr.slice(pillMatch[0].length).trim() : doseStr;
  return {
    id: `row-${i}-${Date.now()}`,
    name: (m.name ?? "").trim(),
    strength: strength.trim(),
    pillsPerDose,
    timesPerDay,
    times: defaultTimes(timesPerDay),
    endDate: "",
    saved: false
  };
}

// ── Inner component (uses useSearchParams — needs Suspense boundary) ──────────
function MedicationFormInner() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const t = uiText[language].medicationPage;
  const readOnly = user?.role === "RELATIVE";
  const searchParams = useSearchParams();
  const manageMode = searchParams.get("manage") === "1";
  const isFr = language === "fr";
  const isAr = language === "ar";

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseMeta, setParseMeta] = useState<ParsePayload | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [manualMode, setManualMode] = useState(manageMode);
  const [loadingExisting, setLoadingExisting] = useState(manageMode);

  useEffect(() => {
    if (!manageMode) return;
    setLoadingExisting(true);
    apiFetch<{ items: { id: string; name: string; dosage: string; frequency: string; time: string }[] }>("/medication")
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setDrafts(data.items.map((m) => {
            const existingTimes = m.time ? m.time.split(",").map(s => s.trim()).filter(Boolean) : ["08:00"];
            const timesPerDay = existingTimes.length || 1;
            // Parse pills from dosage
            const doseMatch = m.dosage.match(/^(\d+)/);
            const pillsPerDose = doseMatch ? parseInt(doseMatch[1], 10) : 1;
            const strength = doseMatch ? m.dosage.slice(doseMatch[0].length).trim() : m.dosage;
            return {
              id: `existing-${m.id}`,
              serverId: m.id,
              name: m.name,
              strength,
              pillsPerDose,
              timesPerDay,
              times: existingTimes,
              endDate: "",
              saved: false
            };
          }));
        } else {
          setDrafts([{ id: "m0", name: "", strength: "", pillsPerDose: 1, timesPerDay: 1, times: ["08:00"], endDate: "", saved: false }]);
        }
      })
      .catch(() => setDrafts([{ id: "m0", name: "", strength: "", pillsPerDose: 1, timesPerDay: 1, times: ["08:00"], endDate: "", saved: false }]))
      .finally(() => setLoadingExisting(false));
  }, [manageMode]);

  const onPickFile = useCallback((f: File | null) => {
    setFile(f);
    setParseError(null);
    setParseMeta(null);
    setDrafts([]);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    if (f) setPreviewUrl(URL.createObjectURL(f));
  }, [previewUrl]);

  const runAnalysis = async () => {
    if (!file || readOnly) return;
    setParsing(true);
    setParseError(null);
    setParseMeta(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = (await apiUploadFile<ParsePayload>("/medication/parse", fd)) as ParsePayload;
      setParseMeta(data);
      const meds = data.structured?.medications ?? [];
      setDrafts(meds.length === 0
        ? [{ id: "m0", name: "", strength: "", pillsPerDose: 1, timesPerDay: 1, times: ["08:00"], endDate: "", saved: false }]
        : meds.map((m, i) => extractedToDraft(m, i)));
      setManualMode(false);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : t.nameRequired);
    } finally {
      setParsing(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((rows) => rows.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch };
      // If timesPerDay changed, resize times array
      if (patch.timesPerDay !== undefined) {
        updated.times = resizeTimes(updated.times, patch.timesPerDay);
      }
      return updated;
    }));
  };

  const updateTime = (id: string, idx: number, value: string) => {
    setDrafts((rows) => rows.map((r) => {
      if (r.id !== id) return r;
      const times = [...r.times];
      times[idx] = value;
      return { ...r, times };
    }));
  };

  const saveDraft = async (row: DraftRow) => {
    if (readOnly) return;
    if (!row.name.trim()) { setParseError(t.nameRequired); return; }
    setParseError(null);
    // Build professional dosage string: "1 comprimé × 3/jour — 500 mg"
    const pillWord = row.pillsPerDose === 1
      ? (language === "fr" ? "comprimé" : "pill")
      : (language === "fr" ? "comprimés" : "pills");
    const dosage = row.strength.trim()
      ? `${row.pillsPerDose} ${pillWord} × ${row.timesPerDay}/j — ${row.strength}`
      : `${row.pillsPerDose} ${pillWord} × ${row.timesPerDay}/j`;
    const frequency = language === "fr"
      ? `${row.timesPerDay} fois par jour`
      : `${row.timesPerDay} time(s) per day`;
    const payload = {
      name: row.name.trim(),
      dosage,
      frequency: row.endDate ? `${frequency}${language === "fr" ? " · jusqu'au" : " · until"} ${row.endDate}` : frequency,
      time: row.times.filter(Boolean).join(",") || "08:00"
    };
    if (row.serverId) {
      await apiFetch(`/medication/${row.serverId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }).catch(() => apiFetch("/medication", { method: "POST", body: JSON.stringify(payload) }));
    } else {
      await apiFetch("/medication", { method: "POST", body: JSON.stringify(payload) });
    }
    updateDraft(row.id, { saved: true });
  };

  const sourceLabel = useMemo(() => {
    const s = parseMeta?.structured_source;
    if (s === "ollama") return language === "fr"
      ? "Extraction structurée (Ollama) — à vérifier avec votre médecin."
      : "Structured extraction (Ollama) — verify with your doctor.";
    if (s === "heuristic") return language === "fr"
      ? "Mode secours (sans Ollama) : repères textuels seulement — à vérifier."
      : "Fallback mode (no Ollama): text cues only — please verify.";
    return null;
  }, [parseMeta?.structured_source, language]);

  const pageTitle = manageMode ? t.title : t.addTitle;

  const emptyDraft: DraftRow = { id: `m-${Date.now()}`, name: "", strength: "", pillsPerDose: 1, timesPerDay: 1, times: ["08:00"], endDate: "", saved: false };

  const saveAll = async () => {
    const unsaved = drafts.filter(r => !r.saved && r.name.trim());
    for (const row of unsaved) {
      await saveDraft(row);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back button */}
      <Link href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
        ← {isFr ? "Retour au tableau de bord" : isAr ? "العودة إلى لوحة التحكم" : "Back to dashboard"}
      </Link>

      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl px-6 py-7 shadow-md"
        style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a78bfa 100%)" }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">💊 {pageTitle}</p>
          <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
        </div>
      </div>

      <Card className="space-y-4">
        {readOnly && (
          <p className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">{t.relativeNotice}</p>
        )}

        {/* Scan section */}
        {!manageMode && !manualMode && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              {t.photoLabel}
            </label>
            {/* Custom file input to avoid browser native text */}
            <div className="flex items-center gap-3">
              <label className={`flex-1 flex items-center gap-3 cursor-pointer rounded-xl border-2 border-dashed px-4 py-3 transition ${file ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-indigo-200"} ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input type="file" accept="image/*" disabled={readOnly} className="sr-only"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
                <span className="text-xl">{file ? "📄" : "📎"}</span>
                <span className="text-sm text-slate-600 truncate">
                  {file ? file.name : (language === "fr" ? "Choisir une photo d'ordonnance" : language === "ar" ? "اختر صورة الوصفة الطبية" : "Choose a prescription photo")}
                </span>
              </label>
              {file && (
                <button type="button" onClick={() => onPickFile(null)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
                  ✕
                </button>
              )}
            </div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="max-h-44 rounded-2xl border border-slate-200 object-contain" />
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={runAnalysis} disabled={readOnly || !file || parsing}>
                {parsing ? t.analyzing : t.analyzeButton}
              </Button>
              <Button variant="secondary" type="button" onClick={() => setManualMode(true)} disabled={readOnly}>
                {t.manualButton}
              </Button>
              {(file || drafts.length > 0 || parseMeta) && (
                <Button type="button" variant="ghost" onClick={() => { onPickFile(null); setParseMeta(null); setDrafts([]); setManualMode(false); setParseError(null); }}>
                  {t.restart}
                </Button>
              )}
            </div>
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          </div>
        )}

        {/* Manage mode header */}
        {manageMode && (
          <p className="text-sm text-slate-500">{t.manageSubtitle}</p>
        )}
        {parseError && !(!manageMode && !manualMode) && <p className="text-sm text-red-600">{parseError}</p>}

        {loadingExisting && (
          <p className="py-4 text-center text-sm text-slate-500">{uiText[language].common.loading}</p>
        )}

        {/* Parse meta info */}
        {parseMeta && (
          <div className="rounded-xl bg-sky-50/80 border border-sky-100 px-4 py-3 text-xs text-slate-700">
            {sourceLabel}
            {parseMeta.errors && parseMeta.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-800">
                {parseMeta.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Draft rows */}
        {!loadingExisting && (manualMode || manageMode || drafts.length > 0) && (
          <div className="space-y-5 border-t border-slate-100 pt-4">
            {(manualMode || manageMode) && drafts.length === 0 && (
              <>
                <p className="text-sm text-slate-400">{t.noMedications}</p>
                <Button type="button" variant="secondary" onClick={() => setDrafts([{ ...emptyDraft, id: "m0" }])}>
                  {t.openForm}
                </Button>
              </>
            )}

            {drafts.map((row) => (
              <div key={row.id} className={`rounded-2xl border p-5 shadow-sm transition-colors ${row.saved ? "border-teal-200 bg-teal-50/40" : "border-slate-200 bg-white"}`}>
                {/* Status badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {row.saved ? (
                      <span className="text-teal-600">✓ {t.statusSaved}</span>
                    ) : t.statusPending}
                  </span>
                  {row.pillsPerDose > 0 && row.timesPerDay > 0 && (
                    <span className="rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-semibold">
                      {row.pillsPerDose} × {row.timesPerDay} = {row.pillsPerDose * row.timesPerDay} {language === "fr" ? "cp/jour" : language === "ar" ? "ق/يوم" : "pills/day"}
                    </span>
                  )}
                </div>

                {/* Row 1: Name */}
                <div className="space-y-1 mb-3">
                  <label className="text-xs font-semibold text-slate-600">{t.nameLabel}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
                    value={row.name}
                    onChange={(e) => updateDraft(row.id, { name: e.target.value })}
                    placeholder={language === "fr" ? "ex : Paracétamol" : language === "ar" ? "مثال: باراسيتامول" : "e.g. Paracetamol"}
                  />
                </div>

                {/* Row 2: Strength */}
                <div className="space-y-1 mb-3">
                  <label className="text-xs font-semibold text-slate-600">{t.strengthLabel}</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
                    value={row.strength}
                    onChange={(e) => updateDraft(row.id, { strength: e.target.value })}
                    placeholder={language === "fr" ? "ex : 500 mg · comprimé" : language === "ar" ? "مثال: 500 ملغ · قرص" : "e.g. 500 mg · tablet"}
                  />
                </div>

                {/* Row 3: Pills per dose + Times per day (side by side) */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{t.pillsPerDoseLabel}</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateDraft(row.id, { pillsPerDose: Math.max(1, row.pillsPerDose - 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold">−</button>
                      <span className="flex-1 text-center text-lg font-bold text-indigo-700">{row.pillsPerDose}</span>
                      <button type="button" onClick={() => updateDraft(row.id, { pillsPerDose: Math.min(10, row.pillsPerDose + 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold">+</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{t.timesPerDayLabel}</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateDraft(row.id, { timesPerDay: Math.max(1, row.timesPerDay - 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold">−</button>
                      <span className="flex-1 text-center text-lg font-bold text-indigo-700">{row.timesPerDay}</span>
                      <button type="button" onClick={() => updateDraft(row.id, { timesPerDay: Math.min(6, row.timesPerDay + 1) })}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold">+</button>
                    </div>
                  </div>
                </div>

                {/* Row 4: Notification times (one per dose) */}
                <div className="space-y-2 mb-3">
                  <label className="text-xs font-semibold text-slate-600">{t.notifTimesTitle}</label>
                  <div className="flex flex-wrap gap-2">
                    {row.times.map((time, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 rounded-xl border border-indigo-100 bg-indigo-50 px-2 py-1">
                        <span className="text-[10px] font-bold text-indigo-500">{language === "fr" ? `Prise ${idx + 1}` : language === "ar" ? `جرعة ${idx + 1}` : `Dose ${idx + 1}`}</span>
                        <input type="time" value={time}
                          onChange={(e) => updateTime(row.id, idx, e.target.value)}
                          className="rounded-lg border-0 bg-transparent text-sm font-semibold text-indigo-700 focus:outline-none" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Row 5: End date */}
                <div className="space-y-1 mb-4">
                  <label className="text-xs font-semibold text-slate-600">{t.endDateLabel}</label>
                  <input type="date" value={row.endDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => updateDraft(row.id, { endDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400">{t.endDateHint}</p>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={() => saveDraft(row)} disabled={readOnly || row.saved} className="flex-1">
                    {row.saved ? t.savedButton : (row.serverId ? t.updateButton : t.saveButton)}
                  </Button>
                  {/* Delete button — only for existing server-side medications */}
                  {row.serverId && !readOnly && (
                    <button type="button"
                      onClick={async () => {
                        if (!confirm(isFr ? "Supprimer ce médicament ?" : isAr ? "حذف هذا الدواء؟" : "Delete this medication?")) return;
                        await apiFetch(`/medication/${row.serverId}`, { method: "DELETE" }).catch(() => {});
                        setDrafts(d => d.filter(r => r.id !== row.id));
                      }}
                      className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors">
                      🗑
                    </button>
                  )}
                  {/* Remove unsaved row from the list */}
                  {!row.serverId && !readOnly && (
                    <button type="button"
                      onClick={() => setDrafts(d => d.filter(r => r.id !== row.id))}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-100 transition-colors">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Save all — shown when 2+ medications have unsaved changes */}
            {!readOnly && drafts.filter(r => !r.saved && r.name.trim()).length >= 2 && (
              <button type="button" onClick={saveAll}
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:from-indigo-700 hover:to-violet-700 transition-all hover:scale-[1.01]">
                💾 {isFr ? `Tout enregistrer (${drafts.filter(r => !r.saved && r.name.trim()).length} médicaments)` : isAr ? `حفظ الكل (${drafts.filter(r => !r.saved && r.name.trim()).length})` : `Save all (${drafts.filter(r => !r.saved && r.name.trim()).length} medications)`}
              </button>
            )}

            {!readOnly && (manualMode || manageMode || drafts.length > 0) && (
              <Button type="button" variant="ghost"
                onClick={() => setDrafts((d) => [...d, { ...emptyDraft, id: `m-${Date.now()}` }])}>
                {t.addRow}
              </Button>
            )}

            {/* Go to dashboard — appears once at least one medication is saved */}
            {drafts.some(r => r.saved) && (() => {
              const total = drafts.length;
              const saved = drafts.filter(r => r.saved).length;
              const allSaved = saved === total;
              return (
                <div className={`rounded-2xl border-2 p-4 text-center transition-all ${allSaved ? "border-teal-400 bg-teal-50" : "border-indigo-200 bg-indigo-50"}`}>
                  <p className={`text-sm font-semibold mb-3 ${allSaved ? "text-teal-800" : "text-indigo-800"}`}>
                    {allSaved
                      ? (isFr ? `✅ Tous les médicaments sont enregistrés (${saved}/${total})` : isAr ? `✅ تم حفظ جميع الأدوية (${saved}/${total})` : `✅ All medications saved (${saved}/${total})`)
                      : (isFr ? `💊 ${saved} sur ${total} médicament(s) enregistré(s)` : isAr ? `💊 تم حفظ ${saved} من ${total}` : `💊 ${saved} of ${total} medication(s) saved`)}
                  </p>
                  <button type="button"
                    onClick={() => router.push("/dashboard")}
                    className={`w-full rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] ${allSaved ? "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600" : "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600"}`}>
                    {isFr ? "🏠 Retour au tableau de bord" : isAr ? "🏠 العودة إلى لوحة التحكم" : "🏠 Back to dashboard"}
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function MedicationFormPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">…</div>}>
          <MedicationFormInner />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  );
}
