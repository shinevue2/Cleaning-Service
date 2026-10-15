import { describe, expect, it } from "vitest";
import { analyze, LEARNED_SIMILARITY_THRESHOLD, PHOTO_ONLY_CONFIDENCE } from "@/lib/engine";
import type { Category, LearnedExample } from "@/lib/types";
import { DAY, input, settings } from "./helpers";

/** CONTRACT §4.4 sample scenarios — ids are fixed, the landing page deep-links to them. */
const SAMPLE_SCENARIOS: Array<{ id: string; group: string; sender: string; text: string; photos: number; expect: Category[] }> = [
  { id: "sc_start", group: "g_cleaning", sender: "m_tanaka", text: "駅前店、これから清掃に入ります", photos: 0, expect: ["cleaning_start"] },
  { id: "sc_done_photo", group: "g_cleaning", sender: "m_tanaka", text: "駅前店の清掃完了しました！", photos: 1, expect: ["cleaning_done"] },
  { id: "sc_done_nophoto", group: "g_cleaning", sender: "m_sato", text: "南町店、清掃終わりました", photos: 0, expect: ["cleaning_done"] },
  { id: "sc_leftover", group: "g_cleaning", sender: "m_sato", text: "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", photos: 1, expect: ["leftover"] },
  { id: "sc_machine", group: "g_cleaning", sender: "m_suzuki", text: "緑ヶ丘店の乾燥機3番がE21エラーで止まっています", photos: 1, expect: ["machine_error"] },
  { id: "sc_faq", group: "g_cleaning", sender: "m_suzuki", text: "洗剤の補充はどこにありますか？", photos: 0, expect: ["question"] },
  { id: "sc_question", group: "g_cleaning", sender: "m_tanaka", text: "中央通り店の自販機の釣り銭切れ、どうすればいいですか？", photos: 0, expect: ["question"] },
  { id: "sc_emergency", group: "g_cleaning", sender: "m_tanaka", text: "駅前店、洗濯機の下から水漏れしていて床が水浸しです！", photos: 0, expect: ["emergency"] },
  { id: "cc_info", group: "g_call", sender: "m_yamamoto", text: "【連絡】明日10時から中央通り店で業者の定期点検が入ります。", photos: 0, expect: ["info"] },
  { id: "cc_machine_refund", group: "g_call", sender: "m_yamamoto", text: "南町店のお客様から、乾燥機が回らないので返金してほしいと入電がありました。", photos: 0, expect: ["machine_error"] },
  { id: "cc_emergency_smell", group: "g_call", sender: "m_yamamoto", text: "北口店で焦げ臭いにおいがするとお客様から連絡がありました。至急確認お願いします。", photos: 0, expect: ["emergency"] },
  { id: "cc_thanks", group: "g_call", sender: "m_yamamoto", text: "本日の入電は以上です。ありがとうございました。", photos: 0, expect: ["info", "chat"] },
];

describe("sample scenarios (default settings)", () => {
  const s = settings();
  it.each(SAMPLE_SCENARIOS)("$id → $expect", (sc) => {
    const a = analyze(input(s, sc.text, { sender: sc.sender, group: sc.group, photos: sc.photos }), s);
    expect(sc.expect).toContain(a.category);
    expect(a.confidence).toBeGreaterThanOrEqual(s.behavior.confidenceThreshold);
    expect(a.reasoning.length).toBeGreaterThan(20);
  });

  it("sc_faq answers from the FAQ with normal urgency", () => {
    const a = analyze(input(s, "洗剤の補充はどこにありますか？", { sender: "m_suzuki" }), s);
    expect(a).toMatchObject({ category: "question", urgency: "normal", source: "faq", faqId: "f_detergent" });
  });

  it("sc_question without an FAQ needs a human (attention)", () => {
    const a = analyze(input(s, "中央通り店の自販機の釣り銭切れ、どうすればいいですか？"), s);
    expect(a).toMatchObject({ category: "question", urgency: "attention", source: "ai" });
    expect(a.faqId).toBeUndefined();
  });
});

