"use client";

import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

export default function SettingsPrivacyPage() {
  const { language } = useLanguage();
  const t = uiText[language].privacyPage;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
        <p className="text-sm text-textSecondary">{t.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary">{t.export}</Button>
        <Button variant="ghost" className="text-red-500">
          {t.delete}
        </Button>
      </div>
    </Card>
  );
}
