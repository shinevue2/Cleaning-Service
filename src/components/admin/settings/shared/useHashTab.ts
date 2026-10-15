"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * Tab state kept in the URL hash (/admin/settings#behavior), so other screens can link straight to a
 * section and a reload keeps the open tab. The hash is the single source of truth: selecting a tab
 * replaces the hash (no scroll, no extra history entry) and notifies the subscribers below.
 */

const LOCAL_EVENT = "laundry:hashtab";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

const readHash = (): string => window.location.hash;
const serverHash = (): string => "";

function decode(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

export function useHashTab<T extends string>(ids: readonly T[], fallback: T): [T, (id: T) => void] {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const current = decode(hash);
  const tab = ids.find((id) => id === current) ?? fallback;

  const setTab = useCallback((id: T) => {
    try {
      // Next.js integrates with the native History API; keep its own state object.
      window.history.replaceState(window.history.state, "", `#${encodeURIComponent(id)}`);
    } catch {
      // Some embedded browsers refuse replaceState — fall back to a normal hash change.
      window.location.hash = id;
    }
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, []);

  return [tab, setTab];
}
