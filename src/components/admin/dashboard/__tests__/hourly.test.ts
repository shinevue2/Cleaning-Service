import { describe, expect, it } from "vitest";
import type { AnalysisRecord } from "@/lib/types";
import { MIN_HOURS, buildHourlySeries, niceCeiling } from "../hourly";

const JST = 9 * 3600_000;
/** epoch ms of 2026-10-14 hh:mm in Asia/Tokyo */
const at = (hh: number, mm = 0) => Date.UTC(2026, 9, 14, hh, mm) - JST;

function rec(createdAt: number, forwarded = false): AnalysisRecord {
  return {
    id: `r${createdAt}`,
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    messageIds: [],
    combinedText: "",
    photoCount: 0,
    analysis: {} as AnalysisRecord["analysis"],
    plan: {
      reply: null,
      forward: forwarded ? { urgency: "attention", title: "t", body: "b" } : null,
      createIssue: forwarded,
      notes: [],
    },
    createdAt,
  };
}

describe("niceCeiling", () => {
  it("rounds up to readable axis maxima", () => {
    expect(niceCeiling(0)).toBe(2);
    expect(niceCeiling(1)).toBe(2);
    expect(niceCeiling(3)).toBe(4);
    expect(niceCeiling(7)).toBe(8);
    expect(niceCeiling(10)).toBe(10);
    expect(niceCeiling(11)).toBe(20);
    expect(niceCeiling(33)).toBe(40);
    expect(niceCeiling(45)).toBe(50);
    expect(niceCeiling(101)).toBe(200);
  });
});

describe("buildHourlySeries", () => {
  it("splits today's reports into automatic and forwarded per Tokyo hour", () => {
    const records = [rec(at(9, 10)), rec(at(9, 40), true), rec(at(9, 59)), rec(at(13, 5), true)];
    const s = buildHourlySeries(records, at(15, 30));
    const nine = s.buckets.find((b) => b.hour === 9);
    expect(nine).toMatchObject({ auto: 2, forwarded: 1, total: 3, future: false });
    expect(s.total).toBe(4);
    expect(s.peak?.hour).toBe(9);
    expect(s.max).toBe(4);
    expect(s.currentHour).toBe(15);
  });

  it("ignores other days and shows at least MIN_HOURS consecutive hours from business start", () => {
    const yesterday = at(10) - 24 * 3600_000;
    const s = buildHourlySeries([rec(yesterday), rec(at(10))], at(11));
    expect(s.total).toBe(1);
    expect(s.buckets).toHaveLength(MIN_HOURS);
    expect(s.buckets[0].hour).toBe(8);
    expect(s.buckets.at(-1)?.hour).toBe(19);
    expect(s.buckets.find((b) => b.hour === 12)?.future).toBe(true);
  });

  it("starts earlier for night activity and stays within the day", () => {
    const s = buildHourlySeries([rec(at(2))], at(3));
    expect(s.buckets[0].hour).toBe(2);
    expect(s.buckets).toHaveLength(MIN_HOURS);
    const late = buildHourlySeries([rec(at(7)), rec(at(23, 10))], at(23, 30));
    expect(late.buckets[0].hour).toBe(7);
    expect(late.buckets.at(-1)?.hour).toBe(23);
  });

  it("handles an empty day", () => {
    const s = buildHourlySeries([], at(10));
    expect(s.total).toBe(0);
    expect(s.peak).toBeUndefined();
    expect(s.max).toBe(2);
  });
});
