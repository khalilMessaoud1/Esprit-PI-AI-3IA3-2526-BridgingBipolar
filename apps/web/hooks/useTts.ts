"use client";

import { Language } from "../lib/i18n";

export function useTts(language: Language) {
  const speak = (text: string) => {
    if (typeof window === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "ar" ? "ar" : language === "fr" ? "fr-FR" : "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (typeof window !== "undefined") window.speechSynthesis.cancel();
  };

  return { speak, stop };
}
