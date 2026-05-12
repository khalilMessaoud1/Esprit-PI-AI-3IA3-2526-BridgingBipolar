"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { postAuthPath } from "../lib/authPaths";

const TEAM = [
  { name: "Roua ZEKRI",           role: "Project Manager",            img: "/team/roua.png" },
  { name: "Oumeima WAHADA",        role: "Communications Lead",        img: "/team/oumeima.png" },
  { name: "Khalil MESSAOUD",       role: "Machine Learning Engineer",  img: "/team/messaoud.png" },
  { name: "Youssef BOUHAMED",      role: "Application Developer",      img: "/team/youssef.png" },
  { name: "Med Khalil HAOUARI",    role: "UX/UI Designer",             img: "/team/haouari.png" },
  { name: "Med Yassine MAALEJ",    role: "Research Lead",              img: "/team/maalej.png" },
];

const FEATURES = [
  { icon: "✍️", title: "Handwriting Analysis", desc: "Motor behaviour extracted from cursive writing sessions reveals early signs of mood episode transitions." },
  { icon: "😴", title: "Sleep & Activity", desc: "Weekly sleep and activity rhythm analysis detects irregularities correlated with bipolar episodes." },
  { icon: "🎙", title: "Voice Analysis", desc: "AI model detects bipolar phase (manic / neutral / depressive) from the patient's vocal patterns in real time." },
  { icon: "🖱", title: "Digital Behaviour", desc: "Mouse movement and interaction timing passively capture agitation or hypoactivity without patient effort." },
  { icon: "📊", title: "Clinical Assessments", desc: "Structured YMRS and HDRS questionnaires with voice dictation and auto-advance — accessible from any device." },
  { icon: "💊", title: "Prescription Reading", desc: "Snap a photo of any prescription — AI extracts medication names, dosages, frequencies and reminder times automatically." },
];

const STAKEHOLDERS = [
  {
    icon: "🧑‍⚕️",
    title: "Patients",
    color: "from-indigo-500 to-violet-500",
    points: [
      "Regain a sense of control over daily life",
      "Voice-guided assessments — no typing required",
      "Smart medication reminders & appointment booking",
      "Crisis safety net with emergency contact alerts",
    ],
  },
  {
    icon: "👨‍⚕️",
    title: "Psychiatrists",
    color: "from-sky-500 to-indigo-500",
    points: [
      "Multi-modal dashboard: voice, handwriting, sleep, behaviour",
      "Objective data between consultations",
      "AI-assisted final clinical decision support",
      "30-day trend grids and longitudinal analysis",
    ],
  },
  {
    icon: "👨‍👩‍👧",
    title: "Relatives & Caregivers",
    color: "from-teal-500 to-sky-500",
    points: [
      "Simplified clinical state overview (stable / attention / critical)",
      "Immediate crisis alert when safety signal detected",
      "Read-only access — no interference with care",
      "Peace of mind through continuous passive monitoring",
    ],
  },
];

