/**
 * Data for the dashboard's hourly chart (pure, no React).
 *
 * One processed report = one count (a photo and its comment sent separately count once), split into
 * "handled automatically" and "forwarded to the managers" — the same definitions as the KPI cards.
 */
import { tokyoDateKey, tokyoHour } from "@/lib/format";
import type { AnalysisRecord } from "@/lib/types";

export interface HourBucket {
  /** 0–23, Asia/Tokyo */
  hour: number;
  /** reports finished without a human (no forward) */
  auto: number;
  /** reports forwarded to the managers */
  forwarded: number;
  total: number;
  /** later than the current hour (rendered dimmed, no data yet) */
  future: boolean;
}

export interface HourlySeries {
  /** consecutive hours to display (at least `MIN_HOURS`) */
  buckets: HourBucket[];
  /** y-axis maximum (a "nice" number ≥ every bucket total) */
  max: number;
  /** busiest hour, if anything was received */
  peak?: HourBucket;
  total: number;
  currentHour: number;
}

/** The chart always shows at least half a day so a quiet morning still reads as a timeline. */
export const MIN_HOURS = 12;
/** Business hours shown even before the first report of the day. */
const DAY_START = 8;

/** Rounds up to an even, easy-to-read axis maximum: 2, 4, 6, 8, 10, 20, 40, 50, 100, 200… */
export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 2) return 2;
  if (value <= 10) return Math.ceil(value / 2) * 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 4, 5, 10]) {
    if (m * magnitude >= value) return m * magnitude;
  }
  return 10 * magnitude;
}

export function buildHourlySeries(records: readonly AnalysisRecord[], now: number): HourlySeries {
  const today = tokyoDateKey(now);
  const currentHour = tokyoHour(now);
  const all: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    auto: 0,
    forwarded: 0,
    total: 0,
    future: hour > currentHour,
  }));

  for (const r of records) {
    if (tokyoDateKey(r.createdAt) !== today) continue;
    const bucket = all[tokyoHour(r.createdAt)];
    if (r.plan.forward !== null) bucket.forwarded += 1;
    else bucket.auto += 1;
    bucket.total += 1;
  }

  const active = all.filter((b) => b.total > 0).map((b) => b.hour);
  let start = Math.min(active.length > 0 ? Math.min(...active) : currentHour, currentHour, DAY_START);
  let end = Math.max(active.length > 0 ? Math.max(...active) : currentHour, currentHour);
  if (end - start + 1 < MIN_HOURS) {
    end = Math.min(23, start + MIN_HOURS - 1);
    if (end - start + 1 < MIN_HOURS) start = Math.max(0, end - MIN_HOURS + 1);
  }

  const buckets = all.slice(start, end + 1);
  let peak: HourBucket | undefined;
  let total = 0;
  for (const b of buckets) {
    total += b.total;
    if (b.total > 0 && (!peak || b.total > peak.total)) peak = b;
  }
  return { buckets, max: niceCeiling(peak?.total ?? 0), peak, total, currentHour };
}
