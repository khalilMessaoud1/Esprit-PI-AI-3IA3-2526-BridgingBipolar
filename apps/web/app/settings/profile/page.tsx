"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Card from "../../../components/Card";
import Input from "../../../components/Input";
import FileUploadInput from "../../../components/FileUploadInput";
import Button from "../../../components/Button";
import { useAuth, type AuthUser } from "../../../hooks/useAuth";
import { useLanguage } from "../../../hooks/useLanguage";
import { uiText } from "../../../lib/i18n";
import { apiFetch } from "../../../lib/api";
import { resolveMediaUrl } from "../../../lib/mediaUrl";

function syncFromUser(user: AuthUser) {
  return {
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    age: user.age != null ? String(user.age) : "",
    bio: user.bio || ""
  };
}

export default function SettingsProfilePage() {
  const { user, setUser } = useAuth();
  const { language } = useLanguage();
  const t = uiText[language].profile;
  const fu = uiText[language].fileUpload;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const hydrate = useCallback(() => {
    if (!user) return;
    const v = syncFromUser(user);
    setName(v.name);
    setEmail(v.email);
    setAvatarUrl(v.avatarUrl);
    setAge(v.age);
    setBio(v.bio);
  }, [user]);

  useEffect(() => {
    if (!editing) hydrate();
  }, [user, editing, hydrate]);

  const startEdit = () => {
    hydrate();
    setEditing(true);
    setStatus(null);
  };

  const cancelEdit = () => {
    hydrate();
    setEditing(false);
    setStatus(null);
  };

  const saveProfile = async () => {
    const response = await apiFetch<{ user: AuthUser }>("/user/update", {
      method: "PATCH",
      body: JSON.stringify({
        name,
        email,
        avatarUrl: avatarUrl || null,
        age: age ? Number(age) : null,
        bio: bio || null
      })
    });
    if (response.user) {
      localStorage.setItem("bb_user", JSON.stringify(response.user));
      setUser(response.user);
    }
    setStatus(t.updated);
    setEditing(false);
  };

  const pwdHref = user?.email
    ? `/forgot-password?email=${encodeURIComponent(user.email)}`
    : "/forgot-password";

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-textPrimary">{t.title}</h2>
          <p className="text-sm text-textSecondary">{editing ? t.subtitle : t.viewHint}</p>
        </div>
        {!editing ? (
          <Button type="button" onClick={startEdit}>
            {t.edit}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              {t.cancel}
            </Button>
            <Button type="button" onClick={saveProfile}>
              {t.save}
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/40"
            onClick={startEdit}
          >
            <p className="text-xs font-medium text-textSecondary">{t.photo}</p>
            <div className="mt-2 flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={resolveMediaUrl(avatarUrl)}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-textSecondary">
                  —
                </div>
              )}
            </div>
          </button>
          <FieldRow label={t.name} value={name} onActivate={startEdit} />
          <FieldRow label={t.email} value={email} onActivate={startEdit} />
          <FieldRow label={t.age} value={age || "—"} onActivate={startEdit} />
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/40"
            onClick={startEdit}
          >
            <p className="text-xs font-medium text-textSecondary">{t.bio}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-textPrimary">{bio || "—"}</p>
          </button>
          <div className="pt-1">
            <Link href={pwdHref} className="text-sm text-primary underline-offset-2 hover:underline">
              {t.changePassword}
            </Link>
            <p className="mt-1 text-xs text-textSecondary">{t.changePasswordHint}</p>
          </div>
        </div>
      ) : (
        <>
          <FileUploadInput
            label={t.photo}
            preview={avatarUrl}
            onUpload={(url) => setAvatarUrl(url)}
            accept=".png,.jpg,.jpeg,.gif"
            strings={fu}
          />
          <p className="text-xs text-textSecondary">{t.photoHint}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={t.name} value={name} onChange={(event) => setName(event.target.value)} />
            <Input label={t.email} value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input label={t.age} value={age} onChange={(event) => setAge(event.target.value)} />
          </div>
          <label className="flex w-full flex-col gap-2 text-sm text-textSecondary">
            {t.bio}
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-textPrimary outline-none focus:border-primary"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <div>
            <Link href={pwdHref} className="text-sm text-primary underline-offset-2 hover:underline">
              {t.changePassword}
            </Link>
            <p className="mt-1 text-xs text-textSecondary">{t.changePasswordHint}</p>
          </div>
        </>
      )}

      {/* Unique code — shown for PATIENT and DOCTOR */}
      {(user?.role === "PATIENT" || user?.role === "DOCTOR") && (() => {
        const code = `BB-${(user.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
        const isFr = language === "fr"; const isAr = language === "ar";
        const isDoctor = user.role === "DOCTOR";
        const label = isDoctor
          ? (isFr ? "Votre code médecin" : isAr ? "رمز طبيبك" : "Your doctor code")
          : (isFr ? "Votre code patient" : isAr ? "رمز المريض" : "Your patient code");
        const hint = isDoctor
          ? (isFr ? "Partagez ce code avec vos patients lors de leur inscription." : isAr ? "شارك هذا الرمز مع مرضاك عند تسجيلهم." : "Share this code with your patients when they sign up.")
          : (isFr ? "Partagez ce code avec vos proches pour qu'ils puissent vous suivre." : isAr ? "شارك هذا الرمز مع أهلك حتى يتمكنوا من متابعتك." : "Share this code with your relatives so they can follow your status.");
        return (
          <div className={`rounded-2xl border-2 ${isDoctor ? "border-sky-200 bg-sky-50" : "border-indigo-200 bg-indigo-50"} px-5 py-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDoctor ? "text-sky-500" : "text-indigo-500"}`}>{label}</p>
                <p className={`font-mono text-2xl font-black tracking-widest ${isDoctor ? "text-sky-700" : "text-indigo-700"}`}>{code}</p>
                <p className={`text-xs mt-1 ${isDoctor ? "text-sky-500" : "text-indigo-500"}`}>{hint}</p>
              </div>
              <button type="button"
                onClick={() => navigator.clipboard?.writeText(code)}
                className={`rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition-colors ${isDoctor ? "border-sky-300 text-sky-700 hover:bg-sky-100" : "border-indigo-300 text-indigo-700 hover:bg-indigo-100"}`}>
                {isFr ? "📋 Copier" : isAr ? "📋 نسخ" : "📋 Copy"}
              </button>
            </div>
          </div>
        );
      })()}

      {status && <p className="text-sm text-textSecondary">{status}</p>}
    </Card>
  );
}

function FieldRow({
  label,
  value,
  onActivate
}: {
  label: string;
  value: string;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/40"
      onClick={onActivate}
    >
      <p className="text-xs font-medium text-textSecondary">{label}</p>
      <p className="mt-1 text-sm text-textPrimary">{value}</p>
    </button>
  );
}
