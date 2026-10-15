import { describe, expect, it } from "vitest";
import {
  cn,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  formatShortDate,
  formatTime,
  isSameTokyoDay,
  tokyoDateKey,
  tokyoHour,
  truncate,
} from "../format";

/** Builds an epoch for a Tokyo wall-clock time (UTC+9, no DST). */
const tokyo = (y: number, m: number, d: number, h = 0, min = 0, s = 0) =>
  Date.UTC(y, m - 1, d, h - 9, min, s);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTime / formatDateTime", () => {
  it("renders Asia/Tokyo wall-clock time regardless of the host time zone", () => {
    expect(formatTime(Date.UTC(2026, 9, 14, 0, 5))).toBe("09:05");
    expect(formatDateTime(Date.UTC(2026, 9, 14, 0, 5))).toBe("10/14 09:05");
  });

  it("uses 00 for midnight (no 24:00)", () => {
    expect(formatTime(tokyo(2026, 10, 15, 0, 0))).toBe("00:00");
    expect(formatDateTime(tokyo(2026, 10, 15, 0, 0))).toBe("10/15 00:00");
  });

  it("returns a dash for invalid input", () => {
    expect(formatTime(Number.NaN)).toBe("—");
    expect(formatDateTime(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats with year and the Japanese weekday in full-width brackets", () => {
    expect(formatDate(tokyo(2026, 10, 14, 12))).toBe("2026年10月14日（水）");
    expect(formatShortDate(tokyo(2026, 10, 14, 12))).toBe("10月14日（水）");
  });

  it("rolls over to the next Tokyo day before UTC does", () => {
    // 2026-10-14 16:00 UTC = 2026-10-15 01:00 JST
    expect(formatDate(Date.UTC(2026, 9, 14, 16))).toBe("2026年10月15日（木）");
  });
});

describe("tokyo day helpers", () => {
  it("builds a YYYY-MM-DD key in Tokyo time", () => {
    expect(tokyoDateKey(tokyo(2026, 1, 5, 23, 59))).toBe("2026-01-05");
    expect(tokyoDateKey(Number.NaN)).toBe("");
  });

  it("compares calendar days in Tokyo time", () => {
    expect(isSameTokyoDay(tokyo(2026, 10, 14, 0, 1), tokyo(2026, 10, 14, 23, 59))).toBe(true);
    expect(isSameTokyoDay(tokyo(2026, 10, 14, 23, 59), tokyo(2026, 10, 15, 0, 1))).toBe(false);
  });

  it("returns the Tokyo hour", () => {
    expect(tokyoHour(tokyo(2026, 10, 14, 7, 30))).toBe(7);
    expect(tokyoHour(tokyo(2026, 10, 14, 0, 0))).toBe(0);
  });
});

describe("formatRelative", () => {
  const now = tokyo(2026, 10, 14, 15, 0);

  it("says たった今 for the last few seconds", () => {
    expect(formatRelative(now - 10_000, now)).toBe("たった今");
    expect(formatRelative(now, now)).toBe("たった今");
  });

  it("counts minutes and hours", () => {
    expect(formatRelative(now - 50_000, now)).toBe("1分前");
    expect(formatRelative(now - 5 * MIN, now)).toBe("5分前");
    expect(formatRelative(now - 59 * MIN - 59_000, now)).toBe("59分前");
    expect(formatRelative(now - 3 * HOUR, now)).toBe("3時間前");
  });

  it("uses 昨日 + time when the instant was on the previous Tokyo day", () => {
    const earlyMorning = tokyo(2026, 10, 15, 1, 0);
    expect(formatRelative(tokyo(2026, 10, 14, 22, 0), earlyMorning)).toBe("昨日 22:00");
    expect(formatRelative(now - 25 * HOUR, now)).toBe("昨日 14:00");
  });

  it("counts days within a week, then falls back to the date", () => {
    expect(formatRelative(now - 3 * DAY, now)).toBe("3日前");
    expect(formatRelative(now - 10 * DAY, now)).toBe("10/4 15:00");
  });

  it("handles small clock skew and future instants", () => {
    expect(formatRelative(now + 30_000, now)).toBe("たった今");
    expect(formatRelative(now + 5 * MIN, now)).toBe("5分後");
    expect(formatRelative(now + 2 * HOUR, now)).toBe("10/14 17:00");
  });

  it("returns a dash for invalid input", () => {
    expect(formatRelative(Number.NaN, now)).toBe("—");
  });
});

describe("number helpers", () => {
  it("formats percentages with clamping", () => {
    expect(formatPercent(0.834)).toBe("83%");
    expect(formatPercent(0.8349, 1)).toBe("83.5%");
    expect(formatPercent(1.4)).toBe("100%");
    expect(formatPercent(-0.2)).toBe("0%");
  });

  it("formats numbers with separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("truncate", () => {
  it("keeps short text and shortens long text by code point", () => {
    expect(truncate("清掃完了", 10)).toBe("清掃完了");
    expect(truncate("駅前店の清掃が完了しました", 6)).toBe("駅前店の清…");
    expect(truncate("🙏🙏🙏🙏", 3)).toBe("🙏🙏…");
  });
});

describe("cn", () => {
  it("joins truthy classes like clsx", () => {
    const off = false as boolean;
    expect(cn("a", off && "b", ["c", { d: true, e: false }], undefined)).toBe("a c d");
  });
});
