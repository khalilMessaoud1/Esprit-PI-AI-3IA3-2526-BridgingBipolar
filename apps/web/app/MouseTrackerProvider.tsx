"use client";

import { ReactNode } from "react";
import { MouseTrackerContext, useMouseTracker } from "../hooks/useMouseTracker";

export default function MouseTrackerProvider({ children }: { children: ReactNode }) {
  const behavior = useMouseTracker();
  return (
    <MouseTrackerContext.Provider value={behavior}>
      {children}
    </MouseTrackerContext.Provider>
  );
}
