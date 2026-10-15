"use client";

/**
 * Client store barrel (CONTRACT §4.4). Client components only.
 *
 *   import { useDemoStore, useHydrated, StoreBootstrap } from "@/lib/store";
 *   import { useGroupMessages, useTodayStats, useNow } from "@/lib/store/selectors";
 *
 * Named re-exports only — `export *` is not allowed in a "use client" module.
 */
export {
  useDemoStore,
  sanitizeBehavior,
  STORE_KEY,
  STORE_VERSION,
  MAX_AGGREGATE_SECONDS,
  MAX_REPLY_DELAY_MS,
  type DemoState,
  type PendingEntry,
  type StoreStatusEntry,
} from "./store";
export { StoreBootstrap, bootstrapStore, useHydrated } from "./bootstrap";
export { bufferKey, secondsUntil } from "./aggregator";
export type { PersistedDemoState } from "./storage";
export type { SettingsParseResult, SettingsSection } from "./settingsSchema";
