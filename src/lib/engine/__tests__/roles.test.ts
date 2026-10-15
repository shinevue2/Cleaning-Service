import { describe, expect, it } from "vitest";
import { analyze, choosePattern, run } from "@/lib/engine";
import type { ReplyPattern } from "@/lib/types";
import { DAY, first, input, settings } from "./helpers";

describe("reply patterns limited to a role", () => {
  it("does not ask the call center to put up a 「使用中止」 sign", () => {
    const s = settings();
    const cc = run(input(s, "南町店のお客様から、乾燥機が回らないので返金してほしいと入電がありました。", { sender: "m_yamamoto" }), s, first);
    expect(cc.analysis.category).toBe("machine_error");
    expect(cc.plan.reply).toContain("承知しました。");
    expect(cc.plan.reply).toContain("南町店");
    expect(cc.plan.reply).not.toContain("使用中止");
    expect(cc.plan.forward?.urgency).toBe("attention");

    const staff = run(input(s, "緑ヶ丘店の乾燥機3番がE21エラーで止まっています", { sender: "m_suzuki", photos: 1 }), s, first);
    expect(staff.plan.reply).toContain("使用中止");
  });

  it("prefers the sender's role within the same condition and never uses another role's pattern", () => {
    const patterns: ReplyPattern[] = [
      { id: "general", category: "info", when: "any", texts: ["全員向け"], enabled: true },
      { id: "cc", category: "info", when: "any", roles: ["callcenter"], texts: ["CC向け"], enabled: true },
      { id: "staff_night", category: "info", when: "night", roles: ["staff"], texts: ["夜のスタッフ向け"], enabled: true },
    ];
    expect(choosePattern(patterns, "info", { night: false, photo: "ignore", role: "callcenter" })?.id).toBe("cc");
    expect(choosePattern(patterns, "info", { night: false, photo: "ignore", role: "staff" })?.id).toBe("general");
    expect(choosePattern(patterns, "info", { night: true, photo: "ignore", role: "staff" })?.id).toBe("staff_night");
    expect(choosePattern(patterns, "info", { night: true, photo: "ignore", role: "callcenter" })?.id).toBe("cc");
    // without a role only the patterns for everyone apply
    expect(choosePattern(patterns, "info", { night: false, photo: "ignore" })?.id).toBe("general");
  });

  it("falls back to the general pattern when the role-specific one is turned off", () => {
    const s = settings((x) => {
      x.replyPatterns = x.replyPatterns.map((p) => (p.id === "p_machine_cc" ? { ...p, enabled: false } : p));
    });
    const cc = run(input(s, "北口店の洗濯機2番が動きませんとお客様から入電がありました。", { sender: "m_yamamoto" }), s, first);
    expect(cc.analysis.category).toBe("machine_error");
    expect(cc.plan.reply).toContain("使用中止");
  });
});

describe("polite phrases staff actually write", () => {
  const s = settings();
  it.each([
    ["駅前店、今から清掃を始めます", "cleaning_start"],
    ["中央通り店に着きました。清掃します", "cleaning_start"],
    ["南町店、掃除を開始します", "cleaning_start"],
    ["北口店の両替機がお札を受け付けません", "machine_error"],
    ["緑ヶ丘店の洗濯機2番が反応しません", "machine_error"],
    ["駅前店の乾燥機4番が使えません", "machine_error"],
  ] as const)("「%s」 → %s", (text, category) => {
    const sender = text.startsWith("南町") || text.startsWith("北口") ? "m_sato" : text.startsWith("緑ヶ丘") ? "m_suzuki" : "m_tanaka";
    expect(analyze(input(s, text, { sender, now: DAY }), s).category).toBe(category);
  });
});
