"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { CompanionAvatarApi } from "../lib/companionAvatarScene";

type Props = {
  under16: boolean;
  /** Microphone recording — subtle “listening” pose */
  recording: boolean;
  className?: string;
};

/**
 * VRM load order (first hit wins):
 * 1) `/avatars/avatar-{under|over}16.vrm` — `apps/web/public/avatars/` (same-origin).
 * 2) `/graphrag-static/...` — Next rewrite → RAG `graphrag/static/` (where your `avatar-under16.vrm` / `avatar-over16.vrm` can live).
 *
 * Which file is used is driven by the parent from profile **age**: under 16 → `under16`, else → `over16`
 * (see `CompanionChat` / `isUnder16`).
 */
function modelCandidatesForWeb(under16: boolean): string[] {
  const pub = "/avatars";
  const g = "/graphrag-static";
  if (under16) {
    return [
      `${pub}/avatar-under16.vrm`,
      `${g}/avatar-under16.vrm`,
      `${g}/models/avatar-under16.vrm`
    ];
  }
  return [`${pub}/avatar-over16.vrm`, `${g}/avatar-over16.vrm`, `${g}/models/avatar-over16.vrm`];
}

export default function CompanionAvatarCanvas({ under16, recording, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<CompanionAvatarApi | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    void import("../lib/companionAvatarScene").then(({ createCompanionAvatar }) => {
      if (cancelled || !canvasRef.current) return;
      apiRef.current?.dispose();
      apiRef.current = createCompanionAvatar(canvasRef.current, {
        modelCandidates: modelCandidatesForWeb(under16)
      });
    });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [under16]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.setMode(recording ? "listen" : "idle");
  }, [recording]);

  return (
    <div
      className={clsx(
        "relative h-full min-h-[200px] w-full overflow-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200/95 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900",
        className
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Companion avatar" />
    </div>
  );
}
