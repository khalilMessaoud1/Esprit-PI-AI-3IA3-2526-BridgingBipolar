"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProtectedRoute from "../../components/ProtectedRoute";
import Questionnaire from "../../components/Questionnaire";
import { hdrsQuestions, ymrsQuestions } from "../../lib/assessments";
import { apiFetch } from "../../lib/api";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

export default function AssessmentPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const ta = uiText[language].assessmentPage;
  const t = uiText[language].assessments;
  const [step, setStep] = useState<"HDRS" | "YMRS" | "done">("HDRS");
  const [hdrsScore, setHdrsScore] = useState<number | null>(null);
  const [ymrsScore, setYmrsScore] = useState<number | null>(null);

  const handleComplete = async (type: "YMRS" | "HDRS", answers: Record<string, number>, score: number) => {
    await apiFetch("/assessment", {
      method: "POST",
      body: JSON.stringify({ type, answers, score }),
    }).catch(() => {});

    if (type === "HDRS") {
      setHdrsScore(score);
      setStep("YMRS");
      return;
    }

    setYmrsScore(score);
    setStep("done");
  };

  const hdrs = hdrsScore ?? 0;
  const ymrs = ymrsScore ?? 0;

  const hdrsLevel = hdrs <= 7 ? { label: ta.levels.hdrs.normal, color: "text-teal-700", bg: "bg-teal-50 border-teal-200", emoji: "🟢" }
    : hdrs <= 13 ? { label: ta.levels.hdrs.mild, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", emoji: "🟡" }
    : hdrs <= 18 ? { label: ta.levels.hdrs.moderate, color: "text-orange-700", bg: "bg-orange-50 border-orange-200", emoji: "🟠" }
    : { label: ta.levels.hdrs.severe, color: "text-red-700", bg: "bg-red-50 border-red-200", emoji: "🔴" };

  const ymrsLevel = ymrs <= 12 ? { label: ta.levels.ymrs.minimal, color: "text-teal-700", bg: "bg-teal-50 border-teal-200", emoji: "🟢" }
    : ymrs <= 20 ? { label: ta.levels.ymrs.mild, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", emoji: "🟡" }
    : ymrs <= 30 ? { label: ta.levels.ymrs.moderate, color: "text-orange-700", bg: "bg-orange-50 border-orange-200", emoji: "🟠" }
    : { label: ta.levels.ymrs.severe, color: "text-red-700", bg: "bg-red-50 border-red-200", emoji: "🔴" };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mx-auto w-full max-w-2xl space-y-6 pb-12">

          {/* Header */}
          <div className="relative overflow-hidden rounded-3xl px-6 py-7 shadow-md"
            style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%)" }}>
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
            <div className="relative">
              <p className="text-indigo-200 text-sm font-medium mb-1">📋 {uiText[language].assessments.hdrsTitle.split(" ")[0]}</p>
              <h1 className="text-2xl font-bold text-white">HDRS + YMRS</h1>
              <p className="mt-2 text-indigo-200 text-sm">
                {uiText[language].assessments.hdrsTitle} · {uiText[language].assessments.ymrsTitle}
              </p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            {[
              { id: "HDRS", label: "HDRS", emoji: "📉", done: step === "YMRS" || step === "done" },
              { id: "YMRS", label: "YMRS", emoji: "📈", done: step === "done" },
              { id: "done", label: "Résultats", emoji: "✅", done: step === "done" },
            ].map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${step === s.id || s.done ? "bg-indigo-400" : "bg-slate-200"}`} />}
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                  step === s.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : s.done
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}>
                  <span className="emoji">{s.emoji}</span> {s.label}
                </div>
              </div>
            ))}
          </div>

          {step === "HDRS" && (
            <Questionnaire
              key="hdrs"
              title={t.hdrsTitle}
              questions={hdrsQuestions}
              onComplete={(answers, score) => handleComplete("HDRS", answers, score)}
            />
          )}

          {step === "YMRS" && (
            <Questionnaire
              key="ymrs"
              title={t.ymrsTitle}
              questions={ymrsQuestions}
              onComplete={(answers, score) => handleComplete("YMRS", answers, score)}
            />
          )}

          {step === "done" && (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
              <div className="text-center">
                <div className="emoji text-5xl mb-3">🎉</div>
                <h2 className="text-xl font-bold text-slate-900">{ta.done}</h2>
                <p className="mt-1 text-sm text-slate-500">{ta.doneSub}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* HDRS result */}
                <div className={`rounded-2xl border p-5 ${hdrsLevel.bg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="emoji text-xl">📉</span>
                    <span className="text-sm font-bold text-slate-800">{ta.hdrsLabel}</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 mb-1">{hdrs} <span className="text-base font-normal text-slate-400">/ 52</span></div>
                  <div className={`flex items-center gap-1.5 text-sm font-semibold ${hdrsLevel.color}`}>
                    <span className="emoji">{hdrsLevel.emoji}</span> {hdrsLevel.label}
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (hdrs / 52) * 100)}%`, background: hdrs > 18 ? "#ef4444" : hdrs > 13 ? "#f97316" : "#f59e0b" }} />
                  </div>
                </div>

                {/* YMRS result */}
                <div className={`rounded-2xl border p-5 ${ymrsLevel.bg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="emoji text-xl">📈</span>
                    <span className="text-sm font-bold text-slate-800">{ta.ymrsLabel}</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 mb-1">{ymrs} <span className="text-base font-normal text-slate-400">/ 60</span></div>
                  <div className={`flex items-center gap-1.5 text-sm font-semibold ${ymrsLevel.color}`}>
                    <span className="emoji">{ymrsLevel.emoji}</span> {ymrsLevel.label}
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (ymrs / 60) * 100)}%`, background: ymrs > 30 ? "#ef4444" : ymrs > 20 ? "#f97316" : "#f59e0b" }} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 leading-relaxed">
                {ta.disclaimer}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("HDRS")}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  {ta.restart}
                </button>
                <button onClick={() => router.push("/dashboard")}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:from-indigo-700 hover:to-purple-700 transition-colors shadow-sm">
                  {ta.backDashboard}
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-slate-400">
            HDRS (Hamilton Depression Rating Scale) · YMRS (Young Mania Rating Scale) · Évaluations validées cliniquement
          </p>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
