"use client";

import { ReactNode, useEffect, useState } from "react";

const STORAGE_KEY = "bb_brightness";

function readBrightness(): number {
  if (typeof window === "undefined") return 90;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : 90;
  if (Number.isNaN(n)) return 90;
  return Math.min(100, Math.max(60, n));
}

/**
 * Brightness is applied on this wrapper only (not on `html`) so global layout, fonts,
 * and interactions stay reliable on auth pages and elsewhere.
 */
export default function BrightnessRoot({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(90);

  useEffect(() => {
    document.documentElement.style.filter = "";
  }, []);

  useEffect(() => {
    setValue(readBrightness());
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === "number") setValue(ce.detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const n = Number(e.newValue);
        if (!Number.isNaN(n)) setValue(Math.min(100, Math.max(60, n)));
      }
    };
    window.addEventListener("bb-brightness", onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("bb-brightness", onCustom as EventListener);
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
