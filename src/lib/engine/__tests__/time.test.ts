import { describe, expect, it } from "vitest";
import { formatTokyoDate, formatTokyoTime, isNight, parseClock, tokyoDateKey } from "@/lib/engine";
import { DEFAULT_BEHAVIOR } from "@/lib/seed";
import type { BehaviorSettings } from "@/lib/types";
import { jst } from "./helpers";

const behavior = (nightStart: string, nightEnd: string): BehaviorSettings => ({ ...DEFAULT_BEHAVIOR, nightStart, nightEnd });

describe("isNight (Asia/Tokyo)", () => {
  const def = behavior("22:00", "08:00");

  it("handles a window that wraps midnight", () => {
    expect(isNight(jst(2026, 10, 14, 23, 30), def)).toBe(true);
    expect(isNight(jst(2026, 10, 15, 0, 0), def)).toBe(true);
    expect(isNight(jst(2026, 10, 15, 7, 59), def)).toBe(true);
    expect(isNight(jst(2026, 10, 15, 8, 0), def)).toBe(false);
    expect(isNight(jst(2026, 10, 14, 21, 59), def)).toBe(false);
    expect(isNight(jst(2026, 10, 14, 22, 0), def)).toBe(true);
  });

  it("uses Japan time, not UTC: 23:30 JST is 14:30 UTC", () => {
    const ms = Date.UTC(2026, 9, 14, 14, 30);
    expect(isNight(ms, def)).toBe(true);
    // 10:00 UTC would be night in UTC terms if the window were applied in UTC; it is 19:00 in Japan.
    expect(isNight(Date.UTC(2026, 9, 14, 10, 0), def)).toBe(false);
  });

  it("handles a window inside one day", () => {
    const lunch = behavior("12:00", "13:00");
    expect(isNight(jst(2026, 10, 14, 12, 30), lunch)).toBe(true);
    expect(isNight(jst(2026, 10, 14, 13, 0), lunch)).toBe(false);
    expect(isNight(jst(2026, 10, 14, 11, 59), lunch)).toBe(false);
  });

  it("treats an empty, invalid or zero-length window as no night mode", () => {
    expect(isNight(jst(2026, 10, 14, 23, 0), behavior("", ""))).toBe(false);
    expect(isNight(jst(2026, 10, 14, 23, 0), behavior("25:00", "08:00"))).toBe(false);
    expect(isNight(jst(2026, 10, 14, 23, 0), behavior("22:00", "22:00"))).toBe(false);
  });
});

describe("clock and date helpers", () => {
  it("parses common time notations", () => {
    expect(parseClock("22:00")).toBe(22 * 60);
    expect(parseClock("8:05")).toBe(8 * 60 + 5);
    expect(parseClock("２２：３０")).toBe(22 * 60 + 30);
    expect(parseClock("22時")).toBe(22 * 60);
    expect(parseClock("24:00")).toBe(0);
    expect(parseClock("夜")).toBeNull();
    expect(parseClock("12:60")).toBeNull();
  });

  it("formats time and date in Japan", () => {
    const ms = jst(2026, 10, 14, 9, 5);
    expect(formatTokyoTime(ms)).toBe("09:05");
    expect(formatTokyoDate(ms)).toBe("2026年10月14日（水）");
    expect(tokyoDateKey(ms)).toBe("2026-10-14");
  });

  it("switches the business day at midnight JST, not UTC", () => {
    expect(tokyoDateKey(jst(2026, 10, 14, 23, 59))).toBe("2026-10-14");
    expect(tokyoDateKey(jst(2026, 10, 15, 0, 1))).toBe("2026-10-15");
    expect(formatTokyoTime(jst(2026, 10, 15, 0, 1))).toBe("00:01");
  });
});