const HOW_STEPS = [
  { n: "01", title: "Passive Data Collection", desc: "The app collects voice, handwriting, mouse behaviour, and sleep data — mostly without any extra effort from the patient." },
  { n: "02", title: "Multi-Modal AI Analysis", desc: "Individual AI models per patient analyse each signal and compute a combined clinical indicator, updated continuously." },
  { n: "03", title: "Alerts & Action", desc: "Patients, psychiatrists, and authorised relatives receive targeted alerts enabling faster, evidence-based reactions." },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(postAuthPath(user));
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-white font-sans" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="BridgingBipolar" className="h-10 w-10" />
            <span className="text-lg font-bold tracking-tight text-slate-900">BridgingBipolar</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-xl px-5 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-24 text-center"
        style={{ background: "linear-gradient(160deg,#eef2ff 0%,#fdf4ff 50%,#ecfdf5 100%)" }}>
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "radial-gradient(circle at 25% 25%,#6366f1 0%,transparent 50%),radial-gradient(circle at 75% 75%,#8b5cf6 0%,transparent 50%)" }} />
        <div className="relative mx-auto max-w-4xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="BridgingBipolar" className="mx-auto mb-6 h-28 w-28 drop-shadow-xl" />
          <h1 className="mt-4 text-5xl font-extrabold leading-tight text-slate-900 sm:text-6xl">
            Bridging the gap between<br />
            <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">mental health & technology</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            BridgingBipolar is an AI-based monitoring system that improves the life of people living with bipolar disorder — and supports psychiatrists in making faster, better-informed decisions.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup"
              className="rounded-2xl px-8 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              Create your account →
            </Link>
            <Link href="/login"
              className="rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-700">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── What is BridgingBipolar ────────────────────────────────────── */}
      <section className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">What is BridgingBipolar?</h2>
          <p className="mx-auto max-w-3xl text-lg text-slate-500 leading-relaxed">
            BridgingBipolar is a comprehensive digital health platform that continuously monitors patients diagnosed with bipolar disorder. It passively collects and analyses behavioural, vocal, motor, and physiological data — providing both patients and clinicians with actionable insights between consultations.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3 text-left">
            {[
              { icon: "📡", label: "Continuous monitoring", desc: "24/7 passive data collection — no extra effort required from the patient." },
              { icon: "🤖", label: "Individual AI models", desc: "Each patient has a personalized model, continuously retrained on their own data." },
              { icon: "🔔", label: "Targeted alerts", desc: "Patients, relatives, and psychiatrists are alerted when concerning signals emerge." },
            ].map(item => (
              <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <span className="text-3xl">{item.icon}</span>
                <p className="mt-3 font-bold text-slate-900">{item.label}</p>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-20" style={{ background: "linear-gradient(135deg,#f8f7ff 0%,#fdf4ff 100%)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900">Six monitoring modalities. One unified picture.</h2>
            <p className="mt-3 text-slate-500 max-w-2xl mx-auto">BridgingBipolar captures signals from every dimension of the patient's daily life — combining them into a single clinically meaningful indicator.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-200 hover:shadow-lg hover:-translate-y-0.5">
                <span className="text-4xl">{f.icon}</span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="px-6 py-20 bg-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-14">How it works</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {HOW_STEPS.map((s, i) => (
              <div key={s.n} className="relative rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-7 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-lg"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  {s.n}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                {i < 2 && (
                  <div className="absolute -right-4 top-1/2 hidden -translate-y-1/2 text-2xl text-indigo-300 sm:block">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it helps ──────────────────────────────────────────────────── */}
      <section className="px-6 py-20" style={{ background: "linear-gradient(135deg,#f0f9ff 0%,#f8f7ff 100%)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900">Built for everyone in the care circle</h2>
            <p className="mt-3 text-slate-500 max-w-xl mx-auto">Each stakeholder has a tailored experience designed around their specific needs.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {STAKEHOLDERS.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${s.color} px-6 py-5`}>
                  <span className="text-4xl">{s.icon}</span>
                  <h3 className="mt-2 text-xl font-bold text-white">{s.title}</h3>
                </div>
                <ul className="px-6 py-5 space-y-2.5">
                  {s.points.map(p => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-0.5 text-indigo-500 font-bold shrink-0">✓</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Key numbers ─────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-white">
        <div className="mx-auto max-w-4xl grid gap-8 sm:grid-cols-3 text-center">
          {[
            { value: "6", label: "Monitoring modalities", sub: "voice · handwriting · sleep · mouse · mood · assessments" },
            { value: "3", label: "User roles", sub: "patients · psychiatrists · relatives" },
            { value: "AI", label: "Powered decision support", sub: "individual models, continuously retrained" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-slate-100 bg-slate-50 px-6 py-8">
              <div className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">{s.value}</div>
              <div className="mt-2 font-bold text-slate-900 text-sm">{s.label}</div>
              <div className="mt-1 text-xs text-slate-400">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      <section className="px-6 py-20" style={{ background: "linear-gradient(135deg,#f8f7ff 0%,#ecfdf5 100%)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-600 mb-3">
              ⭐ Team Alpha
            </div>
            <h2 className="text-3xl font-bold text-slate-900">The team behind BridgingBipolar</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM.map((m, i) => (
              <div key={i}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-1">
                {/* Portrait rectangle — 3:4 aspect ratio */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "3 / 4" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.img} alt={m.name}
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    style={{ objectPosition: "center 10%" }} />
                  {/* Subtle gradient overlay at bottom for text contrast */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
                    <div className="font-bold text-white text-sm drop-shadow">{m.name}</div>
                    <div className="text-xs text-white/80 font-medium mt-0.5 drop-shadow">{m.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-center"
        style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%)" }}>
        <div className="mx-auto max-w-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="BridgingBipolar" className="mx-auto mb-6 h-16 w-16 drop-shadow-lg" />
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to start monitoring?</h2>
          <p className="text-indigo-200 text-lg mb-10">Join BridgingBipolar and give your care team the data they need to act sooner.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/signup"
              className="rounded-2xl bg-white px-8 py-3.5 text-base font-bold text-indigo-700 shadow-lg transition-all hover:scale-105">
              Create your account →
            </Link>
            <Link href="/login"
              className="rounded-2xl border-2 border-white/50 px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-white/10">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 px-6 py-10 text-center text-sm text-slate-400">
        <div className="flex items-center justify-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-6 w-6 opacity-60" />
          <span className="font-semibold text-white">BridgingBipolar</span>
        </div>
        <p className="mt-1 text-slate-500">© 2026 BridgingBipolar. Educational research project.</p>
      </footer>
    </div>
  );
}
