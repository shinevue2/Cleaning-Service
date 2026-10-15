/**
 * localStorage adapter for the zustand `persist` middleware.
 *
 *  - never throws (private mode, blocked storage, quota exceeded …) — the demo keeps working in memory;
 *  - never writes before the stored data has been read once (a component updating the store before
 *    <StoreBootstrap/> rehydrated must not overwrite the visitor's saved demo with the empty initial state);
 *  - skips writes when nothing persisted changed (typing indicators, countdowns and unread badges are
 *    transient and would otherwise re-serialise the whole history on every tick);
 *  - when the quota is exceeded, retries with large uploaded photos replaced by a placeholder;
 *  - validates restored data so a corrupted or outdated entry can never crash the screens.
 */
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { defaultSettings } from "@/lib/seed";
import type { AnalysisRecord, ChatMessage, Delivery, Issue, Photo, Settings } from "@/lib/types";
import type { HistoryState, StoreStatusEntry } from "./pipeline";
import { parseSettings } from "./settingsSchema";

/** The part of the demo state that is written to localStorage. */
export interface PersistedDemoState extends HistoryState {
  settings: Settings;
  /** when today's sample history was generated (null = never) */
  seededAt: number | null;
  /** last time the visitor changed demo data (null = only looked around since seeding) */
  lastActivityAt: number | null;
}

export const PERSISTED_KEYS = [
  "settings",
  "messages",
  "records",
  "issues",
  "deliveries",
  "storeStatus",
  "seededAt",
  "lastActivityAt",
] as const satisfies readonly (keyof PersistedDemoState)[];

function getLocalStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    // Accessing localStorage throws a SecurityError when site data is blocked.
    return null;
  }
}

