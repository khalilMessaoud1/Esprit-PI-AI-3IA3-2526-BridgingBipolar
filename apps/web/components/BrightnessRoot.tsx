"use client";

import { ReactNode, useEffect, useState } from "react";

const STORAGE_KEY = "bb_brightness";

function readBrightness(): number {
  if (typeof window === "undefined") return 100;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : 100;
  if (Number.isNaN(n)) return 100;
  return Math.min(100, Math.max(60, n));
}

/**
 * Brightness filter on a wrapper (not html/body) so layout and fonts stay stable.
 */
export default function BrightnessRoot({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(100);

  useEffect(() => {
    setValue(readBrightness());

    const onTheme = (e: Event) => {
      const ce = e as CustomEvent<{ brightness?: number }>;
      if (typeof ce.detail?.brightness === "number") {
        setValue(Math.min(100, Math.max(60, ce.detail.brightness)));
      }
    };
    const onBrightness = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === "number") {
        setValue(Math.min(100, Math.max(60, ce.detail)));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const n = Number(e.newValue);
        if (!Number.isNaN(n)) setValue(Math.min(100, Math.max(60, n)));
      }
    };

    window.addEventListener("bb-theme-changed", onTheme as EventListener);
    window.addEventListener("bb-brightness", onBrightness as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("bb-theme-changed", onTheme as EventListener);
      window.removeEventListener("bb-brightness", onBrightness as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const factor = value / 100;

  return (
    <div
      className="min-h-screen min-w-0 transition-[filter] duration-200"
      style={{ filter: `brightness(${factor})` }}
    >
      {children}
    </div>
  );
}
