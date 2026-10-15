import { describe, expect, it } from "vitest";
import { isNight } from "@/lib/engine";
import { defaultSettings } from "@/lib/seed";
import type { EngineInput, KeywordRule, Settings } from "@/lib/types";
import {
  checkPatternTexts,
  checkRule,
  cleanPatternTexts,
  finalizeRule,
  fixPlaceholderBraces,
  groupForMember,
  groupPatterns,
  hasActivePattern,
  insertToken,
  patternConditionLabel,
  patternRolesFromScope,
  patternScopeOf,
  winningPattern,
  previewText,
  roleScopeOf,
  rolesFromScope,
  runTest,
  shadowedPatternIds,
  sortRules,
  testMoment,
  unknownPlaceholders,
  wallClockMs,
} from "../ruleUtils";

function settings(): Settings {
  return defaultSettings();
}

function input(s: Settings, text: string, opts: { memberId?: string; photo?: boolean; night?: boolean } = {}): EngineInput {
  const sender = s.members.find((m) => m.id === (opts.memberId ?? "m_tanaka"))!;
  const moment = testMoment(opts.night ? "night" : "day", s.behavior)!;
  return { text, photoCount: opts.photo ? 1 : 0, sender, group: groupForMember(sender, s.groups), now: moment.now };
}

describe("reply pattern helpers", () => {
  it("labels question patterns by whether they carry the FAQ answer", () => {
    const s = settings();
    const faq = s.replyPatterns.find((p) => p.id === "p_question_faq")!;
    const plain = s.replyPatterns.find((p) => p.id === "p_question")!;
    expect(patternConditionLabel(faq)).toBe("よくある質問に一致したとき");
    expect(patternConditionLabel(plain)).toBe("よくある質問にないとき");
    expect(patternConditionLabel(s.replyPatterns.find((p) => p.id === "p_done_photo")!)).toBe("写真あり");
    expect(patternConditionLabel(s.replyPatterns.find((p) => p.id === "p_emergency_night")!)).toBe("夜間");
  });

  it("groups patterns in category order and sorts by condition", () => {
    const groups = groupPatterns(settings().replyPatterns);
    expect(groups.map((g) => g.category)).toEqual([
      "cleaning_start",
      "cleaning_done",
      "leftover",
      "machine_error",
      "question",
      "info",
      "emergency",
      "chat",
      "unknown",
    ]);
    expect(groups.find((g) => g.category === "question")!.patterns.map((p) => p.id)).toEqual([
      "p_question_faq",
      "p_question",
    ]);
    expect(groups.find((g) => g.category === "emergency")!.patterns.map((p) => p.id)).toEqual([
      "p_emergency",
      "p_emergency_cc",
      "p_emergency_night",
      "p_emergency_cc_night",
    ]);
  });

  it("marks patterns the engine never uses because an earlier one has the same condition", () => {
    const s = settings();
    expect(shadowedPatternIds(s.replyPatterns).size).toBe(0);
    const extra = { id: "p_extra", category: "info" as const, when: "any" as const, texts: ["了解です"], enabled: true };
    const faqExtra = { id: "p_faq2", category: "question" as const, when: "any" as const, texts: ["{answer}"], enabled: true };
    const withExtra = [...s.replyPatterns, extra, faqExtra, { ...extra, id: "p_off", enabled: false }];
    expect([...shadowedPatternIds(withExtra)].sort()).toEqual(["p_extra", "p_faq2"]);
    expect(winningPattern(withExtra, extra)?.id).toBe("p_info");
    expect(winningPattern(withExtra, { ...extra, when: "night" })).toBeUndefined();
    // a non-FAQ question pattern does not compete with the FAQ one
    expect(winningPattern(withExtra, { id: "x", category: "question", when: "any", texts: ["確認します"] })?.id).toBe(
      "p_question",
    );
  });

  it("knows which categories reply", () => {
    const s = settings();
    expect(hasActivePattern(s.replyPatterns, "cleaning_start")).toBe(true);
    expect(hasActivePattern(s.replyPatterns, "chat")).toBe(false);
  });

  it("fixes full-width braces and finds unknown placeholders", () => {
    expect(fixPlaceholderBraces("｛name｝さん、{ Store }")).toBe("{name}さん、{store}");
    expect(unknownPlaceholders("{name}さん {nmae} {target} {nmae}")).toEqual(["nmae"]);
    expect(unknownPlaceholders("｛time｝")).toEqual([]);
  });

  it("inserts a placeholder at the caret", () => {
    expect(insertToken("さん、お疲れ様", 0, 0, "{name}")).toEqual({ text: "{name}さん、お疲れ様", caret: 6 });
    expect(insertToken("abcdef", 2, 4, "{x}")).toEqual({ text: "ab{x}ef", caret: 5 });
    expect(insertToken("abc", 10, 12, "{x}")).toEqual({ text: "abc{x}", caret: 6 });
  });

  it("checks texts: at least one, length, unknown placeholders, {answer} outside questions", () => {
    expect(checkPatternTexts(["  ", ""], "info").error).toBeDefined();
    expect(checkPatternTexts(["あ".repeat(501)], "info").error).toBeDefined();
    expect(checkPatternTexts(["{name}さん、ありがとう"], "info")).toEqual({ warnings: [] });
    expect(checkPatternTexts(["{nmae}さん"], "info").warnings[0]).toContain("{nmae}");
    expect(checkPatternTexts(["{answer}"], "info").warnings).toHaveLength(1);
    expect(checkPatternTexts(["{answer}"], "question").warnings).toHaveLength(0);
    expect(cleanPatternTexts([" ｛name｝さん ", " ", "承知しました。"])).toEqual(["{name}さん", "承知しました。"]);
  });

  it("previews with the shop's own names", () => {
    const s = settings();
    expect(previewText("{name}さん、{store}の清掃お疲れ様でした", "cleaning_done", s)).toBe(
      "田中さん、駅前店の清掃お疲れ様でした",
    );
    expect(previewText("{target}の件、連絡しました", "machine_error", s)).toBe("駅前店の乾燥機3番（E21）の件、連絡しました");
  });
});

