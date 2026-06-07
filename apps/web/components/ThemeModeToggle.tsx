"use client";

import { useTheme } from "../hooks/useTheme";

type Props = {
  className?: string;
};

export default function ThemeModeToggle({ className = "" }: Props) {
  const { themeMode, setThemeMode } = useTheme();
  const isDark = themeMode === "dark";

  return (
    <button
      type="button"
      onClick={() => setThemeMode(isDark ? "light" : "dark")}
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-slate-800 ${className}`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="text-base" aria-hidden>
        {isDark ? "☀️" : "🌙"}
      </span>
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
