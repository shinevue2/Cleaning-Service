/**
 * Asia/Tokyo wall-clock helpers. The engine runs in the browser (any local time zone) and on
 * Vercel (UTC), so every "what time is it at the shop" question goes through Intl with an explicit
 * time zone instead of Date#getHours().
 */
import type { BehaviorSettings } from "../types";

export const TOKYO_TIME_ZONE = "Asia/Tokyo";

export interface TokyoParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

let formatter: Intl.DateTimeFormat | null = null;

function tokyoFormatter(): Intl.DateTimeFormat {
  // Created lazily: no work at module load (keeps Next.js prerendering happy).
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TOKYO_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
  }
  return formatter;
}

/** Calendar/clock fields of `ms` as seen on a wall clock in Japan. */
export function tokyoParts(ms: number): TokyoParts {
  const parts = tokyoFormatter().formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // Some ICU builds still print "24" for midnight even with h23.
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "HH:MM" in Asia/Tokyo. */
export function formatTokyoTime(ms: number): string {
  const p = tokyoParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "YYYY-MM-DD" in Asia/Tokyo — used to decide whether two instants fall on the same business day. */
export function tokyoDateKey(ms: number): string {
  const p = tokyoParts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "2026年10月14日（水）" in Asia/Tokyo. */
export function formatTokyoDate(ms: number): string {
  const p = tokyoParts(ms);
  return `${p.year}年${p.month}月${p.day}日（${WEEKDAY_JA[p.weekday]}）`;
}

/**
 * Parses "22:00", "8:00", "0800", "22時", "22時30分" into minutes after midnight.
 * Returns null for anything that is not a valid time of day.
 */
export function parseClock(value: string): number | null {
  const v = value.normalize("NFKC").trim();
  const m = /^(\d{1,2})(?::|時)?(\d{2})?(?:分)?$/.exec(v);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return (hour * 60 + minute) % (24 * 60);
}

/**
 * True when `now` is inside the configured night window (Asia/Tokyo wall clock).
 * The window is [nightStart, nightEnd) and may wrap midnight ("22:00" → "08:00").
 * An empty, invalid or zero-length window means "no night mode".
 */
export function isNight(now: number, behavior: BehaviorSettings): boolean {
  const start = parseClock(behavior.nightStart);
  const end = parseClock(behavior.nightEnd);
  if (start === null || end === null || start === end) return false;
  const p = tokyoParts(now);
  const minutes = p.hour * 60 + p.minute;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
