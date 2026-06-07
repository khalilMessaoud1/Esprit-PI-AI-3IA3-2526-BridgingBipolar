"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthLayout from "../../components/AuthLayout";
import Input from "../../components/Input";
import Button from "../../components/Button";
import FileUploadInput from "../../components/FileUploadInput";
import { useAuth, type UserRole, type AuthUser } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { postAuthPath } from "../../lib/authPaths";
import { apiFetch } from "../../lib/api";
import { uiText } from "../../lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

export default function SignupPage() {
  const router = useRouter();
  const { signup, setUser } = useAuth();
  const { language } = useLanguage();
  const lang = language === "fr" || language === "ar" ? language : "en";
  const t = uiText[lang].auth;
  const fu = uiText[lang].fileUpload;
  const signupCopy = uiText[lang].signupPage ?? uiText.en.signupPage;
  const roleOptions: { value: UserRole; label: string; hint: string }[] = [
    { value: "PATIENT", label: t.rolePatient, hint: t.rolePatientHint },
    { value: "DOCTOR", label: t.roleDoctor, hint: t.roleDoctorHint },
    { value: "RELATIVE", label: t.roleRelative, hint: t.roleRelativeHint }
  ];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [supervisorPhone, setSupervisorPhone] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [patientCodeError, setPatientCodeError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("PATIENT");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      if (!name || !email || !password || !birthDate) {
        setError(t.signupMissing);
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
      if (role === "PATIENT" && !acceptedTerms) {
        setError(signupCopy.termsRequired);
        return;
      }
      const rawPhone = supervisorPhone.replace(/\s+/g, "").trim();
      if (role === "PATIENT" && !rawPhone) {
        setError("Emergency supervisor phone is required for patient accounts.");
        return;
      }
      if (rawPhone && !/^(\+216\d{8,14}|\d{8})$/.test(rawPhone)) {
        setError("Supervisor phone must be 8 digits (Tunisia), or +216 followed by 8 digits.");
        return;
      }
      // PATIENT or RELATIVE: validate code before creating account
      // Uses /auth/find-by-code which is public (no auth required)
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";
      const validateCode = async (code: string, forRole: "PATIENT" | "DOCTOR") => {
        const res = await fetch(`${API_BASE}/auth/find-by-code?code=${encodeURIComponent(code)}&role=${forRole}`);
        if (!res.ok) return null;
        return res.json() as Promise<{ id: string; name: string }>;
      };

      if (role === "RELATIVE") {
        const trimmedCode = patientCode.trim().toUpperCase();
        if (!trimmedCode) {
          setPatientCodeError(lang === "fr" ? "Le code patient est requis pour un compte proche." : lang === "ar" ? "رمز المريض مطلوب لحساب القريب." : "Patient code is required for a relative account.");
          return;
        }
        if (!/^BB-[0-9A-F]{8}$/.test(trimmedCode)) {
          setPatientCodeError(lang === "fr" ? "Format invalide. Le code doit être du type BB-XXXXXXXX." : "Invalid format. Code must be BB-XXXXXXXX.");
          return;
        }
        setPatientCodeError(null);
        const found = await validateCode(trimmedCode, "PATIENT");
        if (!found) {
          setPatientCodeError(lang === "fr" ? "Code introuvable. Vérifiez le code avec votre proche." : "Code not found. Check the code with your relative.");
          return;
        }
      }

      if (role === "PATIENT" && patientCode.trim()) {
        const trimmedCode = patientCode.trim().toUpperCase();
        if (!/^BB-[0-9A-F]{8}$/.test(trimmedCode)) {
          setPatientCodeError(lang === "fr" ? "Format invalide. Le code médecin doit être du type BB-XXXXXXXX." : "Invalid format. Doctor code must be BB-XXXXXXXX.");
          return;
        }
        const found = await validateCode(trimmedCode, "DOCTOR");
        if (!found) {
          setPatientCodeError(lang === "fr" ? "Code médecin introuvable. Vérifiez le code avec votre médecin." : "Doctor code not found. Check the code with your doctor.");
          return;
        }
      }

      setSubmitting(true);
      setError(null);

      const linkedCode = patientCode.trim().toUpperCase() || undefined;
      let nextUser = await signup(name, email, password, birthDate, role, rawPhone || undefined, linkedCode);

      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        const token = localStorage.getItem("bb_token");
        const uploadResponse = await fetch(`${API_URL}/upload/file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        if (!uploadResponse.ok) {
          const text = await uploadResponse.text();
          throw new Error(text || "Photo upload failed");
        }
        const { url } = (await uploadResponse.json()) as { url: string };
        const patched = await apiFetch<{ user: AuthUser }>("/user/update", {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl: url })
        });
        if (patched.user) {
          localStorage.setItem("bb_user", JSON.stringify(patched.user));
          setUser(patched.user);
          nextUser = patched.user;
        }
      }

      router.push(postAuthPath(nextUser));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const supervisorLabel = lang === "fr"
    ? "Téléphone du contact d'urgence (Tunisie)"
    : lang === "ar"
    ? "هاتف جهة الاتصال الطارئة (تونس)"
    : "Emergency contact phone (Tunisia)";
  const supervisorHint = lang === "fr"
    ? "Indicatif +216 ajouté automatiquement."
    : lang === "ar"
    ? "يُضاف رمز الدولة +216 تلقائيًا."
    : "Country code +216 is added automatically.";

  return (
    <AuthLayout title={t.signupTitle}>
      <div className="space-y-2">
        <p className="text-xs font-medium text-textSecondary">{t.rolePrompt}</p>
        <div className="grid gap-2">
          {roleOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                role === opt.value ? "border-primary bg-primary/5" : "border-black/10 hover:border-primary/40"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={role === opt.value}
                onChange={() => {
                  setRole(opt.value);
                  if (opt.value !== "PATIENT") setAcceptedTerms(false);
                }}
                className="accent-primary"
              />
              <span className="font-medium text-textPrimary">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
      <FileUploadInput
        label={signupCopy.photoOptional}
        deferred
        onDeferredFile={(file) => setAvatarFile(file)}
        accept=".png,.jpg,.jpeg,.gif"
        strings={fu}
      />
      <Input label={t.nameLabel} value={name} onChange={(event) => setName(event.target.value)} />
      <Input label={t.emailLabel} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      {role === "PATIENT" && (
        <>
          <Input
            label={supervisorLabel}
            type="tel"
            value={supervisorPhone}
            onChange={(event) => setSupervisorPhone(event.target.value)}
            placeholder="12345678"
          />
          <p className="text-xs text-textSecondary">{supervisorHint}</p>
        </>
      )}
      {role === "PATIENT" && (
        <div className="space-y-1">
          <Input
            label={lang === "fr" ? "Code de votre médecin (optionnel)" : lang === "ar" ? "رمز طبيبك (اختياري)" : "Your doctor's code (optional)"}
            type="text"
            value={patientCode}
            onChange={(e) => { setPatientCode(e.target.value.toUpperCase()); setPatientCodeError(null); }}
            placeholder="BB-XXXXXXXX"
          />
          <p className="text-xs text-textSecondary">
            {lang === "fr"
              ? "Demandez ce code à votre médecin — il se trouve dans ses Paramètres → Profil. Vous pouvez le laisser vide et l'ajouter plus tard."
              : lang === "ar"
              ? "اطلب هذا الرمز من طبيبك — يجده في الإعدادات ← الملف الشخصي."
              : "Ask your doctor for this code — they can find it in Settings → Profile. You can leave it empty and add it later."}
          </p>
          {patientCodeError && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{patientCodeError}</p>
          )}
        </div>
      )}
      {role === "RELATIVE" && (
        <div className="space-y-1">
          <Input
            label={lang === "fr" ? "Code patient de votre proche" : lang === "ar" ? "رمز مريضك" : "Your relative's patient code"}
            type="text"
            value={patientCode}
            onChange={(e) => { setPatientCode(e.target.value.toUpperCase()); setPatientCodeError(null); }}
            placeholder="BB-XXXXXXXX"
          />
          <p className="text-xs text-textSecondary">
            {lang === "fr"
              ? "Demandez ce code à votre proche — il se trouve dans ses Paramètres → Profil."
              : lang === "ar"
              ? "اطلب هذا الرمز من قريبك — يجده في الإعدادات ← الملف الشخصي."
              : "Ask your relative for this code — they can find it in Settings → Profile."}
          </p>
          {patientCodeError && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{patientCodeError}</p>
          )}
        </div>
      )}
      <Input
        label={t.dobLabel}
        type="date"
        value={birthDate}
        onChange={(event) => setBirthDate(event.target.value)}
        max={new Date().toISOString().slice(0, 10)}
      />
      <Input
        label={t.passwordLabel}
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
      {role === "PATIENT" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 text-sm dark:border-slate-600 dark:bg-slate-900/40">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="leading-snug text-textPrimary dark:text-slate-200">
            {signupCopy.acceptTermsPrefix}{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-90 dark:text-sky-400"
            >
              {signupCopy.termsLink}
            </Link>
          </span>
        </label>
      )}
      <div className="text-xs text-textSecondary">
        {t.alreadyHave}{" "}
        <Link href="/login" className="text-primary">
          {t.loginButton}
        </Link>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={handleSubmit} disabled={submitting || (role === "PATIENT" && !acceptedTerms)}>
        {submitting ? t.signupSubmitting : t.signupButton}
      </Button>
    </AuthLayout>
  );
}
