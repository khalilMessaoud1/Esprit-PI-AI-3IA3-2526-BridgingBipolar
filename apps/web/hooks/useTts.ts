"use client";

import { Language } from "../lib/i18n";

let activeUtterance: SpeechSynthesisUtterance | null = null;

/** Stop any in-progress browser speech synthesis (questionnaires, read-aloud, etc.). */
export function stopAllTts(): void {
  if (typeof window === "undefined") return;
  activeUtterance = null;
  window.speechSynthesis.cancel();
  // Some browsers keep a queued utterance; cancel twice to flush the queue.
  window.speechSynthesis.cancel();
}

export function useTts(language: Language) {
  const speak = (text: string) => {
    if (typeof window === "undefined") return;
    stopAllTts();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "ar" ? "ar" : language === "fr" ? "fr-FR" : "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };

    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    stopAllTts();
  };

  return { speak, stop };
}
