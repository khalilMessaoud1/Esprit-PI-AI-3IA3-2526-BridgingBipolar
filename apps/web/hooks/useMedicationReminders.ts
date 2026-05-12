"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";

type Medication = { id: string; name: string; dosage: string; time: string };

/** Returns "HH:MM" (zero-padded) for the given Date. */
function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function showMedNotification(med: Medication, lang: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title =
    lang === "fr" ? "💊 Rappel médicament"
    : lang === "ar" ? "💊 تذكير الدواء"
    : "💊 Medication reminder";
  const body =
    lang === "fr" ? `C'est l'heure de prendre : ${med.name} — ${med.dosage}`
    : lang === "ar" ? `حان وقت تناول: ${med.name} — ${med.dosage}`
    : `Time to take: ${med.name} — ${med.dosage}`;
  try {
    const n = new Notification(title, {
      body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: `bb-med-${med.id}-${toHHMM(new Date())}`, // unique per medication per minute
    });
    setTimeout(() => n.close(), 15_000);
  } catch { /* blocked / incognito */ }
}

/**
 * Smart medication reminders.
 * - Requests browser notification permission once.
 * - Fetches medications from the API and keeps them fresh every 5 min.
 * - Fires a notification at the EXACT minute that matches a medication's scheduled time.
 * - Aligns the check interval with the system clock (fires at :00 of each minute).
 * - Passes empty string for `language` to disable (e.g. for non-patient roles).
 */
export function useMedicationReminders(language: string) {
  const medsRef = useRef<Medication[]>([]);
  const firedRef = useRef<Set<string>>(new Set()); // fired keys: `${id}-${HH:MM}`

  useEffect(() => {
    if (typeof window === "undefined" || !language) return;

    // Ask for permission once — silently ignore if already decided
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    // ── Fetch medications ─────────────────────────────────────────────────
    const fetchMeds = () => {
      apiFetch<{ items: Medication[] }>("/medication")
        .then((d) => { medsRef.current = d.items ?? []; })
        .catch(() => {}); // silent — token might not be ready on first render
    };
    fetchMeds();
    const refreshInterval = setInterval(fetchMeds, 5 * 60_000);

    // ── Reset fired set at midnight ───────────────────────────────────────
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30);
    const midnightTimeout = setTimeout(() => firedRef.current.clear(), midnight.getTime() - now.getTime());

    // ── Check at each exact clock minute ─────────────────────────────────
    const check = () => {
      if (Notification.permission !== "granted") return;
      const current = toHHMM(new Date());
      for (const med of medsRef.current) {
        const times = (med.time || "").split(",").map(t => t.trim()).filter(Boolean);
        for (const t of times) {
          // Normalise stored time ("8:00" → "08:00")
          const normalised = t.includes(":") && t.length === 4 ? `0${t}` : t;
          const key = `${med.id}-${normalised}`;
          if (normalised === current && !firedRef.current.has(key)) {
            firedRef.current.add(key);
            showMedNotification(med, language);
          }
        }
      }
    };

    // Align first tick to the next full minute (:00 seconds)
    const msToNextMinute =
      (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds() + 200;

    let tickInterval: ReturnType<typeof setInterval>;
    const alignTimeout = setTimeout(() => {
      check(); // fire immediately at the aligned minute
      tickInterval = setInterval(check, 60_000); // then every 60 s
    }, msToNextMinute);

    return () => {
      clearInterval(refreshInterval);
      clearTimeout(midnightTimeout);
      clearTimeout(alignTimeout);
      clearInterval(tickInterval);
    };
  }, [language]);
}
