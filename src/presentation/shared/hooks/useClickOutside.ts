"use client";

import { useEffect, type RefObject } from "react";

/**
 * Collapse `onOutside` when a pointerdown lands outside of `ref`.
 * Only attaches listener while `active` is true.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, ref, onOutside]);
}
