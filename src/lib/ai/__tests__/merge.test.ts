import { describe, expect, it } from "vitest";
import { DOWNGRADE_MIN_CONFIDENCE, mergeWithRules } from "../merge";
import type { ClassificationOutput } from "../schema";
import { ruleGuessFor, settings } from "./helpers";

const ai = (o: Partial<ClassificationOutput>): ClassificationOutput => ({
  category: "chat",
  secondary: [],
  urgency: "normal",
  confidence: 0.9,
  faqId: null,
  reasoning: "判断しました",
  ...o,
});

describe("mergeWithRules", () => {
  const s = settings();

  it("never lowers an emergency found by the rules", () => {
    const { rule } = ruleGuessFor(s, "駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    const merged = mergeWithRules(rule, ai({ category: "chat", urgency: "normal", confidence: 0.99 }), s);
    expect(merged).toMatchObject({ category: "emergency", urgency: "urgent", source: "rule", sample: false });
    expect(merged.reasoning).toContain("安全を優先して");
  });

  it("uses Claude's wording when it agrees with an emergency", () => {
    const { rule } = ruleGuessFor(s, "駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    const merged = mergeWithRules(rule, ai({ category: "emergency", urgency: "urgent", reasoning: "“水浸し”から水漏れと判断しました" }), s);
    expect(merged).toMatchObject({ category: "emergency", urgency: "urgent", source: "ai" });
    expect(merged.reasoning).toBe("“水浸し”から水漏れと判断しました。");
  });

  it("escalates to emergency whatever the confidence", () => {
    const { rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    expect(mergeWithRules(rule, ai({ category: "emergency", urgency: "normal", confidence: 0.2 }), s)).toMatchObject({
      category: "emergency",
      urgency: "urgent",
    });
  });

  it("holds low-confidence answers for a person (迷ったら人に回す)", () => {
    const { rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const merged = mergeWithRules(rule, ai({ category: "info", confidence: s.behavior.confidenceThreshold - 0.01 }), s);
    expect(merged).toMatchObject({ category: "unknown", urgency: "attention" });
    expect(merged.secondary).toContain("info");
  });

  it("requires a clearly confident AI to lower the rules' urgency", () => {
    const { rule } = ruleGuessFor(s, "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです");
    expect(rule).toMatchObject({ category: "leftover", urgency: "attention" });

    const unsure = mergeWithRules(rule, ai({ category: "info", confidence: DOWNGRADE_MIN_CONFIDENCE - 0.05 }), s);
    expect(unsure).toMatchObject({ category: "unknown", urgency: "attention" });
    expect(unsure.reasoning).toContain("結果が分かれた");

    const sure = mergeWithRules(rule, ai({ category: "info", confidence: 0.95 }), s);
    expect(sure).toMatchObject({ category: "info", urgency: "normal" });
  });

  it("only answers with FAQs that exist and are enabled", () => {
    const { rule } = ruleGuessFor(s, "洗濯用の液体の替えはどの棚でしたっけ");
    expect(mergeWithRules(rule, ai({ category: "question", faqId: "f_detergent", confidence: 0.9 }), s)).toMatchObject({
      category: "question",
      urgency: "normal",
      faqId: "f_detergent",
    });

    const invented = mergeWithRules(rule, ai({ category: "question", faqId: "f_made_up", confidence: 0.9 }), s);
    expect(invented).toMatchObject({ category: "question", urgency: "attention" });
    expect(invented.faqId).toBeUndefined();

    const disabled = settings((x) => (x.faqs = x.faqs.map((f) => ({ ...f, enabled: false }))));
    expect(mergeWithRules(rule, ai({ category: "question", faqId: "f_detergent" }), disabled).urgency).toBe("attention");
  });

  it("raises leftover / machine errors to 要対応 and hands over contradictory routine answers", () => {
    const { rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    expect(mergeWithRules(rule, ai({ category: "machine_error", urgency: "normal" }), s).urgency).toBe("attention");
    expect(mergeWithRules(rule, ai({ category: "info", urgency: "attention" }), s)).toMatchObject({ category: "unknown", urgency: "attention" });
  });

  it("keeps the extracted facts and merges secondary categories", () => {
    const { rule } = ruleGuessFor(s, "緑ヶ丘店の清掃終わりました。乾燥機3番がE21エラーで止まっています", { sender: "m_suzuki", photos: 1 });
    const merged = mergeWithRules(rule, ai({ category: "machine_error", urgency: "attention", secondary: ["cleaning_done", "chat"] }), s);
    expect(merged.extracted).toEqual(rule.extracted);
    expect(merged.secondary).toEqual(["cleaning_done"]);
  });

  it("keeps the rule's category in secondary when a confident AI overrides it", () => {
    const { rule } = ruleGuessFor(s, "緑ヶ丘店の清掃終わりました。乾燥機3番がE21エラーで止まっています", { sender: "m_suzuki", photos: 1 });
    expect(rule.category).toBe("machine_error");
    const merged = mergeWithRules(rule, ai({ category: "cleaning_done", urgency: "normal", confidence: 0.95 }), s);
    if (merged.category === "cleaning_done") expect(merged.secondary).toContain("machine_error");
    else expect(merged.category).toBe("unknown");
  });
});
