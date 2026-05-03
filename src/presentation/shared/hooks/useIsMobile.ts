"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768; // px — matches Tailwind's `md`

/**
 * True when the viewport is narrower than the `md` breakpoint.
 * Initialized to `false` on the server (SSR-safe). The `useEffect` fires
 * immediately on mount so there's at most one paint before the value corrects.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
