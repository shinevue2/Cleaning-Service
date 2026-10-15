import { describe, expect, it, vi } from "vitest";
import { getServerClassifier, mockClassifier } from "../index";
import { checkAnalyzeAuth, parseAnalyzeRequest, runAnalyze } from "../analyzeApi";
import type { AIClassifier } from "../types";
import { DAY, ruleGuessFor, settings } from "./helpers";

vi.mock("server-only", () => ({}));

describe("mockClassifier", () => {
  it("returns the engine's judgement labelled as a sample", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "駅前店、これから清掃に入ります");
    const result = await mockClassifier.classify(input, s, rule);
    expect(result).toEqual({ ...rule, sample: true });
    expect(mockClassifier).toMatchObject({ id: "mock", label: "サンプルAI（デモ）", sample: true });
  });

  it("keeps manager-corrected examples and 判定保留 un-labelled, as the engine produced them", async () => {
    const s = settings((x) => {
      x.learned.push({ id: "l1", text: "4番の洗濯機の中に靴下が片方残っていました", category: "leftover", urgency: "attention", createdAt: 1 });
    });
    const learned = ruleGuessFor(s, "4番の洗濯機の中に靴下が片方残っていました");
    expect((await mockClassifier.classify(learned.input, s, learned.rule)).sample).toBe(false);
  });
});

describe("getServerClassifier", () => {
  it("uses the sample AI without an API key", () => {
    expect(getServerClassifier({})).toBe(mockClassifier);
    expect(getServerClassifier({ ANTHROPIC_API_KEY: "  " })).toBe(mockClassifier);
  });

  it("uses Claude (claude-opus-5-5 by default) when an API key is set", () => {
    const classifier = getServerClassifier({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(classifier).toMatchObject({ id: "claude", sample: false, model: "claude-opus-5-5" });
    expect(getServerClassifier({ ANTHROPIC_API_KEY: "sk-ant-test" })).toBe(classifier);
    expect(getServerClassifier({ ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_MODEL: "claude-sonnet-5-5" }).model).toBe("claude-sonnet-5-5");
  });
});

describe("analyze API helpers", () => {
  const s = settings();
  const claude: AIClassifier = { id: "claude", label: "Claude（本番）", sample: false, classify: async (_i, _s, rule) => rule };

  it("parses a valid request", () => {
    const parsed = parseAnalyzeRequest({ text: "駅前店、これから清掃に入ります", senderId: "m_tanaka", groupId: "g_cleaning" }, s);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.input).toMatchObject({ photoCount: 0, sender: { id: "m_tanaka" }, group: { id: "g_cleaning" } });
  });

  it("explains every problem in Japanese", () => {
    const parsed = parseAnalyzeRequest({ photoCount: -1, senderId: "", groupId: 3 }, s);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.length).toBeGreaterThanOrEqual(2);
      expect(parsed.issues.join()).toMatch(/photoCount|senderId|groupId/);
    }
    expect(parseAnalyzeRequest(null, s).ok).toBe(false);
  });

  it("never shows the validator's English messages", () => {
    for (const body of [{ text: 123, photoCount: "2", senderId: 1, groupId: null }, [], "text", null]) {
      const parsed = parseAnalyzeRequest(body, s);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.issues.length).toBeGreaterThan(0);
        for (const issue of parsed.issues) expect(issue).not.toMatch(/Invalid|expected|received/i);
      }
    }
  });

  it("is open with the sample AI and token-protected with Claude", () => {
    expect(checkAnalyzeAuth(mockClassifier, null, undefined)).toEqual({ ok: true });
    expect(checkAnalyzeAuth(claude, null, undefined)).toMatchObject({ ok: false, status: 403 });
    expect(checkAnalyzeAuth(claude, "Bearer nope", "secret-token")).toMatchObject({ ok: false, status: 401 });
    expect(checkAnalyzeAuth(claude, "Bearer secret-token", "secret-token")).toEqual({ ok: true });
  });

  it("is token-protected with the sample AI too once production data (LINE / APP_SETTINGS_JSON) is loaded", () => {
    const prod = { productionData: true };
    expect(checkAnalyzeAuth(mockClassifier, null, undefined, prod)).toMatchObject({ ok: false, status: 403 });
    expect(checkAnalyzeAuth(mockClassifier, "Bearer nope", "secret-token", prod)).toMatchObject({ ok: false, status: 401 });
    expect(checkAnalyzeAuth(mockClassifier, "Bearer secret-token", "secret-token", prod)).toEqual({ ok: true });
  });

  it("does not list the registered member or group ids in its errors", () => {
    const parsed = parseAnalyzeRequest({ text: "テスト", senderId: "nobody", groupId: "nowhere" }, s);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const text = parsed.issues.join("\n");
      for (const m of s.members) expect(text).not.toContain(m.id);
      for (const g of s.groups) expect(text).not.toContain(g.id);
    }
  });

  it("runs analyze → classify → plan", async () => {
    const parsed = parseAnalyzeRequest({ text: "洗剤の補充はどこにありますか？", senderId: "m_suzuki", groupId: "g_cleaning" }, s);
    if (!parsed.ok) throw new Error("fixture");
    const result = await runAnalyze({ ...parsed.input, now: DAY }, s, mockClassifier, () => 0);
    expect(result.analysis).toMatchObject({ category: "question", faqId: "f_detergent" });
    expect(result.plan.reply).toContain("洗剤の在庫");
    expect(result.plan.forward).toBeNull();
  });
});
