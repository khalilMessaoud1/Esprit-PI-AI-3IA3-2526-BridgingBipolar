"use client";

import { useRef, useState } from "react";
import { Language } from "../lib/i18n";

type SpeechRecognitionType = typeof window extends { webkitSpeechRecognition: infer T } ? T : any;

export function useSpeech(language: Language) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);

  const start = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === "ar" ? "ar" : language === "fr" ? "fr-FR" : "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { listening, transcript, start, stop, setTranscript };
}
