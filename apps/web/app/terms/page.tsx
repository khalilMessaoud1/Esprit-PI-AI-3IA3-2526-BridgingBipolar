"use client";

import Link from "next/link";
import { useLanguage } from "../../hooks/useLanguage";
import { termsContent } from "../../lib/termsContent";

export default function TermsPage() {
  const { language } = useLanguage();
  const lang = language === "fr" || language === "ar" ? language : "en";
  const t = termsContent[lang];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-emerald-50 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/signup"
          className="mb-6 inline-block text-sm font-medium text-primary hover:underline dark:text-sky-400"
        >
          {t.backLabel}
        </Link>

        <article className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/95">
          <header className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-600">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-300">
              BridgingBipolar
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{t.pageTitle}</h1>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t.lastUpdated}</p>
          </header>

          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{t.intro}</p>

          <div className="my-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t.mustRead}</p>
          </div>

          <div className="space-y-8">
            {t.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{section.title}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
