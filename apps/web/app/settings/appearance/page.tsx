"use client";

import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

const STORAGE_KEY = "bb_brightness";

export default function SettingsAppearancePage() {
  const { language } = useLanguage();
  const t = uiText[language].appearance;
  const [value, setValue] = useState(90);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const n = raw ? Number(raw) : 90;
    setValue(Number.isNaN(n) ? 90 : Math.min(100, Math.max(60, n)));
  }, []);

  const apply = (next: number) => {
    const clamped = Math.min(100, Math.max(60, next));
    setValue(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent("bb-brightness", { detail: clamped }));
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
        <p className="text-sm text-textSecondary">{t.subtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-background p-4">
          <p className="text-sm font-semibold text-textPrimary">{t.theme}</p>
          <p className="text-xs text-textSecondary">{t.themeHint}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-background p-4">
          <p className="text-sm font-semibold text-textPrimary">{t.brightness}</p>
          <p className="text-xs text-textSecondary">{t.brightnessHint}</p>
          <input
            type="range"
            min={60}
            max={100}
            value={value}
            onChange={(e) => apply(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <p className="mt-1 text-xs text-textSecondary">{value}%</p>
        </div>
      </div>
    </Card>
  );
}
