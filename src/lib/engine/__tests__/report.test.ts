import { describe, expect, it } from "vitest";
import { buildDailyReport, REPORT_ISSUE_LIMIT, run } from "@/lib/engine";
import type { AnalysisRecord, Issue, Settings } from "@/lib/types";
import { first, input, jst, settings } from "./helpers";

const NOW = jst(2026, 10, 14, 21, 0);
const HOUR = 60 * 60 * 1000;

function record(s: Settings, id: string, text: string, opts: { sender?: string; photos?: number; at: number }): AnalysisRecord {
  const inp = input(s, text, { sender: opts.sender, photos: opts.photos, now: opts.at });
  const { analysis, plan } = run(inp, s, first);
  return {
    id,
    groupId: inp.group.id,
    senderId: inp.sender.id,
    messageIds: [`${id}_m`],
    combinedText: text,
    photoCount: opts.photos ?? 0,
    analysis,
    plan,
    createdAt: opts.at,
  };
}

function issueFor(r: AnalysisRecord, patch: Partial<Issue> = {}): Issue {
  return {
    id: `i_${r.id}`,
    analysisId: r.id,
    category: r.analysis.category,
    urgency: r.analysis.urgency,
    storeId: r.analysis.extracted.storeId,
    title: r.plan.forward?.title ?? r.analysis.category,
    detail: r.combinedText,
    status: "open",
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
    ...patch,
  };
}

describe("buildDailyReport", () => {
  const s = settings();
  const records = [
    record(s, "r1", "駅前店、これから清掃に入ります", { at: NOW - 12 * HOUR }),
    record(s, "r2", "駅前店の清掃完了しました", { photos: 1, at: NOW - 11 * HOUR }),
    record(s, "r3", "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", { sender: "m_sato", photos: 1, at: NOW - 10 * HOUR }),
    record(s, "r4", "駅前店、洗濯機の下から水漏れしています", { at: NOW - 9 * HOUR }),
    record(s, "r5", "洗剤の補充はどこにありますか？", { sender: "m_suzuki", at: NOW - 8 * HOUR }),
    record(s, "r6", "本日の入電は以上です。ありがとうございました。", { sender: "m_yamamoto", at: NOW - 1 * HOUR }),
    // yesterday — must not be counted
    record(s, "r0", "南町店、清掃終わりました", { sender: "m_sato", at: NOW - 30 * HOUR }),
  ];
  const issues: Issue[] = [
    issueFor(records[2], { note: "オーナーに確認中" }),
    issueFor(records[3], { status: "in_progress" }),
  ];
  const storeStatus = {
    s_ekimae: { status: "done" as const, updatedAt: NOW - 11 * HOUR, memberId: "m_tanaka" },
    s_minami: { status: "awaiting_photo" as const, updatedAt: NOW - 30 * HOUR, memberId: "m_sato" }, // yesterday
    s_kita: { status: "cleaning" as const, updatedAt: NOW - 2 * HOUR },
  };
  const text = buildDailyReport({ records, issues, storeStatus, settings: s, now: NOW });

  it("has a dated header in Japan time", () => {
    expect(text.split("\n")[0]).toBe("📋 日次レポート｜2026年10月14日（水）");
    expect(text).toContain("21:00 時点のまとめです。");
  });

  it("lists every store's cleaning status for today", () => {
    expect(text).toContain("■ 清掃状況（完了 1／5店舗）");
    expect(text).toContain("✅ 駅前店：完了（10:00・田中さん）");
    expect(text).toContain("🧹 北口店：清掃中（19:00）");
    // yesterday's status does not count for today
    expect(text).toContain("⬜ 南町店：未着手");
    expect(text).toContain("⬜ 緑ヶ丘店：未着手");
  });

  it("counts today's messages, replies, forwards and emergencies", () => {
    expect(text).toContain("受信 6件／自動返信 6件／管理者へ転送 2件（うち緊急 1件）");
    expect(text).toContain("自動対応率 67%（よくある質問への自動回答 1件）");
    expect(text).toContain("内訳：清掃開始 1件、清掃完了 1件、放置・忘れ物 1件、質問・確認 1件、連絡事項 1件、緊急トラブル 1件");
  });

  it("lists open issues, most urgent first, without doubled alert prefixes", () => {
    expect(text).toContain("■ 対応待ちの案件（2件）");
    expect(text).toContain("1. 🚨 対応中｜駅前店 水漏れ（12:00）");
    expect(text).toContain("2. ⚠️ 未対応｜北口店 洗濯機4番 洗濯物の放置（3日間）（11:00）");
    expect(text).toContain("　メモ：オーナーに確認中");
    expect(text).not.toContain("🚨 緊急：");
  });

  it("closes with a reminder about urgent issues and a sign-off", () => {
    const lines = text.split("\n");
    expect(lines.at(-2)).toBe("緊急の案件が残っています。対応状況のご確認をお願いします。");
    expect(lines.at(-1)).toBe("本日もお疲れ様でした。明日もよろしくお願いいたします。");
  });

  it("uses corrected categories for the counts", () => {
    const corrected = records.map((r) => (r.id === "r4" ? { ...r, correctedCategory: "info" as const } : r));
    const t = buildDailyReport({ records: corrected, issues: [], storeStatus: {}, settings: s, now: NOW });
    expect(t).not.toContain("うち緊急");
  });

  it("handles a quiet day", () => {
    const t = buildDailyReport({ records: [], issues: [], storeStatus: {}, settings: s, now: NOW });
    expect(t).toContain("本日のメッセージはまだありません。");
    expect(t).toContain("ありません。すべて対応済みです👍");
    expect(t).toContain("清掃の報告がまだの店舗があります。");
  });

  it(`shows at most ${REPORT_ISSUE_LIMIT} issues`, () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      issueFor(records[2], { id: `i${i}`, title: `案件${i}`, createdAt: NOW - (30 - i) * HOUR }),
    );
    const t = buildDailyReport({ records, issues: many, storeStatus: {}, settings: s, now: NOW });
    expect(t).toContain("■ 対応待ちの案件（13件）");
    expect(t).toContain("10. ⚠️ 未対応｜案件9");
    expect(t).not.toContain("11. ");
    expect(t).toContain("…ほか3件");
    // issues from an earlier day show the date
    expect(t).toContain("案件0（10/13 15:00）");
  });
});
