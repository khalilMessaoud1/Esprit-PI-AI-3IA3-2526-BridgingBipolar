"use client";

import { useEffect, useState } from "react";
import { Language } from "../lib/i18n";

function readInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const fromNav = localStorage.getItem("bb_lang") as Language | null;
  if (fromNav === "en" || fromNav === "fr" || fromNav === "ar") return fromNav;
  try {
    const raw = localStorage.getItem("bb_user");
    if (!raw) return "en";
    const u = JSON.parse(raw) as { language?: string };
    if (u.language === "fr" || u.language === "ar" || u.language === "en") return u.language;
  } catch {
    /* ignore */
  }
  return "en";
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    setLanguageState(readInitialLanguage());
    const sync = () => setLanguageState(readInitialLanguage());
    window.addEventListener("bb-user-changed", sync);
    return () => window.removeEventListener("bb-user-changed", sync);
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem("bb_lang", next);
  };

  return { language, setLanguage };
}
