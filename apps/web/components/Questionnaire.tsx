"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { AssessmentQuestion } from "../lib/assessments";
import { useLanguage } from "../hooks/useLanguage";
import { useTts } from "../hooks/useTts";
import { useSpeech } from "../hooks/useSpeech";
import { uiText } from "../lib/i18n";

type Props = {
  title: string;
  questions: AssessmentQuestion[];
  onComplete: (answers: Record<string, number>, score: number) => void;
};

// Derive a short scale label from the title prop
function extractScaleName(title: string): string {
  if (/YMRS/i.test(title)) return "YMRS";
  if (/HDRS|HAMD|Hamilton/i.test(title)) return "HDRS";
  if (/MADRS/i.test(title)) return "MADRS";
  if (/ASRM/i.test(title)) return "ASRM";
  if (/PHQ/i.test(title)) return "PHQ-9";
  return title;
}

const SCALE_COLORS: Record<string, { dot: string; badge: string; bar: string; text: string }> = {
  YMRS:  { dot: "bg-amber-500",  badge: "bg-amber-50 text-amber-800 border-amber-200",  bar: "#f59e0b", text: "text-amber-700" },
  HDRS:  { dot: "bg-violet-500", badge: "bg-violet-50 text-violet-800 border-violet-200", bar: "#8b5cf6", text: "text-violet-700" },
  MADRS: { dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-800 border-blue-200",    bar: "#3b82f6", text: "text-blue-700" },
  ASRM:  { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-800 border-orange-200", bar: "#f97316", text: "text-orange-700" },
  "PHQ-9": { dot: "bg-teal-500", badge: "bg-teal-50 text-teal-800 border-teal-200",   bar: "#14b8a6", text: "text-teal-700" },
};
const DEFAULT_COLOR = { dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-800 border-indigo-200", bar: "#6366f1", text: "text-indigo-700" };

export default function Questionnaire({ title, questions, onComplete }: Props) {
  const { language } = useLanguage();
  const t = uiText[language];
  const { speak, stop } = useTts(language);
  const { listening, transcript, start, stop: stopListening, setTranscript } = useSpeech(language);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const firstRender = useRef(true);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReadTimer = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
  }, []);

  const haltAudio = useCallback(() => {
    stop();
    stopListening();
    clearReadTimer();
    setIsReading(false);
  }, [stop, stopListening, clearReadTimer]);

  const scaleName = extractScaleName(title);
  const scaleColor = SCALE_COLORS[scaleName] ?? DEFAULT_COLOR;

  const question = questions[index];
  const score = useMemo(
    () => Object.values(answers).reduce((total, value) => total + value, 0),
    [answers]
  );

  const handleSelect = useCallback((value: number) => {
    haltAudio();
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    setError("");
  }, [question?.id, haltAudio]);

  const handleNext = () => {
    if (answers[question.id] === undefined) {
      setError(t.common.answerRequired);
      return;
    }
    haltAudio();
    setError("");
    if (index < questions.length - 1) {
      setIndex(index + 1);
      setTranscript("");
    } else {
      onComplete(answers, score);
    }
  };

  const handleBack = () => {
    haltAudio();
    if (index > 0) setIndex(index - 1);
  };

  const handleRead = useCallback(() => {
    if (!question) return;
    clearReadTimer();
    stop();
    const text = question.text[language];
    const optionsText = question.options
      .map((opt) => `${opt.value} : ${opt.label[language]}`)
      .join(". ");
    setIsReading(true);
    speak(`${text}. ${optionsText}`);
    const ms = Math.max(3000, (`${text}. ${optionsText}`).split(" ").length * 450);
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null;
      setIsReading(false);
    }, ms);
  }, [question, language, speak, stop, clearReadTimer]);

  const handleStop = useCallback(() => {
    haltAudio();
  }, [haltAudio]);

  // Auto-read after index changes (but not on first mount)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    handleRead();
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => haltAudio(), [haltAudio]);

  const parseSpokenNumber = useCallback((text: string): number | null => {
    const normalized = text.toLowerCase().trim();
    const digitMatch = normalized.match(/\d+/);
    if (digitMatch) return Number(digitMatch[0]);
    const numMap: Record<string, number> = {
      "zéro": 0, "zero": 0,
      "un": 1, "une": 1, "one": 1,
      "deux": 2, "two": 2,
      "trois": 3, "three": 3,
      "quatre": 4, "four": 4,
      "cinq": 5, "five": 5,
      "six": 6,
      "sept": 7, "seven": 7,
      "huit": 8, "eight": 8,
      "neuf": 9, "nine": 9,
      "dix": 10, "ten": 10,
    };
    const found = Object.entries(numMap).find(([k]) => normalized.includes(k));
    return found ? found[1] : null;
  }, []);

  useEffect(() => {
    if (!transcript) return;
    const value = parseSpokenNumber(transcript);
    if (value === null) return;
    const allowed = question.options.map((opt) => opt.value);
    if (allowed.includes(value)) {
      handleSelect(value);
      // Auto-advance to next question after a short delay (same behaviour as handwriting modal)
      setTimeout(() => {
        setTranscript("");
        if (index < questions.length - 1) {
          setIndex((i) => i + 1);
        }
      }, 1000);
    }
  }, [transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.round(((index + 1) / questions.length) * 100);

  return (
    <div dir={language === "ar" ? "rtl" : "ltr"} className="space-y-5">

      {/* Progress header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${scaleColor.dot}`} />
            <div>
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${scaleColor.badge}`}>
                {scaleName}
              </span>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {index + 1} / {questions.length}
          </span>
        </div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: scaleColor.bar }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">

        {/* Question text */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            {t.questionnaire.questionLabel} {index + 1}
          </p>
          <p className="text-base font-semibold text-slate-900 leading-snug">
            {question.text[language]}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {question.options.map((option) => {
            const selected = answers[question.id] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm transition-all ${
                  selected
                    ? "border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-200/50"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40"
                }`}
              >
                <span className={`flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                  selected ? "border-indigo-500 bg-indigo-600 text-white scale-110" : "border-slate-300 bg-white text-slate-500"
                }`}>
                  {option.value}
                </span>
                <span className={selected ? "font-semibold text-indigo-900" : ""}>{option.label[language]}</span>
              </button>
            );
          })}
        </div>

        {/* ── Voice section: Read aloud + Dictate answer ────────────────── */}
        <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/60 px-4 py-4 space-y-3">
          {/* Read question aloud / Stop */}
          <div className="flex items-center gap-2">
            {isReading ? (
              <button type="button" onClick={handleStop}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 transition-colors animate-pulse">
                ⏹ {t.common.stop}
              </button>
            ) : (
              <button type="button" onClick={handleRead}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors shadow-sm">
                🔊 {t.common.readAloud}
              </button>
            )}
          </div>

          {/* Dictate answer */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={start}
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-md transition-all ${
                listening ? "bg-red-500 animate-pulse scale-110 shadow-red-200" : "bg-indigo-600 hover:bg-indigo-700 hover:scale-105"
              }`}
              title={t.common.speakPrompt}>
              🎤
            </button>
            <div className="flex-1 min-w-0">
              <strong className={`block text-sm font-semibold ${listening ? "text-red-600" : "text-slate-700"}`}>
                {listening
                  ? `${t.common.listening}…`
                  : transcript
                  ? `${t.common.heard}: "${transcript}"`
                  : (language === "fr" ? "Dicter ma réponse" : language === "ar" ? "إملاء إجابتي" : "Dictate my answer")}
              </strong>
              <span className="text-xs text-slate-400">{t.common.sayValidNumber}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={handleBack} disabled={index === 0}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors">
            ← {t.back}
          </button>
          <button type="button" onClick={handleNext}
            disabled={answers[question.id] === undefined}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors">
            {index === questions.length - 1 ? `✓ ${t.submit}` : `${t.next} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
