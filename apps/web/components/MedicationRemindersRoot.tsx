"use client";

import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { useMedicationReminders } from "../hooks/useMedicationReminders";

/** Runs medication reminder polling once at app root instead of on every AppShell mount. */
export default function MedicationRemindersRoot() {
  const { user } = useAuth();
  const { language } = useLanguage();
  useMedicationReminders(user?.role === "PATIENT" ? language : "");
  return null;
}
