"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768; // px — matches Tailwind's `md`
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getSnapshot = () => window.matchMedia(MEDIA_QUERY).matches;
const getServerSnapshot = () => false;

/**
 * True when the viewport is narrower than the `md` breakpoint.
 * Uses `useSyncExternalStore` so the browser's `matchMedia` is the single
 * source of truth — no useEffect/useState round-trip and SSR returns `false`
 * deterministically.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
