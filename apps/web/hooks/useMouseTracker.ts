"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

const ML_URL = process.env.NEXT_PUBLIC_ML_URL || "http://localhost:5000";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SEND_INTERVAL_MS = 30_000;
const MIN_EVENTS = 5;
const BUFFER_WINDOW_MS = 10 * 60_000;

export type MouseState = "normal" | "manic" | "depressed" | "pending";
export type MouseLevel = "Low" | "Mild" | "Moderate" | "High";

export type MouseBehavior = {
  state: MouseState;
  score: number;
  level: MouseLevel;
  windowCount: number;
  anomalyPct: number;
  lastUpdated: Date | null;
  connected: boolean;
  eventCount: number;
};

type RawEvent = { timestamp: number; x: number; y: number; event_type: string };

export const MOUSE_BEHAVIOR_INITIAL: MouseBehavior = {
  state: "pending",
  score: 0,
  level: "Low",
  windowCount: 0,
  anomalyPct: 0,
  lastUpdated: null,
  connected: false,
  eventCount: 0,
};

// ── Context (shared via MouseTrackerProvider in root layout) ─────────────────
export const MouseTrackerContext = createContext<MouseBehavior>(MOUSE_BEHAVIOR_INITIAL);
export const useMouseBehavior = () => useContext(MouseTrackerContext);

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localStorageKey(date: string) {
  return `bb_mouse_${date}`;
}

function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

const LEVELS: MouseLevel[] = ["Low", "Mild", "Moderate", "High"];

function loadFromStorage(): MouseBehavior {
  try {
    const raw = localStorage.getItem(localStorageKey(todayStr()));
    if (!raw) return MOUSE_BEHAVIOR_INITIAL;
    const parsed = JSON.parse(raw) as Partial<MouseBehavior> & { lastUpdated?: string | null };
    const states: MouseState[] = ["normal", "manic", "depressed", "pending"];
    const state = states.includes(parsed.state as MouseState) ? (parsed.state as MouseState) : "pending";
    const level = LEVELS.includes(parsed.level as MouseLevel) ? (parsed.level as MouseLevel) : "Low";
    return {
      ...MOUSE_BEHAVIOR_INITIAL,
      state,
      score: Number(parsed.score ?? 0),
      level,
      windowCount: Number(parsed.windowCount ?? 0),
      anomalyPct: Number(parsed.anomalyPct ?? 0),
      eventCount: Number(parsed.eventCount ?? 0),
      connected: Boolean(parsed.connected),
      lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated as string) : null
    };
  } catch {
    return MOUSE_BEHAVIOR_INITIAL;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useMouseTracker(): MouseBehavior {
  const [behavior, setBehavior] = useState<MouseBehavior>(() =>
    typeof window !== "undefined" ? loadFromStorage() : MOUSE_BEHAVIOR_INITIAL
  );

  const bufferRef = useRef<RawEvent[]>([]);
  const connectedRef = useRef(false);
  // Ref so the midnight closure always reads the latest behavior
  const behaviorRef = useRef<MouseBehavior>(behavior);

  useEffect(() => { behaviorRef.current = behavior; }, [behavior]);

  // Persist to localStorage on every meaningful update
  useEffect(() => {
    if (!behavior.lastUpdated) return;
    try {
      localStorage.setItem(localStorageKey(todayStr()), JSON.stringify(behavior));
    } catch { /* storage full / private mode */ }
  }, [behavior]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Health-check FastAPI
    fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(3_000) })
      .then((r) => { if (r.ok) { connectedRef.current = true; setBehavior((p) => ({ ...p, connected: true })); } })
      .catch(() => {});

    // Mouse event recording
    const record = (type: string) => (e: Event) => {
      const me = e as MouseEvent;
      bufferRef.current.push({ timestamp: Date.now(), x: me.clientX ?? 0, y: me.clientY ?? 0, event_type: type });
    };
    const onMove = record("move");
    const onClick = record("click");
    const onScroll = record("scroll");
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });

    // ── Persist current reading to backend (fire-and-forget) ────────────────
    const persistToBackend = async (b: MouseBehavior, date: string) => {
      try {
        const token = localStorage.getItem("bb_token");
        if (!token || !b.lastUpdated) return;
        await fetch(`${API_URL}/mouse-behavior`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            date,
            state: b.state,
            score: b.score,
            level: b.level,
            windowCount: b.windowCount,
            anomalyPct: b.anomalyPct,
          }),
        });
      } catch { /* offline — localStorage copy is kept */ }
    };

    // Analysis interval
    const interval = setInterval(async () => {
      const cutoff = Date.now() - BUFFER_WINDOW_MS;
      bufferRef.current = bufferRef.current.filter((e) => e.timestamp >= cutoff);
      const count = bufferRef.current.length;
      setBehavior((p) => ({ ...p, eventCount: count }));

      if (count < MIN_EVENTS) return;

      try {
        const res = await fetch(`${ML_URL}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: bufferRef.current }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const data = await res.json();
        connectedRef.current = true;
        const states: MouseState[] = ["normal", "manic", "depressed", "pending"];
        const st = states.includes(data.state) ? data.state : "pending";
        const lv = LEVELS.includes(data.level) ? data.level : "Low";
        const next: MouseBehavior = {
          state: st,
          score: Number(data.score) || 0,
          level: lv,
          windowCount: Number(data.window_count) || 0,
          anomalyPct: Number(data.anomaly_pct) || 0,
          lastUpdated: new Date(),
          connected: true,
          eventCount: count
        };
        setBehavior(next);
        // Save to backend so the doctor can see it without waiting until midnight
        void persistToBackend(next, todayStr());
      } catch {
        connectedRef.current = false;
        setBehavior((p) => ({ ...p, connected: false }));
      }
    }, SEND_INTERVAL_MS);

    // ── Midnight: save the day's reading then reset ───────────────────────────
    const saveDayAndReset = async (dateStr: string) => {
      const current = behaviorRef.current;
      if (current.lastUpdated !== null) {
        try {
          const token = localStorage.getItem("bb_token");
          if (token) {
            await fetch(`${API_URL}/mouse-behavior`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                date: dateStr,
                state: current.state,
                score: current.score,
                level: current.level,
                windowCount: current.windowCount,
                anomalyPct: current.anomalyPct,
              }),
            });
          }
        } catch { /* offline — data stays in localStorage until next attempt */ }
        // Remove the now-completed day's localStorage entry
        try { localStorage.removeItem(localStorageKey(dateStr)); } catch {}
      }
      // Reset tracking for the new day
      bufferRef.current = [];
      setBehavior({ ...MOUSE_BEHAVIOR_INITIAL, connected: connectedRef.current });
    };

    // Schedule midnight chain
    let midnightTimeout: ReturnType<typeof setTimeout>;
    let dailyInterval: ReturnType<typeof setInterval>;

    const scheduleMidnight = () => {
      // Capture today's date string NOW — it will be "yesterday" when the timer fires
      const dateForSave = todayStr();
      midnightTimeout = setTimeout(() => {
        saveDayAndReset(dateForSave);
        // Then repeat every 24 h
        dailyInterval = setInterval(() => {
          const d = new Date();
          d.setDate(d.getDate() - 1); // yesterday at the moment of save
          saveDayAndReset(todayStr(d));
        }, 24 * 60 * 60 * 1000);
      }, msUntilMidnight());
    };

    scheduleMidnight();

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("wheel", onScroll);
      clearInterval(interval);
      clearTimeout(midnightTimeout);
      clearInterval(dailyInterval);
    };
  }, []);

  return behavior;
}
