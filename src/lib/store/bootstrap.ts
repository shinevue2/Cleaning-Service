"use client";

import { useEffect } from "react";
import { STORE_KEY, useDemoStore } from "./store";

let started: Promise<void> | null = null;

/**
 * Restores the persisted demo data, seeds today's history when needed, picks up messages whose
 * analysis was interrupted by a reload, then flips `hydrated`. Safe to call more than once.
 */
export function bootstrapStore(): Promise<void> {
  if (!started) {
    started = (async () => {
      try {
        await useDemoStore.persist.rehydrate();
      } catch (error) {
        console.warn("[laundry-line-ai] 保存されたデモデータを読み込めませんでした。初期状態で開始します。", error);
      }
      const { seedIfEmpty, resumeInterrupted } = useDemoStore.getState();
      seedIfEmpty();
      resumeInterrupted();
      useDemoStore.setState({ hydrated: true });
    })();
  }
  return started;
}

/**
 * Mount once in the root layout. Renders nothing.
 * Also keeps several open tabs in sync (e.g. the simulator in one tab and the dashboard in another).
 */
export function StoreBootstrap(): null {
  useEffect(() => {
    void bootstrapStore();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORE_KEY && event.key !== null) return;
      if (!useDemoStore.getState().hydrated) return;
      void useDemoStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}

/** True after the persisted data has been restored on the client. Render a skeleton until then. */
export function useHydrated(): boolean {
  return useDemoStore((s) => s.hydrated);
}
