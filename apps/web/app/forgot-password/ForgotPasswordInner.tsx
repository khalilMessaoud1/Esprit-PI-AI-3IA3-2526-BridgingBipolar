"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthLayout from "../../components/AuthLayout";
import Input from "../../components/Input";
import Button from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

export default function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const { forgotPassword } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].auth;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("email");
    if (q) setEmail(q);
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!email) {
      setStatus(t.forgotStatusMissing);
      return;
    }
    const response = await forgotPassword(email);
    setStatus(t.forgotStatusSent);
    if (response.resetToken) {
      setResetToken(response.resetToken);
    }
  };

  return (
    <AuthLayout title={t.forgotTitle} subtitle={t.forgotSubtitle}>
      <Input label={t.emailLabel} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      {status && <p className="text-sm text-textSecondary">{status}</p>}
      {resetToken && (
        <p className="rounded-lg bg-background p-3 text-xs text-textSecondary">
          {t.devTokenLabel}: {resetToken}
        </p>
      )}
      <Button onClick={handleSubmit}>{t.forgotSend}</Button>
    </AuthLayout>
  );
}
