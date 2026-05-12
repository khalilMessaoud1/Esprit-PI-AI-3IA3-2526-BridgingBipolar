"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthLayout from "../../components/AuthLayout";
import Input from "../../components/Input";
import Button from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { postAuthPath } from "../../lib/authPaths";
import { uiText } from "../../lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      if (!email || !password) {
        setError(t.loginMissing);
        return;
      }
      const user = await login(email, password);
      router.push(postAuthPath(user));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AuthLayout title={t.loginTitle} subtitle={t.loginSubtitle}>
      <Input label={t.emailLabel} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input
        label={t.passwordLabel}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="flex items-center justify-between text-xs text-textSecondary">
        <Link href="/forgot-password" className="text-primary">
          {t.forgotPassword}
        </Link>
        <Link href="/signup" className="text-primary">
          {t.createAccount}
        </Link>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={handleSubmit}>{t.loginButton}</Button>
    </AuthLayout>
  );
}
