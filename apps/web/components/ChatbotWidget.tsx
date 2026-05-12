"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "../lib/api";
import { useLanguage } from "../hooks/useLanguage";
import { useSpeech } from "../hooks/useSpeech";
import { useTts } from "../hooks/useTts";
import { uiText } from "../lib/i18n";

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const { language } = useLanguage();
  const isFr = language === "fr";
  const common = uiText[language].common;
  const { listening, transcript, start } = useSpeech(language);
  const { speak } = useTts(language);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const newMessages = [...messages, { role: "user" as const, text }];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);
    const response = await apiFetch<{ reply: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message: text })
    });
    setMessages([...newMessages, { role: "bot" as const, text: response.reply }]);
    speak(response.reply);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 w-80 overflow-hidden rounded-xl bg-[#F5F7FA] shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
        >
          <div className="flex items-center gap-3 bg-[#2C3E50] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#9B8AFB] text-xs font-semibold">
              B
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{isFr ? "Bien — compagnon IA" : "Bien — AI companion"}</p>
              <div className="flex items-center gap-2 text-[11px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6FCF97]" /> {isFr ? "Toujours la pour vous" : "Always here for you"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-[#F2C94C]/30 bg-[#FEF8EA] px-4 py-2 text-[11px] text-[#92700A]">
            <span>ℹ️</span>
            {isFr
              ? "Bien est un compagnon de soutien — pas un substitut a votre medecin"
              : "Bien is a supportive companion — not a substitute for your doctor"}
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto px-4 py-4 text-sm text-textPrimary">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex flex-col gap-1 ${message.role === "bot" ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "bot"
                      ? "border border-black/5 bg-white text-[#1F2937] rounded-bl-md"
                      : "bg-[#4A90E2] text-white rounded-br-md"
                  }`}
                >
                  {message.text}
                </div>
                <span className="text-[10px] text-[#9CA3AF]">{message.role === "bot" ? "Bien" : isFr ? "Vous" : "You"}</span>
              </div>
            ))}
            {isTyping && (
              <div className="flex w-fit items-center gap-2 rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm text-textSecondary">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#9B8AFB]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#9B8AFB] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#9B8AFB] [animation-delay:300ms]" />
              </div>
            )}
          </div>
          <div className="border-t border-black/10 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={start}
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  listening ? "bg-[#EB5757] text-white" : "bg-[#F0EDFF] text-[#9B8AFB]"
                }`}
                aria-label={common.voiceInputLabel}
              >
                🎤
              </button>
              <input
                className="w-full rounded-full border border-black/15 px-4 py-2 text-sm"
                placeholder={isFr ? "Tapez un message..." : "Type a message..."}
                value={input || transcript}
                onChange={(event) => setInput(event.target.value)}
              />
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4A90E2] text-white"
                onClick={() => sendMessage(input || transcript)}
                aria-label={isFr ? "Envoyer" : "Send"}
              >
                ➤
              </button>
            </div>
          </div>
        </motion.div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-white shadow-soft"
        aria-label={isFr ? "Chatbot" : "Chatbot"}
      >
        💬
      </button>
    </div>
  );
}