describe("keyword rule helpers", () => {
  const base: KeywordRule = {
    id: "r_new",
    category: "machine_error",
    urgency: "attention",
    keywords: [],
    excludes: [],
    roles: [],
    enabled: true,
  };

  it("maps role filters to a simple scope and back", () => {
    expect(roleScopeOf([])).toBe("all");
    expect(roleScopeOf(["staff"])).toBe("staff");
    expect(roleScopeOf(["callcenter"])).toBe("callcenter");
    expect(roleScopeOf(["staff", "callcenter"])).toBe("all");
    expect(rolesFromScope("all")).toEqual([]);
    expect(rolesFromScope("staff")).toEqual(["staff"]);
  });

  it("sorts emergencies first, then attention, then normal", () => {
    const sorted = sortRules(settings().keywordRules);
    expect(sorted[0].category).toBe("emergency");
    const ranks = sorted.map((r) => ({ urgent: 2, attention: 1, normal: 0 })[r.urgency]);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(sorted.findIndex((r) => r.category === "machine_error")).toBeLessThan(
      sorted.findIndex((r) => r.category === "leftover"),
    );
  });

  it("requires a keyword and rejects words that are both keyword and exclude", () => {
    expect(checkRule(base, []).errors.keywords).toBeDefined();
    const clash = checkRule({ ...base, keywords: ["故障"], excludes: [" 故障 "] }, []);
    expect(clash.errors.keywords).toBeUndefined();
    expect(clash.errors.excludes).toContain("故障");
  });

  it("reports words shared with other enabled rules", () => {
    const s = settings();
    const check = checkRule({ ...base, category: "leftover", keywords: ["エラー", "放置しすぎ"] }, s.keywordRules);
    expect(check.shared.map((x) => x.word)).toEqual(["エラー"]);
    expect(check.shared[0].rule.id).toBe("r_machine_error");
  });

  it("finalizes: emergencies are always urgent, words cleaned, empty memo removed", () => {
    const rule = finalizeRule({
      ...base,
      category: "emergency",
      urgency: "normal",
      keywords: [" 水漏れ", "水漏れ", ""],
      excludes: ["漏れなく "],
      memo: "  ",
    });
    expect(rule.urgency).toBe("urgent");
    expect(rule.keywords).toEqual(["水漏れ"]);
    expect(rule.excludes).toEqual(["漏れなく"]);
    expect("memo" in rule).toBe(false);
  });
});

