import { describe, expect, it } from "vitest";
import { detectDays, detectErrorCode, detectMachine, extract, findFaq, keywordVariants, normalize } from "@/lib/engine";
import { member, settings } from "./helpers";

const s = settings();
const ex = (text: string, sender = "m_tanaka", photos = 0) => extract(text, photos, s, member(s, sender));

describe("extract: store", () => {
  it("finds a store by its name", () => {
    expect(ex("緑ヶ丘店の乾燥機が止まっています").storeId).toBe("s_midori");
  });

  it("finds a store by an alias, ignoring spaces and width", () => {
    expect(ex("北 口、清掃完了です").storeId).toBe("s_kita");
    expect(ex("緑が丘の両替機").storeId).toBe("s_midori");
  });

  it("prefers the store mentioned first in the text", () => {
    expect(ex("南町店のあと北口店に向かいます").storeId).toBe("s_minami");
  });

  it("falls back to the sender's only store", () => {
    expect(ex("これから清掃に入ります", "m_suzuki").storeId).toBe("s_midori");
  });

  it("leaves the store empty when the sender covers several stores", () => {
    expect(ex("これから清掃に入ります", "m_tanaka").storeId).toBeUndefined();
    expect(ex("乾燥機が止まりました", "m_yamamoto").storeId).toBeUndefined();
  });
});

describe("extract: machine", () => {
  it.each([
    ["乾燥機3番が止まった", "乾燥機3番"],
    ["乾燥機の3番", "乾燥機3番"],
    ["洗濯機2号機がエラー", "洗濯機2番"],
    ["4番の洗濯機に洗濯物", "洗濯機4番"],
    ["乾燥機No.3", "乾燥機3番"],
    ["乾燥機③", "乾燥機3番"],
    ["乾燥機三番", "乾燥機3番"],
    ["洗濯乾燥機1番", "洗濯乾燥機1番"],
    ["両替機の小銭がない", "両替機"],
    ["3番の機械が動かない", "3番の機械"],
    ["乾燥機の調子が悪いです。3番です", "乾燥機3番"],
  ])("%s → %s", (text, label) => {
    expect(detectMachine(normalize(text))).toBe(label);
  });

  it("does not mistake quantities or phone numbers for machine numbers", () => {
    expect(detectMachine(normalize("乾燥機10分回しても乾かない"))).toBe("乾燥機");
    expect(detectMachine(normalize("110番しました"))).toBeUndefined();
    expect(detectMachine(normalize("一番奥の乾燥機"))).toBe("乾燥機");
  });
});

describe("extract: error code", () => {
  it.each([
    ["E21エラーです", "E21"],
    ["ｅ－２１が表示", "E21"],
    ["エラー21と出ています", "E21"],
    ["エラーコードU05", "U05"],
    ["H05表示", "H05"],
  ])("%s → %s", (text, code) => {
    expect(detectErrorCode(normalize(text))).toBe(code);
  });

  it("ignores numbers that are not error codes", () => {
    expect(detectErrorCode(normalize("エラー3番が止まった"))).toBeUndefined();
    expect(detectErrorCode(normalize("明日10時に点検"))).toBeUndefined();
    expect(detectErrorCode(normalize("online2"))).toBeUndefined();
  });
});

describe("extract: days", () => {
  it.each([
    ["3日出しっぱなし", 3],
    ["三日も放置", 3],
    ["3日間そのまま", 3],
    ["1週間取りに来ない", 7],
    ["二週間", 14],
    ["1ヶ月", 30],
    ["昨日から入ったまま", 1],
    ["おとといから放置", 2],
  ])("%s → %d", (text, days) => {
    expect(detectDays(normalize(text))).toBe(days);
  });

  it("ignores calendar dates", () => {
    expect(detectDays(normalize("10月3日に点検します"))).toBeUndefined();
    expect(detectDays(normalize("3日(土)に点検"))).toBeUndefined();
  });
});

describe("extract: keywords and photos", () => {
  it("lists matched rule keywords once, in text order, without overlapping duplicates", () => {
    const r = ex("お疲れ様です。駅前店の清掃完了しました！");
    expect(r.keywords).toEqual(["お疲れ様", "清掃完了"]);
  });

  it("only uses rules for the sender's role", () => {
    // r_info (call center) also knows 予定 and 共有; r_info_staff only the staff wording
    expect(ex("業者の点検予定を共有します", "m_tanaka").keywords).toEqual(["業者", "点検"]);
    expect(ex("業者の点検予定を共有します", "m_yamamoto").keywords).toEqual(["業者", "点検", "予定", "共有"]);
    // cleaning keywords are staff-only
    expect(ex("清掃完了しました", "m_yamamoto").keywords).toEqual([]);
  });

  it("reports photo presence", () => {
    expect(ex("", "m_tanaka", 2).hasPhoto).toBe(true);
    expect(ex("清掃完了", "m_tanaka", 0).hasPhoto).toBe(false);
  });

  it("fills store, machine, code and days together", () => {
    expect(ex("北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", "m_sato", 1)).toEqual({
      hasPhoto: true,
      keywords: ["出しっぱなし"],
      storeId: "s_kita",
      machine: "洗濯機4番",
      days: 3,
    });
  });
});

describe("polite keyword variants", () => {
  it("derives です・ます forms from plain verb endings", () => {
    expect(keywordVariants("動かない")).toContain("動きません");
    expect(keywordVariants("回らない")).toContain("回りません");
    expect(keywordVariants("水が出ない")).toContain("水が出ません");
    expect(keywordVariants("排水しない")).toContain("排水しません");
    expect(keywordVariants("止まった")).toContain("止まりました");
    expect(keywordVariants("倒れた")).toEqual(["倒れました"]);
    expect(keywordVariants("止まる")).toContain("止まります");
  });

  it("derives casual and te-form negatives", () => {
    expect(keywordVariants("回らない")).toEqual(expect.arrayContaining(["回らなく", "回らなかった", "回らず", "回ってない", "回っていません"]));
    expect(keywordVariants("開かない")).toEqual(expect.arrayContaining(["開かず", "開いてない", "開かなく"]));
    expect(keywordVariants("動かない")).toEqual(expect.arrayContaining(["動かなく", "動いてない"]));
    expect(keywordVariants("排水しない")).toContain("排水せず");
  });

  it("leaves nouns and already-polite keywords alone", () => {
    expect(keywordVariants("水漏れ")).toEqual([]);
    expect(keywordVariants("完了しました")).toEqual([]);
    expect(keywordVariants("わかりません")).toEqual([]);
  });

  it("matches polite messages and shows the words as written", () => {
    expect(ex("乾燥機が動きません").keywords).toEqual(["動きません"]);
    expect(ex("3番の乾燥機が止まりました").keywords).toEqual(["止まりました"]);
  });
});

describe("findFaq", () => {
  it("requires every word of a pattern group", () => {
    expect(findFaq(normalize("洗剤の補充はどこ？"), s.faqs)?.faq.id).toBe("f_detergent");
    expect(findFaq(normalize("補充はどこ？"), s.faqs)).toBeUndefined();
  });

  it("ignores disabled FAQs and empty patterns", () => {
    const faqs = s.faqs.map((f) => (f.id === "f_detergent" ? { ...f, enabled: false } : f));
    expect(findFaq(normalize("洗剤の補充はどこ？"), faqs)).toBeUndefined();
    expect(findFaq(normalize("なんでも"), [{ id: "x", patterns: [[" "], []], question: "q", answer: "a", enabled: true }])).toBeUndefined();
  });
});
