/**
 * Display formatting helpers. Every date/time helper renders Asia/Tokyo wall-clock time,
 * regardless of the viewer's own time zone.
 *
 * Only call the time helpers from client code after hydration (see CONTRACT §2):
 * the server and the browser can disagree about "now", which causes hydration mismatches.
 */
import { clsx, type ClassValue } from "clsx";
import { tokyoParts as engineTokyoParts } from "./engine/time";

/** Tailwind class merging helper (thin wrapper around clsx). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export { TOKYO_TIME_ZONE as TIME_ZONE } from "./engine/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Wall-clock fields in Japan — the engine's helper, plus the weekday as 「月」〜「日」. */
function tokyoParts(ms: number) {
  const p = engineTokyoParts(ms);
  return { ...p, weekday: WEEKDAY_JA[p.weekday] ?? "" };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

const INVALID = "—";

/** "HH:MM" (24h, Asia/Tokyo). */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return INVALID;
  const p = tokyoParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "M/D HH:MM" (Asia/Tokyo). */
export function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return INVALID;
  const p = tokyoParts(ms);
  return `${p.month}/${p.day} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "YYYY年M月D日（曜）" (Asia/Tokyo), e.g. 「2026年10月14日（水）」. */
export function formatDate(ms: number): string {
  if (!Number.isFinite(ms)) return INVALID;
  const p = tokyoParts(ms);
  return `${p.year}年${p.month}月${p.day}日（${p.weekday}）`;
}

/** "M月D日（曜）" — the short form used in compact headers. */
export function formatShortDate(ms: number): string {
  if (!Number.isFinite(ms)) return INVALID;
  const p = tokyoParts(ms);
  return `${p.month}月${p.day}日（${p.weekday}）`;
}

/** Asia/Tokyo calendar day key, "YYYY-MM-DD". Handy for "today" filters. */
export function tokyoDateKey(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const p = tokyoParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** True when both instants fall on the same Asia/Tokyo calendar day. */
export function isSameTokyoDay(a: number, b: number): boolean {
  return tokyoDateKey(a) !== "" && tokyoDateKey(a) === tokyoDateKey(b);
}

/** Hour of day (0-23) in Asia/Tokyo — for hourly charts. */
export function tokyoHour(ms: number): number {
  return tokyoParts(ms).hour;
}

/** Whole Tokyo calendar days between two instants (b - a). */
function tokyoDayDiff(a: number, b: number): number {
  const pa = tokyoParts(a);
  const pb = tokyoParts(b);
  const da = Date.UTC(pa.year, pa.month - 1, pa.day);
  const db = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((db - da) / DAY);
}

/**
 * Human friendly relative time in Japanese:
 * 「たった今」「3分前」「2時間前」「昨日 18:20」「3日前」, older → "M/D HH:MM".
 * Future instants (clock skew) read as 「たった今」 within a minute, else 「N分後」.
 */
export function formatRelative(ms: number, now: number): string {
  if (!Number.isFinite(ms) || !Number.isFinite(now)) return INVALID;
  const diff = now - ms;

  if (diff < 0) {
    const ahead = -diff;
    if (ahead < MINUTE) return "たった今";
    if (ahead < HOUR) return `${Math.floor(ahead / MINUTE)}分後`;
    return formatDateTime(ms);
  }
  if (diff < 45_000) return "たった今";
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))}分前`;

  const days = tokyoDayDiff(ms, now);
  if (diff < 24 * HOUR && days === 0) return `${Math.floor(diff / HOUR)}時間前`;
  if (days <= 1) return `昨日 ${formatTime(ms)}`;
  if (days < 7) return `${days}日前`;
  return formatDateTime(ms);
}

/** 0.834 → "83%". Values are clamped to 0..1. */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return INVALID;
  const clamped = Math.min(1, Math.max(0, ratio));
  return `${(clamped * 100).toFixed(digits)}%`;
}

/** 1234 → "1,234". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return INVALID;
  return n.toLocaleString("ja-JP");
}

/** Shortens text to `max` characters (by code point) and appends 「…」. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}
