import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/seed";
import { CATEGORY_LABELS, type Settings } from "@/lib/types";
import { checkFaq, cleanPatternGroups, filterFaqs, finalizeFaq, groupMatches, testFaq } from "../faqUtils";

const settings = (): Settings => defaultSettings();
const staff = (s: Settings) => s.members.find((m) => m.id === "m_suzuki")!;
const label = (c: keyof typeof CATEGORY_LABELS) => CATEGORY_LABELS[c];

describe("FAQ list helpers", () => {
  it("filters by text and status", () => {
    const s = settings();
    s.faqs[1].enabled = false;
    expect(filterFaqs(s.faqs, "洗剤", "all").map((f) => f.id)).toEqual(["f_detergent"]);
    expect(filterFaqs(s.faqs, "", "disabled").map((f) => f.id)).toEqual(["f_lost_item"]);
    expect(filterFaqs(s.faqs, "", "enabled")).toHaveLength(s.faqs.length - 1);
    expect(filterFaqs(s.faqs, "キーボックス", "all").map((f) => f.id)).toEqual(["f_key"]);
  });

  it("cleans condition groups", () => {
    expect(cleanPatternGroups([[" 洗剤", "補充 "], [], ["  "], ["補充", "洗剤"], ["鍵", "鍵"]])).toEqual([
      ["洗剤", "補充"],
      ["鍵"],
    ]);
  });

  it("matches a group only when every word appears", () => {
    expect(groupMatches("洗剤の補充はどこ？", ["洗剤", "補充"])).toBe(true);
    expect(groupMatches("洗剤はどこ？", ["洗剤", "補充"])).toBe(false);
    expect(groupMatches("ｷｰﾎﾞｯｸｽ", ["キーボックス"])).toBe(true);
    expect(groupMatches("なんでも", [])).toBe(false);
  });
});

describe("checkFaq", () => {
  it("requires question, answer and a condition", () => {
    const check = checkFaq({ question: "", answer: " ", patterns: [[" "]] });
    expect(Object.keys(check.errors).sort()).toEqual(["answer", "patterns", "question"]);
  });

  it("warns when the question itself would not match, on broad words and on duplicates", () => {
    const s = settings();
    const check = checkFaq(
      { question: "シャンプーはありますか？", answer: "ありません", patterns: [["鍵"], ["洗剤", "補充"]] },
      s.faqs,
    );
    expect(check.errors).toEqual({});
    expect(check.warnings.some((w) => w.includes("当てはまりません"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("「鍵」"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("洗剤の補充"))).toBe(true);
  });

  it("finalizes with trimmed texts and clean groups", () => {
    expect(finalizeFaq({ question: " Q ", answer: " A ", patterns: [["a", " a "]] })).toEqual({
      question: "Q",
      answer: "A",
      patterns: [["a"]],
    });
  });
});

describe("testFaq", () => {
  it("answers a question that matches an FAQ", () => {
    const s = settings();
    const out = testFaq("洗剤の補充はどこにありますか？", s, staff(s), label);
    expect(out.kind).toBe("answer");
    if (out.kind === "answer") expect(out.match.faq.id).toBe("f_detergent");
  });

  it("explains when the message is not a question", () => {
    const s = settings();
    expect(testFaq("洗剤の補充しておきました", s, staff(s), label).kind).toBe("not_question");
  });

  it("never answers an emergency from the FAQ", () => {
    const s = settings();
    const out = testFaq("洗剤の補充場所で水漏れしています、どうすればいいですか？", s, staff(s), label);
    expect(out.kind).toBe("overridden");
    if (out.kind === "overridden") expect(out.categoryLabel).toBe("緊急トラブル");
  });

  it("reports disabled FAQs and no match", () => {
    const s = settings();
    s.faqs = s.faqs.map((f) => (f.id === "f_garbage" ? { ...f, enabled: false } : f));
    expect(testFaq("ゴミ出しはいつですか？", s, staff(s), label).kind).toBe("disabled");
    expect(testFaq("シャンプーはありますか？", s, staff(s), label).kind).toBe("none");
    expect(testFaq("   ", s, staff(s), label).kind).toBe("none");
  });
});
