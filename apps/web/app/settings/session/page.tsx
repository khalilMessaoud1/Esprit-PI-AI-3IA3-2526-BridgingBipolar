"use client";

import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { useAuth } from "../../../hooks/useAuth";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";

export default function SettingsSessionPage() {
  const { logout } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].sessionPage;
  const logoutLabel = uiText[language].settings.logout;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
        <p className="text-sm text-textSecondary">{t.subtitle}</p>
      </div>
      <Button variant="secondary" onClick={logout}>
        {logoutLabel}
      </Button>
    </Card>
  );
}
