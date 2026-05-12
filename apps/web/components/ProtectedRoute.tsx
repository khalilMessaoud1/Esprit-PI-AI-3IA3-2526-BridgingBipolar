"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AuthUser } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { uiText } from "../lib/i18n";

type Props = {
  children: ReactNode;
  requireFirstLogin?: boolean;
};

function redirectFor(user: AuthUser, requireFirstLogin?: boolean): string | null {
  if (requireFirstLogin) {
    if (!user.firstLogin || user.role !== "PATIENT") {
      return user.role === "DOCTOR" ? "/doctor" : "/dashboard";
    }
    return null;
  }
  if (user.firstLogin && user.role === "PATIENT") {
    return "/onboarding";
  }
  return null;
}

export default function ProtectedRoute({ children, requireFirstLogin }: Props) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const common = uiText[language].common;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const path = redirectFor(user, requireFirstLogin);
    if (path) router.replace(path);
  }, [loading, user, router, requireFirstLogin]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background px-6 text-sm text-textSecondary">
        {common.loading}
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const path = redirectFor(user, requireFirstLogin);
  if (path) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background px-6 text-sm text-textSecondary">
        {common.redirecting}
      </div>
    );
  }

  return <>{children}</>;
}