function tryWrite(storage: Storage, name: string, value: string): boolean {
  try {
    storage.setItem(name, value);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Quota fallback                                                      */
/* ------------------------------------------------------------------ */

/** Photos above this many characters (uploaded JPEGs) are dropped first when storage is full. */
const LARGE_PHOTO_CHARS = 20_000;
/** Most recent photo messages that keep their pictures at the first fallback level. */
const KEEP_RECENT_PHOTO_MESSAGES = 3;

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><rect width="400" height="300" fill="#f1f5f9"/><rect x="150" y="96" width="100" height="76" rx="10" fill="none" stroke="#94a3b8" stroke-width="6"/><circle cx="200" cy="134" r="18" fill="none" stroke="#94a3b8" stroke-width="6"/><text x="200" y="214" font-family="sans-serif" font-size="18" fill="#64748b" text-anchor="middle">保存容量の都合で省略された写真</text></svg>`;

export const PHOTO_PLACEHOLDER_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

function slimPhotos(photos: Photo[]): Photo[] {
  return photos.map((p) =>
    p.src.length > LARGE_PHOTO_CHARS ? { ...p, src: PHOTO_PLACEHOLDER_SRC, alt: `${p.alt}（保存容量の都合で省略）` } : p,
  );
}

/** Level 1: drop large photos except in the latest few photo messages. Level 2: drop them all and old chat. */
export function slimForStorage(state: PersistedDemoState, level: 1 | 2): PersistedDemoState {
  const keep = new Set<string>();
  if (level === 1) {
    for (let i = state.messages.length - 1; i >= 0 && keep.size < KEEP_RECENT_PHOTO_MESSAGES; i -= 1) {
      if (state.messages[i].photos.length > 0) keep.add(state.messages[i].id);
    }
  }
  const messages = state.messages.map((m) =>
    m.photos.length > 0 && !keep.has(m.id) ? { ...m, photos: slimPhotos(m.photos) } : m,
  );
  return { ...state, messages: level === 2 ? messages.slice(-300) : messages };
}

/* ------------------------------------------------------------------ */
/* Storage adapter                                                     */
/* ------------------------------------------------------------------ */

export function createSafeStorage(): PersistStorage<PersistedDemoState> {
  let lastState: PersistedDemoState | null = null;
  let lastJson: string | null = null;
  let hasRead = false;
  let warned = false;

  return {
    getItem(name) {
      hasRead = true;
      const storage = getLocalStorage();
      if (!storage) return null;
      try {
        const raw = storage.getItem(name);
        if (!raw) return null;
        lastJson = raw;
        lastState = null;
        return JSON.parse(raw) as StorageValue<PersistedDemoState>;
      } catch {
        return null;
      }
    },

    setItem(name, value) {
      if (!hasRead) return;
      const storage = getLocalStorage();
      if (!storage) return;
      const state = value.state;
      const previous = lastState;
      if (previous && PERSISTED_KEYS.every((key) => previous[key] === state[key])) return;
      lastState = state;

      let json: string;
      try {
        json = JSON.stringify(value);
      } catch {
        return;
      }
      if (json === lastJson) return;
      if (tryWrite(storage, name, json)) {
        lastJson = json;
        return;
      }
      for (const level of [1, 2] as const) {
        const slim = JSON.stringify({ ...value, state: slimForStorage(state, level) });
        if (tryWrite(storage, name, slim)) {
          lastJson = slim;
          return;
        }
      }
      if (!warned) {
        warned = true;
        console.warn("[laundry-line-ai] ブラウザの保存容量が不足しているため、最新のデモデータを保存できませんでした。");
      }
    },

    removeItem(name) {
      lastState = null;
      lastJson = null;
      try {
        getLocalStorage()?.removeItem(name);
      } catch {
        // ignore — nothing to clean up
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Restoring                                                           */
/* ------------------------------------------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function restoreMessage(v: unknown): ChatMessage | null {
  if (!isRecord(v) || !isString(v.id) || !isString(v.groupId) || !isString(v.senderId) || !isNumber(v.createdAt)) {
    return null;
  }
  const photos = Array.isArray(v.photos)
    ? v.photos.filter((p): p is Photo => isRecord(p) && isString(p.id) && isString(p.src)).map((p) => ({ ...p, alt: isString(p.alt) ? p.alt : "写真" }))
    : [];
  return { ...(v as unknown as ChatMessage), text: isString(v.text) ? v.text : "", photos };
}

/** The nested fields every screen reads (AI判定パネル, 判定ログ, dashboard) — anything else is optional. */
function isUsableAnalysis(a: unknown): boolean {
  return (
    isRecord(a) &&
    isString(a.category) &&
    isString(a.urgency) &&
    isNumber(a.confidence) &&
    isString(a.reasoning) &&
    Array.isArray(a.secondary) &&
    isRecord(a.extracted) &&
    Array.isArray(a.extracted.keywords)
  );
}

function isUsablePlan(p: unknown): boolean {
  return isRecord(p) && (p.reply === null || isString(p.reply)) && Array.isArray(p.notes);
}

function restoreRecord(v: unknown): AnalysisRecord | null {
  if (
    !isRecord(v) ||
    !isString(v.id) ||
    !isString(v.groupId) ||
    !isString(v.senderId) ||
    !Array.isArray(v.messageIds) ||
    !isUsableAnalysis(v.analysis) ||
    !isUsablePlan(v.plan) ||
    !isNumber(v.createdAt)
  ) {
    return null;
  }
  return { ...(v as unknown as AnalysisRecord), combinedText: isString(v.combinedText) ? v.combinedText : "" };
}

function restoreIssue(v: unknown): Issue | null {
  if (!isRecord(v) || !isString(v.id) || !isString(v.analysisId) || !isString(v.status) || !isNumber(v.createdAt)) {
    return null;
  }
  return v as unknown as Issue;
}

function restoreDelivery(v: unknown): Delivery | null {
  if (!isRecord(v) || !isString(v.id) || !isString(v.recordId) || !isNumber(v.createdAt)) return null;
  return v as unknown as Delivery;
}

function restoreList<T>(v: unknown, restore: (item: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const restored = restore(item);
    if (restored) out.push(restored);
  }
  return out;
}

function restoreStoreStatus(v: unknown): Record<string, StoreStatusEntry> {
  if (!isRecord(v)) return {};
  const out: Record<string, StoreStatusEntry> = {};
  for (const [storeId, entry] of Object.entries(v)) {
    if (isRecord(entry) && isString(entry.status) && isNumber(entry.updatedAt)) {
      out[storeId] = entry as unknown as StoreStatusEntry;
    }
  }
  return out;
}

/**
 * `merge` option of persist: overlays validated stored data on the in-memory state.
 * Transient fields (pending timers, typing, unread, hydrated) and actions always come from `current`.
 */
export function mergePersisted<T extends PersistedDemoState>(persisted: unknown, current: T): T {
  if (!isRecord(persisted)) return current;
  const parsed = isRecord(persisted.settings) ? parseSettings(persisted.settings, defaultSettings()) : null;
  return {
    ...current,
    settings: parsed?.ok ? parsed.settings : current.settings,
    messages: restoreList(persisted.messages, restoreMessage),
    records: restoreList(persisted.records, restoreRecord),
    issues: restoreList(persisted.issues, restoreIssue),
    deliveries: restoreList(persisted.deliveries, restoreDelivery),
    storeStatus: restoreStoreStatus(persisted.storeStatus),
    seededAt: isNumber(persisted.seededAt) ? persisted.seededAt : null,
    lastActivityAt: isNumber(persisted.lastActivityAt) ? persisted.lastActivityAt : null,
  };
}
