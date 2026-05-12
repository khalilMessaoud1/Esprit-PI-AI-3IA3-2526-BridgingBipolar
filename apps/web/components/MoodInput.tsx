"use client";

import { useState } from "react";
import Card from "./Card";
import Button from "./Button";
import VoiceButton from "./VoiceButton";
import { useSpeech } from "../hooks/useSpeech";
import { useLanguage } from "../hooks/useLanguage";
import { uiText } from "../lib/i18n";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export default function MoodInput({ onSaved }: { onSaved?: (moodLevel: number) => void } = {}) {
  const { user } = useAuth();
  const readOnly = user?.role === "RELATIVE";
  const { language } = useLanguage();
  const t = uiText[language].mood;
  const { listening, transcript, start } = useSpeech(language);
  const [moodLevel, setMoodLevel] = useState(0);
  const [note, setNote] = useState("");

  const moodLevels = [
    { value: -2, label: t.levels["-2"], emoji: "😞" },
    { value: -1, label: t.levels["-1"], emoji: "😕" },
    { value: 0, label: t.levels["0"], emoji: "😐" },
    { value: 1, label: t.levels["1"], emoji: "🙂" },
    { value: 2, label: t.levels["2"], emoji: "😄" }
  ];

  const handleSubmit = async () => {
    if (readOnly) return;
    await apiFetch("/mood", {
      method: "POST",
      body: JSON.stringify({ moodLevel, note, voiceUrl: null })
    });
    setNote("");
    onSaved?.(moodLevel);
  };

  return (
    <Card className={`space-y-4 ${readOnly ? "opacity-90" : ""}`}>
      {readOnly && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t.readOnlyNotice}
        </p>
      )}
      <div>
        <h3 className="text-base font-semibold text-textPrimary">{t.title}</h3>
        <p className="text-sm text-textSecondary">{t.prompt}</p>
      </div>
      <p className="text-xs text-textSecondary">{t.scaleHint}</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {moodLevels.map((level) => (
          <button
            key={level.value}
            type="button"
            disabled={readOnly}
            onClick={() => setMoodLevel(level.value)}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs ${
              moodLevel === level.value ? "border-primary bg-secondary" : "border-slate-200"
            } ${readOnly ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <span className="text-base" aria-hidden>{level.emoji}</span>
            <span className="text-sm font-semibold">{level.value}</span>
            <span className="text-[10px] text-textSecondary text-center">{level.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <textarea
          disabled={readOnly}
          className="min-h-[80px] w-full rounded-xl border border-slate-200 p-3 text-sm text-textPrimary disabled:bg-slate-50"
          placeholder={t.notePlaceholder}
          value={note || transcript}
          onChange={(event) => setNote(event.target.value)}
        />
        <VoiceButton active={listening} onClick={readOnly ? () => {} : start} />
      </div>
      <Button onClick={handleSubmit} disabled={readOnly}>
        {t.save}
      </Button>
    </Card>
  );
}
