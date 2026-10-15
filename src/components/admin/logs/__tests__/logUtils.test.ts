import { describe, expect, it } from "vitest";
import { DEFAULT_STORES } from "@/lib/seed";
import type { AnalysisRecord, Issue, LearnedExample } from "@/lib/types";
import {
  EMPTY_FILTER,
  contentWords,
  formatPatternLines,
  generalQuestion,
  indexLearned,
  isFilterActive,
  judgementOf,
  matchesFilter,
  missingWords,
  parsePatternLines,
  patternsMatch,
  queryTerms,
  questionLine,
  suggestFaqPatterns,
} from "../logUtils";

function record(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: "rec_1",
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    messageIds: ["msg_1"],
    combinedText: "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです",
    photoCount: 1,
    analysis: {
      category: "leftover",
      secondary: [],
      urgency: "attention",
      confidence: 0.9,
      source: "ai",
      reasoning: "",
      extracted: { hasPhoto: true, keywords: ["出しっぱなし"] },
      sample: true,
    },
    plan: { reply: "ok", forward: null, createIssue: false, notes: [] },
    createdAt: 1_000,
    ...overrides,
  };
}

describe("judgementOf", () => {
  it("returns the AI judgement when nothing was corrected", () => {
    const j = judgementOf(record(), new Map());
    expect(j).toEqual({ category: "leftover", urgency: "attention", corrected: false });
  });

  it("uses the learned example's urgency after a correction", () => {
    const learned: LearnedExample = {
      id: "lex_1",
      text: "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです",
      category: "machine_error",
      urgency: "urgent",
      createdAt: 2_000,
    };
    const j = judgementOf(record({ correctedCategory: "machine_error", correctedAt: 2_000 }), indexLearned([learned]));
    expect(j.category).toBe("machine_error");
    expect(j.urgency).toBe("urgent");
    expect(j.corrected).toBe(true);
    expect(j.learned?.id).toBe("lex_1");
  });

  it("falls back to the issue, then to the category default (photo-only posts have no learned example)", () => {
    const issue = { category: "info", urgency: "normal" } as Issue;
    const photoOnly = record({ combinedText: "", correctedCategory: "info" });
    expect(judgementOf(photoOnly, new Map(), issue).urgency).toBe("normal");
    expect(judgementOf(record({ correctedCategory: "question" }), new Map()).urgency).toBe("attention");
  });

  it("always treats a corrected emergency as urgent", () => {
    const learned: LearnedExample = { id: "x", text: "テスト", category: "emergency", urgency: "normal", createdAt: 0 };
    const j = judgementOf(record({ combinedText: "テスト", correctedCategory: "emergency" }), indexLearned([learned]));
    expect(j.urgency).toBe("urgent");
  });
});

describe("filters", () => {
  const item = {
    record: record(),
    judgement: { category: "leftover" as const, urgency: "attention" as const, corrected: false },
    extra: ["佐藤", "【清掃】スタッフ連絡", "北口店"],
  };

  it("detects active filters", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, text: "  " })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, urgency: "urgent" })).toBe(true);
  });

  it("matches group, category, urgency and corrected-only", () => {
    expect(matchesFilter(item, EMPTY_FILTER, [])).toBe(true);
    expect(matchesFilter(item, { ...EMPTY_FILTER, groupId: "g_call" }, [])).toBe(false);
    expect(matchesFilter(item, { ...EMPTY_FILTER, category: "leftover" }, [])).toBe(true);
    expect(matchesFilter(item, { ...EMPTY_FILTER, category: "emergency" }, [])).toBe(false);
    expect(matchesFilter(item, { ...EMPTY_FILTER, urgency: "urgent" }, [])).toBe(false);
    expect(matchesFilter(item, { ...EMPTY_FILTER, correctedOnly: true }, [])).toBe(false);
  });

  it("searches the text and the extra fields, ignoring width, case and spaces", () => {
    expect(matchesFilter(item, EMPTY_FILTER, queryTerms("出しっぱなし"))).toBe(true);
    expect(matchesFilter(item, EMPTY_FILTER, queryTerms("佐藤　３日間"))).toBe(true);
    expect(matchesFilter(item, EMPTY_FILTER, queryTerms("水漏れ"))).toBe(false);
  });
});

describe("FAQ helpers", () => {
  it("builds a single-line question", () => {
    expect(questionLine("  洗剤の補充は\nどこですか？ ")).toBe("洗剤の補充は どこですか？");
    expect(Array.from(questionLine("あ".repeat(100), 10))).toHaveLength(10);
  });

  it("drops the store name from a suggested FAQ heading", () => {
    expect(generalQuestion("中央通り店の自販機の釣り銭切れ、どうすればいいですか？", DEFAULT_STORES)).toBe(
      "自販機の釣り銭切れ、どうすればいいですか？",
    );
    expect(generalQuestion("駅前で洗剤の場所はどこですか？", DEFAULT_STORES)).toBe("洗剤の場所はどこですか？");
    expect(generalQuestion("洗剤の補充はどこですか？", DEFAULT_STORES)).toBe("洗剤の補充はどこですか？");
  });

  it("matches FAQ words like the engine (hiragana also finds katakana)", () => {
    expect(missingWords("ゴミ出しは何曜日でしたっけ？", [["ごみ", "曜日"]])).toEqual([]);
    expect(missingWords("ゴミ出しは何曜日でしたっけ？", [["ごみ", "時間"]])).toEqual(["時間"]);
  });

  it("extracts the content words of a question without store names", () => {
    expect(contentWords("中央通り店の自販機の釣り銭切れ、どうすればいいですか？", DEFAULT_STORES)).toEqual([
      "自販機",
      "釣り銭切れ",
    ]);
  });

  it("suggests narrow keyword groups", () => {
    expect(suggestFaqPatterns("洗剤の補充はどこにありますか？")).toEqual([
      ["洗剤", "補充"],
      ["洗剤", "どこ"],
    ]);
    expect(suggestFaqPatterns("中央通り店の自販機の釣り銭切れ、どうすればいいですか？", DEFAULT_STORES)).toEqual([
      ["自販機", "釣り銭切れ"],
    ]);
    expect(suggestFaqPatterns("駐車場はどこ？", DEFAULT_STORES)).toEqual([["駐車場", "どこ"]]);
    expect(suggestFaqPatterns("どうしよう？")).toEqual([]);
  });

  it("round-trips keyword lines", () => {
    const groups = parsePatternLines("洗剤、補充\n\n 洗剤 , どこ ,洗剤\n");
    expect(groups).toEqual([
      ["洗剤", "補充"],
      ["洗剤", "どこ"],
    ]);
    expect(formatPatternLines(groups)).toBe("洗剤、補充\n洗剤、どこ");
  });

  it("checks whether the patterns would answer the original question", () => {
    const text = "中央通り店の自販機の釣り銭切れ、どうすればいいですか？";
    expect(patternsMatch(text, [["自販機", "釣り銭"]])).toBe(true);
    expect(patternsMatch(text, [["自販機", "両替"]])).toBe(false);
    expect(patternsMatch(text, [])).toBe(false);
    expect(missingWords(text, [["自販機", "両替"]])).toEqual(["両替"]);
  });
});

describe("FAQ suggestions skip everyday words", () => {
  it("drops お客様 / 本日 and keeps the topic", () => {
    expect(
      suggestFaqPatterns("駅前店のお客様から乾燥機の使い方について問い合わせがありました。", DEFAULT_STORES),
    ).toEqual([["乾燥機", "使い方"]]);
  });
});
