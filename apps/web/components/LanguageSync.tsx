"use client";

import { useEffect } from "react";
import { useLanguage } from "../hooks/useLanguage";

export default function LanguageSync() {
  const { language } = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}
