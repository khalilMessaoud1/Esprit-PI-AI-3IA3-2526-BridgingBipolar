"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "../../components/AppShell";
import ProtectedRoute from "../../components/ProtectedRoute";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

type Doctor = { id: string; name: string; email: string; avatarUrl: string | null; bio: string | null };
type Appt = { id: string; startAt: string; endAt: string; status: string; doctor: { id: string; name: string; email: string } };

const HOURS = [8, 9, 10, 11, 14, 15, 16, 17];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function isWeekend(d: Date) { const dw = d.getDay(); return dw === 0 || dw === 6; }

type Step = "doctor" | "calendar" | "time" | "done";

export default function BookVisitPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].booking;
  const locale = language === "fr" ? "fr-FR" : language === "ar" ? "ar" : "en-US";
  const isPatient = user?.role === "PATIENT";

  const [step, setStep] = useState<Step>("doctor");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [mine, setMine] = useState<Appt[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const isFr = language === "fr";
  const isAr = language === "ar";

  const refreshMine = useCallback(() => {
    if (!isPatient) return;
    apiFetch<Appt[]>("/booking/appointments").then(setMine).catch(() => setMine([]));
  }, [isPatient]);

  useEffect(() => {
    if (!isPatient) return;
    apiFetch<Doctor[]>("/booking/doctors").then(setDoctors).catch(() => setDoctors([]));
  }, [isPatient]);

  useEffect(() => { refreshMine(); }, [refreshMine]);

  const book = async (hour: number) => {
    if (!isPatient || !selectedDoctor || !selectedDate) return;
    setBooking(true);
    setMsg(null);
    try {
      const start = new Date(selectedDate);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(45);
      await apiFetch("/booking/appointments", {
        method: "POST",
        body: JSON.stringify({ doctorId: selectedDoctor.id, startAt: start.toISOString(), endAt: end.toISOString() })
      });
      setMsg(t.requestSent);
      refreshMine();
      setStep("done");
    } finally {
      setBooking(false);
    }
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDow(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(locale, { month: "long", year: "numeric" });
  const dayLabels = isFr ? ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"] : isAr ? ["أح","اث","ثل","أر","خم","جم","سب"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Already-booked slots for the selected doctor on the selected date
  const bookedHours = useMemo(() => {
    if (!selectedDate || !selectedDoctor) return new Set<number>();
    return new Set(
      mine
        .filter(a => a.doctor.id === selectedDoctor.id && isSameDay(new Date(a.startAt), selectedDate))
        .map(a => new Date(a.startAt).getHours())
    );
  }, [mine, selectedDate, selectedDoctor]);

  if (!isPatient) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t.bookingPatientsOnly}{" "}
            <Link href="/dashboard" className="text-indigo-600 hover:underline">{t.backToDashboard}</Link>
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-6 max-w-3xl">

          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl px-6 py-7 shadow-md"
            style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a78bfa 100%)" }}>
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at 20% 50%,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
            <div className="relative">
              <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">📅 {t.title}</p>
              <h1 className="text-2xl font-bold text-white">{t.title}</h1>
            </div>
          </div>

          {/* ── Step 1 : Pick a doctor ────────────────────────────── */}
          {step === "doctor" && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">{isFr ? "Choisissez votre clinicien" : isAr ? "اختر طبيبك" : "Choose your clinician"}</h2>
              {doctors.length === 0 && <p className="text-sm text-slate-400">{isFr ? "Chargement…" : "Loading…"}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {doctors.map((doc) => (
                  <button key={doc.id} type="button"
                    onClick={() => { setSelectedDoctor(doc); setStep("calendar"); }}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 hover:shadow-md transition-all">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 font-bold text-lg">
                      {doc.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate">{doc.name}</div>
                      <div className="text-xs text-slate-500 truncate">{doc.email}</div>
                      {doc.bio && <div className="text-xs text-slate-400 truncate mt-0.5">{doc.bio}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2 : Pick a date ─────────────────────────────── */}
          {step === "calendar" && selectedDoctor && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep("doctor")} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">← {isFr ? "Retour" : "Back"}</button>
                <span className="text-sm text-slate-600">{isFr ? "Médecin sélectionné :" : "Selected doctor:"} <strong>{selectedDoctor.name}</strong></span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prevMonth} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">←</button>
                  <span className="text-base font-bold text-slate-900 capitalize">{monthLabel}</span>
                  <button onClick={nextMonth} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">→</button>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-2">
                  {dayLabels.map(d => <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 py-1">{d}</div>)}
                </div>
                {/* Cells */}
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const date = new Date(viewYear, viewMonth, day);
                    const isPast = date < today;
                    const weekend = isWeekend(date);
                    const isToday = isSameDay(date, today);
                    const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                    const disabled = isPast || weekend;
                    return (
                      <button key={day} disabled={disabled}
                        onClick={() => { setSelectedDate(date); setStep("time"); }}
                        className={`flex flex-col items-center rounded-xl py-2 text-sm transition-all ${
                          isSelected ? "bg-indigo-600 text-white shadow-md" :
                          disabled ? "opacity-30 cursor-not-allowed text-slate-400" :
                          isToday ? "bg-sky-50 border border-sky-300 text-sky-800 font-bold hover:bg-sky-100" :
                          "hover:bg-indigo-50 hover:border-indigo-200 border border-transparent text-slate-700"
                        }`}>
                        <span className="font-semibold">{day}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] text-slate-400 text-center">{isFr ? "Les week-ends et les jours passés ne sont pas disponibles." : "Weekends and past dates are not available."}</p>
              </div>
            </div>
          )}

          {/* ── Step 3 : Pick a time ─────────────────────────────── */}
          {step === "time" && selectedDoctor && selectedDate && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep("calendar")} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">← {isFr ? "Retour" : "Back"}</button>
                <span className="text-sm text-slate-600">
                  {selectedDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" — "}<strong>{selectedDoctor.name}</strong>
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-4">{t.availableSlots}</h2>
                {msg && <p className="mb-3 text-sm font-medium text-teal-700">{msg}</p>}
                <div className="grid gap-2 sm:grid-cols-4">
                  {HOURS.map(h => {
                    const booked = bookedHours.has(h);
                    const label = `${String(h).padStart(2,"0")}:00`;
                    return (
                      <button key={h} disabled={booked || booking}
                        onClick={() => book(h)}
                        className={`flex flex-col items-center rounded-2xl border py-4 text-sm font-semibold transition-all ${
                          booked
                            ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                            : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-md"
                        }`}>
                        <span className="text-lg">⏰</span>
                        <span className="mt-1">{label}</span>
                        {booked && <span className="text-[9px] mt-0.5 text-slate-400">{isFr ? "Réservé" : "Booked"}</span>}
                      </button>
                    );
                  })}
                </div>
                {booking && <p className="mt-3 text-xs text-slate-500">{isFr ? "Envoi de la demande…" : "Sending request…"}</p>}
              </div>
            </div>
          )}

          {/* ── Done ─────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="rounded-3xl border border-teal-200 bg-teal-50 p-8 text-center space-y-4 shadow-sm">
              <div className="emoji text-5xl">🎉</div>
              <h2 className="text-xl font-bold text-teal-900">{t.requestSent}</h2>
              <p className="text-sm text-teal-700">{isFr ? "Votre médecin confirmera le rendez-vous sous peu." : "Your doctor will confirm the appointment shortly."}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => { setStep("doctor"); setSelectedDate(null); setMsg(null); }}
                  className="rounded-2xl border border-teal-300 bg-white px-5 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 transition-colors">
                  {isFr ? "Prendre un autre rendez-vous" : "Book another"}
                </button>
                <Link href="/dashboard" className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm">
                  {isFr ? "Retour au tableau de bord" : "Back to dashboard"}
                </Link>
              </div>
            </div>
          )}

          {/* ── My appointments ──────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">📋 {t.yourAppointments}</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-slate-400">{t.noBookings}</p>
            ) : (
              <div className="space-y-2">
                {mine.map(a => {
                  const statusColors: Record<string, string> = { confirmed: "bg-teal-100 text-teal-800", pending: "bg-amber-100 text-amber-800", cancelled: "bg-red-100 text-red-700" };
                  const localStatus = isFr ? ({ confirmed: "Confirmé", pending: "En attente", cancelled: "Annulé" }[a.status] ?? a.status) : a.status;
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{a.doctor.name}</div>
                        <div className="text-xs text-slate-500">{new Date(a.startAt).toLocaleString(locale, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusColors[a.status] ?? "bg-slate-100 text-slate-600"}`}>{localStatus}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
