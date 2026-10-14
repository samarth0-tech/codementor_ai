"use client";

import { useCallback, useSyncExternalStore } from "react";
import { drafts } from "./drafts";

const listeners = new Set<() => void>();

/**
 * A string kept in localStorage. Built on useSyncExternalStore so the server render and the first
 * client render agree (both start empty), which avoids hydration mismatches.
 */
export function useDraft(key: string): [string, (value: string) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => drafts.get(key) ?? "",
    () => "",
  );

  const setValue = useCallback(
    (next: string) => {
      if (next) drafts.set(key, next);
      else drafts.remove(key);
      listeners.forEach((notify) => notify());
    },
    [key],
  );

  return [value, setValue];
}
