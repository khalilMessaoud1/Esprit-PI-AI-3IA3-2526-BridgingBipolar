"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { FontFamilyPreset } from "../lib/fontOptions";
import { fontStackForPreset } from "../lib/fontOptions";

export type ThemeMode = "light" | "dark";
export type ColorblindMode = "normal" | "deuteranopia" | "protanopia" | "tritanopia";
export type FontSizePreset = "small" | "normal" | "large" | "extra-large";

interface ThemeContextType {
  themeMode: ThemeMode;
  colorblindMode: ColorblindMode;
  fontSizePreset: FontSizePreset;
  fontFamily: FontFamilyPreset;
  setThemeMode: (mode: ThemeMode) => void;
  setColorblindMode: (mode: ColorblindMode) => void;
  setFontSizePreset: (preset: FontSizePreset) => void;
  setFontFamily: (preset: FontFamilyPreset) => void;
  brightness: number;
  setBrightness: (value: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyThemeToDom(
  themeMode: ThemeMode,
  colorblindMode: ColorblindMode,
  fontSizePreset: FontSizePreset,
  fontFamily: FontFamilyPreset
) {
  const root = document.documentElement;
  if (themeMode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.setAttribute("data-colorblind", colorblindMode);
  root.setAttribute("data-font-size", fontSizePreset);
  root.setAttribute("data-font-family", fontFamily);
  root.style.setProperty("--app-font-family", fontStackForPreset(fontFamily));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>("normal");
  const [fontSizePreset, setFontSizePreset] = useState<FontSizePreset>("normal");
  const [fontFamily, setFontFamily] = useState<FontFamilyPreset>("manrope");
  const [brightness, setBrightness] = useState(100);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("bb_theme") as ThemeMode | null;
    const savedColorblind = localStorage.getItem("bb_colorblind") as ColorblindMode | null;
    const savedFontSize = localStorage.getItem("bb_font_size") as FontSizePreset | null;
    const savedFontFamily = localStorage.getItem("bb_font_family") as FontFamilyPreset | null;
    const savedBrightness = localStorage.getItem("bb_brightness");

    if (savedTheme === "light" || savedTheme === "dark") setThemeMode(savedTheme);
    if (savedColorblind) setColorblindMode(savedColorblind);
    if (savedFontSize) setFontSizePreset(savedFontSize);
    if (savedFontFamily) setFontFamily(savedFontFamily);
    if (savedBrightness) {
      const n = Number(savedBrightness);
      if (!Number.isNaN(n)) setBrightness(Math.min(100, Math.max(60, n)));
    }

    applyThemeToDom(
      savedTheme === "dark" ? "dark" : "light",
      savedColorblind || "normal",
      savedFontSize || "normal",
      savedFontFamily || "manrope"
    );

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    applyThemeToDom(themeMode, colorblindMode, fontSizePreset, fontFamily);

    localStorage.setItem("bb_theme", themeMode);
    localStorage.setItem("bb_colorblind", colorblindMode);
    localStorage.setItem("bb_font_size", fontSizePreset);
    localStorage.setItem("bb_font_family", fontFamily);
    localStorage.setItem("bb_brightness", String(brightness));

    window.dispatchEvent(
      new CustomEvent("bb-theme-changed", {
        detail: { themeMode, colorblindMode, fontSizePreset, fontFamily, brightness },
      })
    );
    window.dispatchEvent(new CustomEvent("bb-brightness", { detail: brightness }));
  }, [themeMode, colorblindMode, fontSizePreset, fontFamily, brightness, mounted]);

  const value: ThemeContextType = {
    themeMode,
    colorblindMode,
    fontSizePreset,
    fontFamily,
    setThemeMode,
    setColorblindMode,
    setFontSizePreset,
    setFontFamily,
    brightness,
    setBrightness,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
