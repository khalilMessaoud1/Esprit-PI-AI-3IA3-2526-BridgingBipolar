"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Questionnaire from "../../components/Questionnaire";
import ProtectedRoute from "../../components/ProtectedRoute";
import { hdrsQuestions, ymrsQuestions } from "../../lib/assessments";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { uiText } from "../../lib/i18n";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].assessments;
  const [step, setStep] = useState<"YMRS" | "HDRS">("HDRS");
  const [hdrsScore, setHdrsScore] = useState<number | null>(null);

  const handleComplete = async (type: "YMRS" | "HDRS", answers: Record<string, number>, score: number) => {
    await apiFetch("/assessment", {
      method: "POST",
      body: JSON.stringify({ type, answers, score })
    });

    if (type === "HDRS") {
      setHdrsScore(score);
      setStep("YMRS");
      return;
    }

    await apiFetch("/user/first-login", {
      method: "PATCH",
      body: JSON.stringify({ firstLogin: false })
    });

    if (user) {
      const updated = { ...user, firstLogin: false };
      localStorage.setItem("bb_user", JSON.stringify(updated));
      setUser(updated);
      const unstableAtSignup = (hdrsScore ?? 0) > 8 || score > 12;
      localStorage.setItem(`bb_signup_unstable_${user.id}`, unstableAtSignup ? "1" : "0");
    }

    router.push("/dashboard");
  };

  return (
    <ProtectedRoute requireFirstLogin>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {step === "HDRS" ? (
          <Questionnaire
            key="hdrs"
            title={t.hdrsTitle}
            questions={hdrsQuestions}
            onComplete={(answers, score) => handleComplete("HDRS", answers, score)}
          />
        ) : (
          <Questionnaire
            key="ymrs"
            title={t.ymrsTitle}
            questions={ymrsQuestions}
            onComplete={(answers, score) => handleComplete("YMRS", answers, score)}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
