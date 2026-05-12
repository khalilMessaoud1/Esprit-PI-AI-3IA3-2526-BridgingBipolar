"use client";

import { useState } from "react";
import Card from "../../../components/Card";
import { useLanguage } from "../../../hooks/useLanguage";
import { useAuth, type AuthUser } from "../../../hooks/useAuth";
import { apiFetch } from "../../../lib/api";
import { uiText } from "../../../lib/i18n";

export default function SettingsLanguagePage() {
  const { language, setLanguage } = useLanguage();
  const { setUser } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const t = uiText[language].languagePage;

  const updateLanguage = async (next: "en" | "fr" | "ar") => {
    setLanguage(next);
    const tNext = uiText[next].languagePage;
    try {
      const response = await apiFetch<{ user: AuthUser }>("/user/language", {
        method: "PATCH",
        body: JSON.stringify({ language: next })
      });
      if (response.user) {
        localStorage.setItem("bb_user", JSON.stringify(response.user));
        setUser(response.user);
      }
      setStatus(tNext.updated);
    } catch {
      setStatus(tNext.error);
    }
  };

  const labels: Record<"en" | "fr" | "ar", string> = {
    en: t.en,
    fr: t.fr,
    ar: t.ar
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
        <p className="text-sm text-textSecondary">{t.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {(["en", "fr", "ar"] as const).map((lang) => (
          <button
            key={lang}
            className={`rounded-xl border px-4 py-2 text-sm ${
              language === lang ? "border-primary bg-secondary" : "border-slate-200"
            }`}
            onClick={() => updateLanguage(lang)}
          >
            {labels[lang]}
          </button>
        ))}
      </div>
      {status && <p className="text-sm text-textSecondary">{status}</p>}
    </Card>
  );
}
