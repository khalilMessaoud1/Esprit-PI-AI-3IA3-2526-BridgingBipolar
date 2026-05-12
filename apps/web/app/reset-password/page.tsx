"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthLayout from "../../components/AuthLayout";
import Input from "../../components/Input";
import Button from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

function ResetPasswordForm() {
  const { resetPassword } = useAuth();
  const router = useRouter();
  const { language } = useLanguage();
  const t = uiText[language].auth;
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") || "";
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!token || !password) {
      setError(t.resetMissing);
      return;
    }
    if (password.length < 8) {
      setError(t.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }
    await resetPassword(token, password);
    router.push("/login");
  };

  return (
    <AuthLayout title={t.resetTitle} subtitle={t.resetSubtitle}>
      <Input label={t.resetTokenLabel} value={token} onChange={(event) => setToken(event.target.value)} />
      <Input
        label={t.newPasswordLabel}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Input
        label={t.confirmPasswordLabel}
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={handleSubmit}>{t.updatePassword}</Button>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