describe("test tab helpers", () => {
  it("builds wall-clock moments in Asia/Tokyo", () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(wallClockMs(23 * 60 + 5));
    expect(parts).toBe("23:05");
  });

  it("picks a day and a night moment that match the night window", () => {
    const s = settings();
    const day = testMoment("day", s.behavior)!;
    const night = testMoment("night", s.behavior)!;
    expect(day.label).toBe("14:00");
    expect(night.label).toBe("23:00");
    expect(isNight(day.now, s.behavior)).toBe(false);
    expect(isNight(night.now, s.behavior)).toBe(true);

    const daytimeNight = { ...s.behavior, nightStart: "12:00", nightEnd: "16:00" };
    const d = testMoment("day", daytimeNight)!;
    const n = testMoment("night", daytimeNight)!;
    expect(isNight(d.now, daytimeNight)).toBe(false);
    expect(isNight(n.now, daytimeNight)).toBe(true);

    expect(testMoment("night", { ...s.behavior, nightStart: "22:00", nightEnd: "22:00" })).toBeNull();
    expect(testMoment("night", { ...s.behavior, nightStart: "", nightEnd: "8:00" })).toBeNull();
  });

  it("chooses the sender's usual group", () => {
    const s = settings();
    expect(groupForMember({ role: "callcenter" }, s.groups).id).toBe("g_call");
    expect(groupForMember({ role: "staff" }, s.groups).id).toBe("g_cleaning");
    expect(groupForMember({ role: "staff" }, []).id).toBe("g_test");
  });

  it("runs the engine and lists every reply variant", () => {
    const s = settings();
    const result = runTest(input(s, "駅前店、これから清掃に入ります"), s);
    expect(result.analysis.category).toBe("cleaning_start");
    expect(result.replies).toHaveLength(2);
    expect(result.replies[0]).toContain("田中さん");
    expect(result.plan.forward).toBeNull();
  });

  it("uses the night pattern and routes an emergency at night", () => {
    const s = settings();
    const result = runTest(input(s, "駅前店、洗濯機の下から水漏れしています！", { night: true }), s);
    expect(result.analysis.category).toBe("emergency");
    expect(result.plan.forward?.urgency).toBe("urgent");
    expect(result.replies[0]).toContain("夜間");
  });

  it("does not reply to managers", () => {
    const s = settings();
    const result = runTest(input(s, "駅前店の水漏れ、対応済みです", { memberId: "m_owner" }), s);
    expect(result.plan.reply).toBeNull();
    expect(result.replies).toEqual([]);
  });

  it("does not modify the settings it is given", () => {
    const s = settings();
    const snapshot = JSON.stringify(s);
    runTest(input(s, "南町店、清掃終わりました"), s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("reply patterns limited to a role", () => {
  it("does not treat a call-center pattern as shadowed by the general one", () => {
    const s = defaultSettings();
    expect(s.replyPatterns.some((p) => p.id === "p_machine_cc")).toBe(true);
    expect(shadowedPatternIds(s.replyPatterns).has("p_machine_cc")).toBe(false);
    const ccMachine = s.replyPatterns.find((p) => p.id === "p_machine_cc")!;
    expect(winningPattern(s.replyPatterns, ccMachine)).toBeUndefined();
    const duplicate = { ...ccMachine, id: "p_machine_cc2" };
    expect(shadowedPatternIds([...s.replyPatterns, duplicate]).has("p_machine_cc2")).toBe(true);
    expect(winningPattern([...s.replyPatterns, duplicate], duplicate)?.id).toBe("p_machine_cc");
  });

  it("maps the scope select to stored roles", () => {
    expect(patternScopeOf({})).toBe("all");
    expect(patternScopeOf({ roles: ["callcenter"] })).toBe("callcenter");
    expect(patternRolesFromScope("all")).toBeUndefined();
    expect(patternRolesFromScope("staff")).toEqual(["staff"]);
  });
});
