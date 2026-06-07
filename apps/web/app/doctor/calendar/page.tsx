"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api";
import Button from "../../../components/Button";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

type Appt = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  patient: { id: string; name: string; email: string };
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function DoctorCalendarPage() {
  const { language } = useLanguage();
  const t = uiText[language].doctor;
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar" : "en-US";

  const [items, setItems] = useState<Appt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const load = () => {
    apiFetch<Appt[]>("/doctor/appointments")
      .then(setItems)
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: string) => {
    await apiFetch(`/doctor/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appt[]> = {};
    for (const a of items) {
      const d = new Date(a.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [items]);

  const getAppts = (d: Date) => apptsByDay[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] ?? [];

  const selectedAppts = selectedDate ? getAppts(selectedDate) : [];

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((v) => v - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((v) => v + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(locale, { month: "long", year: "numeric" });
  const dayLabels =
    language === "fr"
      ? ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
      : language === "ar"
        ? ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const statusCfg: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: "bg-teal-100 dark:bg-teal-950/50", text: "text-teal-800 dark:text-teal-300" },
    pending: { bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-800 dark:text-amber-300" },
    cancelled: { bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-700 dark:text-red-300" }
  };
  const localStatus = (s: string) =>
    language === "fr" ? ({ confirmed: "Confirmé", pending: "En attente", cancelled: "Annulé" }[s] ?? s) : s;

  return (
    <div className="max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 px-5 py-5 shadow-sm dark:from-sky-800 dark:to-indigo-900">
        <h1 className="text-xl font-bold text-white">📅 {t.calendarTitle}</h1>
        <p className="mt-1 text-xs text-sky-200">{t.calendarSubtitle}</p>
      </div>

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Calendar grid ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              ←
            </button>
            <span className="text-base font-bold capitalize text-slate-900 dark:text-slate-100">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              →
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7">
            {dayLabels.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(viewYear, viewMonth, day);
              const appts = getAppts(date);
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              const hasPending = appts.some((a) => a.status === "pending");
              const hasConfirmed = appts.some((a) => a.status === "confirmed");

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={`relative flex flex-col items-center rounded-xl py-2 text-sm transition-all hover:scale-105 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-md"
                      : isToday
                        ? "border border-sky-300 bg-sky-50 font-bold text-sky-800 dark:border-sky-600 dark:bg-sky-950/50 dark:text-sky-300"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  <span className="font-semibold">{day}</span>
                  {appts.length > 0 && (
                    <div className="mt-0.5 flex gap-0.5">
                      {hasPending && (
                        <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-amber-300" : "bg-amber-500"}`} />
                      )}
                      {hasConfirmed && (
                        <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-teal-300" : "bg-teal-500"}`} />
                      )}
                    </div>
                  )}
                  {appts.length > 0 && (
                    <span className={`mt-0.5 text-[9px] font-bold ${isSelected ? "text-indigo-200" : "text-slate-400 dark:text-slate-500"}`}>
                      {appts.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {language === "fr" ? "En attente" : "Pending"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              {language === "fr" ? "Confirmé" : "Confirmed"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full border border-sky-300 bg-sky-400 dark:border-sky-600" />
              {language === "fr" ? "Aujourd'hui" : "Today"}
            </span>
          </div>
        </div>

        {/* ── Selected day panel ────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
          {selectedDate ? (
            <>
              <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                {selectedDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                {selectedAppts.length} {language === "fr" ? "rendez-vous" : "appointment(s)"}
              </p>
              {selectedAppts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-500">
                  {language === "fr" ? "Aucun rendez-vous ce jour." : "No appointments on this day."}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedAppts.map((a) => {
                    const cfg = statusCfg[a.status] ?? {
                      bg: "bg-slate-100 dark:bg-slate-700",
                      text: "text-slate-600 dark:text-slate-300"
                    };
                    return (
                      <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/50">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{a.patient.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{a.patient.email}</div>
                        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {new Date(a.startAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} →{" "}
                          {new Date(a.endAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${cfg.bg} ${cfg.text}`}>
                            {localStatus(a.status)}
                          </span>
                          {a.status === "pending" && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setStatus(a.id, "confirmed")}
                                className="rounded-lg bg-teal-600 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-teal-700"
                              >
                                {t.confirm}
                              </button>
                              <button
                                onClick={() => setStatus(a.id, "cancelled")}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
                              >
                                {t.cancel}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <span className="mb-3 text-4xl">📅</span>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {language === "fr" ? "Cliquez sur une date pour voir les rendez-vous" : "Click a date to see appointments"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── All appointments list ──────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
        <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
          {language === "fr" ? "Tous les rendez-vous" : "All appointments"}
        </h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
            {t.noneScheduled}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => {
              const cfg = statusCfg[a.status] ?? {
                bg: "bg-slate-100 dark:bg-slate-700",
                text: "text-slate-600 dark:text-slate-300"
              };
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/50"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{a.patient.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(a.startAt).toLocaleString(locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${cfg.bg} ${cfg.text}`}>
                      {localStatus(a.status)}
                    </span>
                    {a.status === "pending" && (
                      <>
                        <Button onClick={() => setStatus(a.id, "confirmed")} className="px-3 py-1 text-xs">
                          {t.confirm}
                        </Button>
                        <Button variant="ghost" onClick={() => setStatus(a.id, "cancelled")} className="px-3 py-1 text-xs">
                          {t.cancel}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
