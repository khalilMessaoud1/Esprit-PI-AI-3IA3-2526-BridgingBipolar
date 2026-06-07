"use client";

import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { useLanguage } from "../../../hooks/useLanguage";
import {
  useTheme,
  type ThemeMode,
  type ColorblindMode,
  type FontSizePreset,
} from "../../../hooks/useTheme";
import { FONT_FAMILY_OPTIONS } from "../../../lib/fontOptions";
import type { FontFamilyPreset } from "../../../lib/fontOptions";

const optionBtn = (active: boolean) =>
  `rounded-lg border-2 px-4 py-3 text-center transition ${
    active
      ? "border-primary bg-primary/10 dark:bg-primary/20"
      : "border-slate-200 bg-background hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-primary/50"
  }`;

const listBtn = (active: boolean) =>
  `w-full rounded-lg border-2 px-4 py-3 text-left transition ${
    active
      ? "border-primary bg-primary/10 dark:bg-primary/20"
      : "border-slate-200 bg-background hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-primary/50"
  }`;

export default function SettingsAppearancePage() {
  const { language } = useLanguage();
  const {
    themeMode,
    setThemeMode,
    colorblindMode,
    setColorblindMode,
    fontSizePreset,
    setFontSizePreset,
    fontFamily,
    setFontFamily,
    brightness,
    setBrightness,
  } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isFr = language === "fr";
  const isAr = language === "ar";

  const themeModes: { value: ThemeMode; label: string; icon: string }[] = [
    { value: "light", label: isFr ? "Jour" : isAr ? "يوم" : "Light", icon: "☀️" },
    { value: "dark", label: isFr ? "Nuit" : isAr ? "ليل" : "Dark", icon: "🌙" },
  ];

  const colorblindModes: { value: ColorblindMode; label: string; description: string }[] = [
    {
      value: "normal",
      label: isFr ? "Normal" : isAr ? "عادي" : "Normal",
      description: isFr ? "Pas de filtre" : isAr ? "بلا تصفية" : "No filter",
    },
    {
      value: "deuteranopia",
      label: isFr ? "Deutéranopie" : isAr ? "دويتيرانوبيا" : "Deuteranopia",
      description: isFr ? "Faiblesse du vert" : isAr ? "ضعف أخضر" : "Green weakness",
    },
    {
      value: "protanopia",
      label: isFr ? "Protanopie" : isAr ? "بروتانوبيا" : "Protanopia",
      description: isFr ? "Faiblesse du rouge" : isAr ? "ضعف أحمر" : "Red weakness",
    },
    {
      value: "tritanopia",
      label: isFr ? "Tritanopie" : isAr ? "تريتانوبيا" : "Tritanopia",
      description: isFr ? "Faiblesse bleu-jaune" : isAr ? "ضعف أزرق-أصفر" : "Blue-yellow weakness",
    },
  ];

  const fontSizePresets: { value: FontSizePreset; label: string; preview: string }[] = [
    { value: "small", label: isFr ? "Petit" : isAr ? "صغير" : "Small", preview: "Aa" },
    { value: "normal", label: isFr ? "Normal" : isAr ? "عادي" : "Normal", preview: "Aa" },
    { value: "large", label: isFr ? "Grand" : isAr ? "كبير" : "Large", preview: "Aa" },
    {
      value: "extra-large",
      label: isFr ? "Très grand" : isAr ? "كبير جدا" : "Extra Large",
      preview: "Aa",
    },
  ];

  const langKey = isFr ? "fr" : isAr ? "ar" : "en";

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-textPrimary">
          {isFr ? "Apparence" : isAr ? "المظهر" : "Appearance"}
        </h2>
        <p className="text-sm text-textSecondary">
          {isFr
            ? "Personnalisez votre expérience visuelle sur tout le site"
            : isAr
              ? "تخصيص تجربتك البصرية على الموقع بالكامل"
              : "Customize your visual experience across the whole site"}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Mode jour/nuit" : isAr ? "وضع يوم/ليل" : "Day/Night Mode"}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {themeModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setThemeMode(mode.value)}
              className={optionBtn(themeMode === mode.value)}
            >
              <div className="text-3xl emoji">{mode.icon}</div>
              <p className="text-sm font-medium text-textPrimary">{mode.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Mode daltonien" : isAr ? "وضع عمى الألوان" : "Colorblind Mode"}
        </h3>
        <div className="space-y-2">
          {colorblindModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setColorblindMode(mode.value)}
              className={listBtn(colorblindMode === mode.value)}
            >
              <p className="font-medium text-textPrimary">{mode.label}</p>
              <p className="text-xs text-textSecondary">{mode.description}</p>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-background p-4 dark:border-slate-600 dark:bg-slate-800/60">
          <p className="mb-2 text-xs font-semibold text-textSecondary">
            {isFr ? "Aperçu des couleurs (phases)" : isAr ? "معاينة الألوان" : "Phase color preview"}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-phase-euthymic px-3 py-1.5 text-xs font-semibold text-white">Stable</span>
            <span className="rounded-lg bg-phase-depressive px-3 py-1.5 text-xs font-semibold text-white">Depression</span>
            <span className="rounded-lg bg-phase-hypomanic px-3 py-1.5 text-xs font-semibold text-slate-900">Hypomania</span>
            <span className="rounded-lg bg-phase-manic px-3 py-1.5 text-xs font-semibold text-white">Mania</span>
            <span className="rounded-lg bg-phase-mixed px-3 py-1.5 text-xs font-semibold text-white">Mixed</span>
          </div>
          <p className="mt-2 text-xs text-primary">
            {isFr ? "Couleur d'accent : " : isAr ? "لون التمييز: " : "Accent color: "}
            <span className="font-semibold">{colorblindMode}</span>
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Taille de la police" : isAr ? "حجم الخط" : "Font Size"}
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {fontSizePresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setFontSizePreset(preset.value)}
              className={`rounded-lg border-2 px-3 py-3 text-center transition ${
                fontSizePreset === preset.value
                  ? "border-primary bg-primary/10 dark:bg-primary/20"
                  : "border-slate-200 bg-background hover:border-primary/40 dark:border-slate-600 dark:bg-slate-800/60"
              }`}
            >
              <p
                className={`font-semibold text-textPrimary transition-all ${
                  preset.value === "small"
                    ? "text-lg"
                    : preset.value === "normal"
                      ? "text-xl"
                      : preset.value === "large"
                        ? "text-2xl"
                        : "text-3xl"
                }`}
              >
                {preset.preview}
              </p>
              <p className="mt-1 text-xs text-textSecondary">{preset.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Police de caractères" : isAr ? "نوع الخط" : "Font Family"}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FONT_FAMILY_OPTIONS.map((font) => (
            <button
              key={font.value}
              type="button"
              onClick={() => setFontFamily(font.value as FontFamilyPreset)}
              className={listBtn(fontFamily === font.value)}
              style={{ fontFamily: font.stack }}
            >
              <p className="font-medium text-textPrimary">{font.label[langKey]}</p>
              <p className="text-xs text-textSecondary">
                {isFr ? "Aperçu — BridgingBipolar" : isAr ? "معاينة — BridgingBipolar" : "Preview — BridgingBipolar"}
              </p>
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-xl border border-slate-200 bg-background p-4 text-base text-textPrimary dark:border-slate-600 dark:bg-slate-800/60">
          {isFr
            ? "Exemple de texte avec la police sélectionnée — BridgingBipolar vous accompagne au quotidien."
            : isAr
              ? "مثال على النص بالخط المحدد — BridgingBipolar يرافقك يومياً."
              : "Sample text in your selected font — BridgingBipolar supports you every day."}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Luminosité" : isAr ? "السطوع" : "Brightness"}
        </h3>
        <div className="rounded-xl border border-slate-200 bg-background p-4 dark:border-slate-600 dark:bg-slate-800/60">
          <input
            type="range"
            min={60}
            max={100}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="mt-3 text-sm text-textSecondary">
            {isFr ? "Luminosité : " : isAr ? "السطوع: " : "Brightness: "}
            <span className="font-semibold text-textPrimary">{brightness}%</span>
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-textPrimary">
          {isFr ? "Aperçu des emojis" : isAr ? "معاينة الرموز التعبيرية" : "Emoji Preview"}
        </h3>
        <div className="rounded-xl border border-slate-200 bg-background p-4 dark:border-slate-600 dark:bg-slate-800/60">
          <div className="flex justify-around">
            <span className="emoji text-5xl">😞</span>
            <span className="emoji text-5xl">😐</span>
            <span className="emoji text-5xl">😄</span>
          </div>
          <p className="mt-3 text-center text-xs text-textSecondary">
            {isFr
              ? "Les emojis s'agrandissent avec la taille de police"
              : isAr
                ? "تكبر الرموز التعبيرية مع حجم الخط"
                : "Emojis scale up with font size"}
          </p>
        </div>
      </div>
    </Card>
  );
}
