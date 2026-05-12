"use client";

import { Suspense } from "react";
import ForgotPasswordInner from "./ForgotPasswordInner";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

export default function ForgotPasswordPage() {
  const { language } = useLanguage();
  const common = uiText[language].common;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-textSecondary">
          {common.loading}
        </div>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
