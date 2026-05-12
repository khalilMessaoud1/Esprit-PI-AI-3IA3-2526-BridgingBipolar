"use client";

import { ReactNode } from "react";
import clsx from "clsx";
import Navbar from "./Navbar";
import ChatbotWidget from "./ChatbotWidget";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import { useMedicationReminders } from "../hooks/useMedicationReminders";

type Props = {
  children: ReactNode;
  showChatbot?: boolean;
  /** Full viewport under navbar — for immersive Companion (3D avatar + floating chat). */
  layout?: "default" | "companion";
};

export default function AppShell({ children, showChatbot = false, layout = "default" }: Props) {
  const companion = layout === "companion";
  const { user } = useAuth();
  const { language } = useLanguage();
  // Smart medication reminders — fires browser notifications at scheduled times
  useMedicationReminders(user?.role === "PATIENT" ? language : "");

  return (
    <div
      className={clsx(
        "flex flex-col bg-background",
        companion ? "h-dvh min-h-0 overflow-hidden" : "min-h-screen"
      )}
    >
      <div className="shrink-0">
        <Navbar />
      </div>
      <main
        className={clsx(
          "mx-auto w-full min-h-0",
          companion
            ? "flex flex-1 flex-col px-0 py-0"
            : "max-w-7xl px-4 py-6 sm:px-6 sm:py-8"
        )}
      >
        {children}
      </main>
      {showChatbot && <ChatbotWidget />}
    </div>
  );
}