describe("categories and urgency", () => {
  const s = settings();
  const run = (text: string, opts: Parameters<typeof input>[2] = {}) => analyze(input(s, text, opts), s);

  it("emergency is urgent and explained with the quoted cues and store", () => {
    const a = run("駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    expect(a.urgency).toBe("urgent");
    expect(a.reasoning).toContain("“水漏れ”");
    expect(a.reasoning).toContain("駅前店");
    expect(a.sample).toBe(true);
    expect(a.source).toBe("ai");
  });

  it("machine error mentions the error code and machine in the reasoning", () => {
    const a = run("緑ヶ丘店の乾燥機3番がE21エラーで止まっています", { sender: "m_suzuki", photos: 1 });
    expect(a.urgency).toBe("attention");
    expect(a.extracted).toMatchObject({ machine: "乾燥機3番", errorCode: "E21", storeId: "s_midori" });
    expect(a.reasoning).toContain("“E21”");
    expect(a.reasoning).toContain("乾燥機3番");
  });

  it("leftover reasoning quotes the days", () => {
    const a = run("北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", { sender: "m_sato", photos: 1 });
    expect(a.reasoning).toContain("“出しっぱなし”“3日間”");
    expect(a.reasoning).toContain("長期間放置");
  });

  it("chat-only messages are chat with normal urgency", () => {
    const a = run("おはようございます！今日もよろしくお願いします");
    expect(a).toMatchObject({ category: "chat", urgency: "normal" });
  });

  it("call-center info beats a trailing thank-you", () => {
    const a = run("本日の入電は以上です。ありがとうございました。", { sender: "m_yamamoto" });
    expect(a.category).toBe("info");
    expect(a.secondary).not.toContain("chat");
  });

  it("cleaning keywords only apply to staff", () => {
    expect(run("清掃完了しました", { sender: "m_yamamoto" }).category).toBe("unknown");
  });

  it("nothing matched → unknown, attention, fallback", () => {
    const a = run("今日はいい天気ですね");
    expect(a).toMatchObject({ category: "unknown", urgency: "attention", source: "fallback", sample: false });
    expect(a.confidence).toBeLessThan(0.55);
  });

  it("empty text and no photo → unknown", () => {
    expect(run("").category).toBe("unknown");
  });

  it("is deterministic", () => {
    const text = "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです";
    expect(run(text, { sender: "m_sato" })).toEqual(run(text, { sender: "m_sato" }));
  });
});

describe("excludes (local: only the overlapping keyword is ignored)", () => {
  const s = settings();
  const run = (text: string, sender = "m_tanaka", photos = 0) => analyze(input(s, text, { sender, photos }), s);

  it("燃えるゴミ / たばこ never switch off a real fire elsewhere in the message", () => {
    expect(run("燃えるゴミの袋から煙が出てます！").category).toBe("emergency");
    expect(run("たばこの火が原因っぽくてゴミ箱から煙が出てます").category).toBe("emergency");
    expect(run("たばこの吸い殻を片付けました。乾燥機から焦げ臭いにおいがします").category).toBe("emergency");
    expect(run("燃えるゴミを出しました。乾燥機3番から煙が出ています！")).toMatchObject({ category: "emergency", urgency: "urgent" });
  });

  it("漏れなく ignores only its own 漏れ, not a later 水漏れ", () => {
    const a = run("駅前店、清掃は漏れなく完了しました。ただ2番の洗濯機の下から水漏れしています", "m_tanaka", 1);
    expect(a).toMatchObject({ category: "emergency", urgency: "urgent" });
    expect(run("漏れなく確認しましたが、2番の下から水漏れしてます").category).toBe("emergency");
    const ok = run("清掃完了しました。水漏れがないか漏れなく確認済みです");
    expect(ok.category).toBe("cleaning_done");
    expect(ok.secondary).not.toContain("emergency");
  });

  it("a smoke word inside an exclude phrase stays harmless (and still reaches a human)", () => {
    const a = run("店内でたばこの煙が気になるとお客様から連絡がありました", "m_yamamoto");
    expect(a.category).not.toBe("emergency");
    expect(a.urgency).toBe("attention");
    expect(run("店内で煙が出ているとお客様から連絡がありました", "m_yamamoto").category).toBe("emergency");
  });
});

describe("width / spacing variants", () => {
  const s = settings();
  it.each([
    ["half-width katakana and full-width digits", "ｴﾗｰが出て乾燥機３番が止まった", "machine_error"],
    ["full-width letters", "乾燥機３番がＥ２１で止まっています", "machine_error"],
    ["spaces inside a keyword", "水 漏 れ しています", "emergency"],
    ["full-width spaces", "駅前店　清掃　完了しました", "cleaning_done"],
    ["full-width question mark", "鍵はどこ？", "question"],
    ["newlines", "駅前店\nこれから\n清掃に入ります", "cleaning_start"],
    ["polite negative", "南町店の乾燥機が回りません", "machine_error"],
    ["polite past", "洗濯機2号機が止まりました", "machine_error"],
    ["polite leftover", "洗濯物を誰も取りに来ません", "leftover"],
  ])("%s", (_label, text, category) => {
    expect(analyze(input(s, text), s).category).toBe(category);
  });
});

describe("photos", () => {
  const s = settings();

  it("a staff photo with no text is a completion report (confidence 0.6)", () => {
    const a = analyze(input(s, "", { sender: "m_suzuki", photos: 2 }), s);
    expect(a).toMatchObject({ category: "cleaning_done", urgency: "normal", confidence: PHOTO_ONLY_CONFIDENCE });
    expect(a.extracted.storeId).toBe("s_midori");
    expect(a.reasoning).toContain("写真が2枚");
  });

  it("a staff photo with only a greeting is also a completion report", () => {
    expect(analyze(input(s, "お疲れ様です", { photos: 1 }), s).category).toBe("cleaning_done");
  });

  it("a photo from the call center is not a completion report", () => {
    expect(analyze(input(s, "", { sender: "m_yamamoto", photos: 1 }), s).category).toBe("unknown");
  });

  it("a photo raises completion confidence", () => {
    const withPhoto = analyze(input(s, "駅前店の清掃完了しました", { photos: 1 }), s);
    const without = analyze(input(s, "駅前店の清掃完了しました"), s);
    expect(withPhoto.confidence).toBeGreaterThan(without.confidence);
    expect(withPhoto.reasoning).toContain("写真1枚");
    expect(without.reasoning).toContain("写真はまだ届いていません");
  });
});

describe("combined reports", () => {
  const s = settings();

  it("cleaning done + leftover → leftover primary, cleaning_done secondary", () => {
    const a = analyze(input(s, "駅前店の清掃完了しました。2番の乾燥機に洗濯物が置きっぱなしです", { photos: 1 }), s);
    expect(a.category).toBe("leftover");
    expect(a.secondary).toEqual(["cleaning_done"]);
    expect(a.urgency).toBe("attention");
    expect(a.reasoning).toContain("清掃完了の報告");
  });

  it("machine error + question (no FAQ) → machine error first", () => {
    const a = analyze(input(s, "乾燥機3番が止まっています。どうすればいいですか？"), s);
    expect(a.category).toBe("machine_error");
    expect(a.secondary).toContain("question");
  });
});

describe("FAQ precedence", () => {
  const s = settings();
  const run = (text: string) => analyze(input(s, text), s);

  it("a clear question matching an FAQ beats leftover", () => {
    const a = run("忘れ物はどうすればいいですか？");
    expect(a).toMatchObject({ category: "question", source: "faq", faqId: "f_lost_item", urgency: "normal" });
    expect(a.secondary).toContain("leftover");
  });

  it("the same topic without a question stays a leftover report", () => {
    const a = run("北口店に忘れ物があります");
    expect(a.category).toBe("leftover");
    expect(a.faqId).toBeUndefined();
  });

  it("an emergency is never answered by an FAQ", () => {
    const a = run("水漏れしています。鍵はどこですか？");
    expect(a.category).toBe("emergency");
    expect(a.faqId).toBeUndefined();
  });

  it("FAQ answers are not used when the FAQ is disabled", () => {
    const s2 = settings((x) => x.faqs.forEach((f) => (f.enabled = false)));
    const a = analyze(input(s2, "洗剤の補充はどこにありますか？"), s2);
    expect(a).toMatchObject({ category: "question", urgency: "attention" });
  });
});

describe("learned examples", () => {
  const example = (text: string, category: Category, urgency: LearnedExample["urgency"] = "normal"): LearnedExample => ({
    id: `l_${category}`,
    text,
    category,
    urgency,
    createdAt: DAY - 1000,
  });

  it("a corrected example overrides the rules for similar messages", () => {
    const s = settings((x) => x.learned.push(example("駅前店の看板の電気が消えています", "machine_error", "attention")));
    const a = analyze(input(s, "駅前店の看板の電気が消えてます"), s);
    expect(a).toMatchObject({ category: "machine_error", urgency: "attention", source: "learned", exampleId: "l_machine_error" });
    expect(a.confidence).toBeGreaterThanOrEqual(LEARNED_SIMILARITY_THRESHOLD);
    expect(a.reasoning).toContain("類似度");
  });

  it("can change a rule-based judgement (e.g. a greeting that is really a report)", () => {
    const s = settings((x) => x.learned.push(example("了解です、明日の点検は私が立ち会います", "info")));
    const a = analyze(input(s, "了解です。明日の点検は私が立ち会います"), s);
    expect(a.category).toBe("info");
    expect(a.source).toBe("learned");
  });

  it("dissimilar messages ignore the example", () => {
    const s = settings((x) => x.learned.push(example("駅前店の看板の電気が消えています", "machine_error")));
    expect(analyze(input(s, "おはようございます"), s).source).not.toBe("learned");
  });

  it("never downgrades an emergency keyword hit", () => {
    const s = settings((x) => x.learned.push(example("駅前店で水漏れの点検を行いました", "info")));
    const a = analyze(input(s, "駅前店で水漏れの点検を行いました"), s);
    expect(a.category).toBe("emergency");
    expect(a.urgency).toBe("urgent");
    expect(a.secondary).toContain("info");
    expect(a.reasoning).toContain("安全を優先");
  });

  it("can upgrade a message to an emergency", () => {
    const s = settings((x) => x.learned.push(example("お客様が店内で動けなくなっています", "emergency", "urgent")));
    const a = analyze(input(s, "お客様が店内で動けなくなっています"), s);
    expect(a).toMatchObject({ category: "emergency", urgency: "urgent", source: "learned" });
  });
});

describe("confidence threshold", () => {
  it("stays within 0.55–0.97 for rule results", () => {
    const s = settings();
    for (const text of ["?", "清掃完了しました", "駅前店で水漏れ、水浸し、浸水しています、溢れて止まりません"]) {
      const a = analyze(input(s, text, { photos: 1 }), s);
      expect(a.confidence).toBeGreaterThanOrEqual(0.55);
      expect(a.confidence).toBeLessThanOrEqual(0.97);
    }
  });

  it("below the threshold → unknown, keeping the guess in secondary", () => {
    const s = settings((x) => (x.behavior.confidenceThreshold = 0.7));
    const a = analyze(input(s, "", { sender: "m_suzuki", photos: 1 }), s);
    expect(a).toMatchObject({ category: "unknown", urgency: "attention", secondary: ["cleaning_done"] });
    expect(a.reasoning).toContain("判定を保留");
    expect(a.reasoning).toContain("70%");
  });

  it("an emergency is never turned into unknown", () => {
    const s = settings((x) => (x.behavior.confidenceThreshold = 0.99));
    expect(analyze(input(s, "水漏れ"), s).category).toBe("emergency");
  });
});

describe("manager messages", () => {
  it("are still analysed (the plan decides not to reply)", () => {
    const s = settings();
    const a = analyze(input(s, "駅前店で水漏れ、今向かっています", { sender: "m_owner" }), s);
    expect(a.category).toBe("emergency");
  });
});
