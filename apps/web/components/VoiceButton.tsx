"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { useLanguage } from "../hooks/useLanguage";
import { uiText } from "../lib/i18n";

type Props = {
  active?: boolean;
  onClick: () => void;
};

export default function VoiceButton({ active, onClick }: Props) {
  const { language } = useLanguage();
  const label = uiText[language].common.voiceInputLabel;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex h-10 w-10 items-center justify-center rounded-full border",
        active ? "border-primary bg-secondary" : "border-slate-200 bg-white"
      )}
      aria-label={label}
      type="button"
    >
      <motion.span
        animate={active ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        transition={{ duration: 1, repeat: active ? Infinity : 0 }}
        className="text-lg"
      >
        🎤
      </motion.span>
    </button>
  );
}
