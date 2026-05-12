"use client";

import { useState } from "react";
import Card from "../../../components/Card";
import Input from "../../../components/Input";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

export default function SettingsNotificationsPage() {
  const { language } = useLanguage();
  const t = uiText[language].notificationsPage;
  const [medicationReminders, setMedicationReminders] = useState(true);
  const [moodReminders, setMoodReminders] = useState(true);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
        <p className="text-sm text-textSecondary">{t.subtitle}</p>
      </div>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {t.medication}
        <input
          type="checkbox"
          checked={medicationReminders}
          onChange={() => setMedicationReminders((prev) => !prev)}
        />
      </label>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        {t.mood}
        <input type="checkbox" checked={moodReminders} onChange={() => setMoodReminders((prev) => !prev)} />
      </label>
      <Input label={t.quiet} placeholder={t.quietPh} />
    </Card>
  );
}
