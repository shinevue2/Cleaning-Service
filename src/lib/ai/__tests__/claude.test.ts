/**
 * Claude classifier with the SDK client mocked — no network. Covers the request shape (model,
 * fallbacks, structured output, effort, caching), refusals, truncation, invalid output, typed API
 * errors and the "never downgrade an emergency" rule.
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildClaudeRequest,
  CLAUDE_FALLBACK_BETA,
  createClaudeClassifier,
  DEFAULT_CLAUDE_MODEL,
  requestBudget,
  skipReason,
  type ClaudeMessagesClient,
} from "../claude";
import type { AILogger } from "../types";
import { ruleGuessFor, settings } from "./helpers";

vi.mock("server-only", () => ({}));

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** A response as the API would return it; only the fields the classifier reads are meaningful. */
function apiMessage(content: BetaContentBlock[], stopReason: BetaMessage["stop_reason"] = "end_turn", extra: Partial<BetaMessage> = {}): BetaMessage {
  const message = {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_CLAUDE_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    diagnostics: null,
    usage: { input_tokens: 1200, output_tokens: 80 },
    ...extra,
  };
  // The full BetaMessage type has many server-populated fields that are irrelevant here.
  return message as unknown as BetaMessage;
}

const textBlock = (text: string): BetaContentBlock => ({ type: "text", text, citations: null }) as BetaContentBlock;

const output = (o: Record<string, unknown>) =>
  textBlock(JSON.stringify({ secondary: [], faqId: null, ...o }));

function fakeClient(respond: (params: CreateParams) => BetaMessage | Promise<BetaMessage>) {
  const create = vi.fn(async (...args: [CreateParams, Anthropic.RequestOptions?]) => respond(args[0]));
  const client: ClaudeMessagesClient = { beta: { messages: { create } } };
  return { client, create };
}

function silentLogger() {
  const logger: AILogger = { info: vi.fn(), warn: vi.fn() };
  return logger;
}

function classifierWith(respond: Parameters<typeof fakeClient>[0], model?: string) {
  const { client, create } = fakeClient(respond);
  const logger = silentLogger();
  return { classifier: createClaudeClassifier({ apiKey: "sk-test", model, client, logger }), create, logger };
}

describe("buildClaudeRequest", () => {
  const s = settings();
  const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");

  it("uses Opus 5.5, low effort, structured JSON output and server-side fallbacks", () => {
    const req = buildClaudeRequest(DEFAULT_CLAUDE_MODEL, input, s, rule);
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.betas).toEqual([CLAUDE_FALLBACK_BETA]);
    expect(CLAUDE_FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");
    expect(req.fallbacks).toBe("default");
    expect(req.output_config?.effort).toBe("low");
    expect(req.output_config?.format?.type).toBe("json_schema");
    expect(req.output_config?.format?.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["category", "secondary", "urgency", "confidence", "faqId", "reasoning"],
    });
    expect(req).not.toHaveProperty("thinking");
  });

  it("puts the stable instructions first and caches through the settings block", () => {
    const req = buildClaudeRequest(DEFAULT_CLAUDE_MODEL, input, s, rule);
    const system = req.system;
    if (!Array.isArray(system)) throw new Error("system should be an array of blocks");
    expect(system).toHaveLength(2);
    expect(system[0].text).toContain("迷ったら人に回してください");
    expect(system[0].cache_control).toBeUndefined();
    expect(system[1].text).toContain("f_detergent");
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages).toHaveLength(1);
    expect(String(req.messages[0].content)).toContain("今日は雨がすごいですね");
  });

  it("keeps the request identical for identical settings (cache-friendly prefix)", () => {
    const a = buildClaudeRequest(DEFAULT_CLAUDE_MODEL, input, s, rule);
    const b = buildClaudeRequest(DEFAULT_CLAUDE_MODEL, input, settings(), rule);
    expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
  });
});

describe("createClaudeClassifier — happy path", () => {
  it("lets Claude classify a message the keyword rules could not place", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    expect(rule.category).toBe("unknown");

    const { classifier, create } = classifierWith(() =>
      apiMessage([
        output({ category: "chat", urgency: "normal", confidence: 0.92, reasoning: "“雨がすごい”という天気の話題で、対応は不要と判断しました。" }),
      ]),
    );
    const result = await classifier.classify(input, s, rule);

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ category: "chat", urgency: "normal", source: "ai", sample: false, confidence: 0.92 });
    expect(result.reasoning).toContain("雨がすごい");
    expect(result.extracted).toEqual(rule.extracted);
    expect(classifier).toMatchObject({ id: "claude", label: "Claude（本番）", sample: false, model: "claude-opus-5-5" });
  });

  it("answers a paraphrased FAQ with the registered entry", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "洗濯用の液体の替えはどの棚でしたっけ");
    const { classifier } = classifierWith(() =>
      apiMessage([
        output({ category: "question", urgency: "normal", confidence: 0.88, faqId: "f_detergent", reasoning: "“替え”“どの棚”から洗剤の保管場所の質問と判断しました。" }),
      ]),
    );
    const result = await classifier.classify(input, s, rule);
    expect(result).toMatchObject({ category: "question", urgency: "normal", faqId: "f_detergent" });
  });

  it("uses the model override", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const { classifier, create } = classifierWith(
      () => apiMessage([output({ category: "chat", urgency: "normal", confidence: 0.9, reasoning: "あいさつです。" })]),
      "claude-sonnet-5-5",
    );
    await classifier.classify(input, s, rule);
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
    expect(classifier.model).toBe("claude-sonnet-5-5");
  });

  it("reads the answer produced after a server-side fallback hop", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const fallback = {
      type: "fallback",
      from: { model: DEFAULT_CLAUDE_MODEL },
      to: { model: "claude-opus-5" },
      trigger: { type: "refusal", category: null },
    } as unknown as BetaContentBlock;
    const { classifier } = classifierWith(() =>
      apiMessage([textBlock('{"partial":'), fallback, output({ category: "chat", urgency: "normal", confidence: 0.9, reasoning: "あいさつです。" })], "end_turn", {
        model: "claude-opus-5",
      }),
    );
    expect((await classifier.classify(input, s, rule)).category).toBe("chat");
  });
});

describe("createClaudeClassifier — failures return the rule result unchanged", () => {
  const s = settings();
  const { input, rule } = ruleGuessFor(s, "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです");

  it("handles a refusal before reading content", async () => {
    const { classifier, logger } = classifierWith(() =>
      apiMessage([], "refusal", { stop_details: { type: "refusal", category: "general_harms", explanation: null } as BetaMessage["stop_details"] }),
    );
    expect(await classifier.classify(input, s, rule)).toBe(rule);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("declined"), expect.objectContaining({ category: "general_harms" }));
  });

  it("handles truncated output (max_tokens)", async () => {
    const { classifier } = classifierWith(() => apiMessage([textBlock('{"category":"leftover",')], "max_tokens"));
    expect(await classifier.classify(input, s, rule)).toBe(rule);
  });

  it("handles invalid JSON and schema violations", async () => {
    const invalid = classifierWith(() => apiMessage([textBlock("leftover です")]));
    expect(await invalid.classifier.classify(input, s, rule)).toBe(rule);

    const wrongShape = classifierWith(() => apiMessage([output({ category: "laundry", urgency: "normal", confidence: 2, reasoning: "x" })]));
    expect(await wrongShape.classifier.classify(input, s, rule)).toBe(rule);
  });

  it.each([
    ["RateLimitError", () => new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "rate limited", new Headers()), "rate_limited"],
    ["AuthenticationError", () => new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "bad key" } }, "bad key", new Headers()), "authentication"],
    ["InternalServerError", () => new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "busy" } }, "overloaded", new Headers()), "server_error"],
    ["APIConnectionTimeoutError", () => new Anthropic.APIConnectionTimeoutError(), "timeout"],
    ["APIConnectionError", () => new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "connection"],
    ["a plain Error", () => new Error("unexpected"), "unexpected"],
  ])("handles %s", async (_name, makeError, kind) => {
    const { classifier, logger } = classifierWith(() => {
      throw makeError();
    });
    expect(await classifier.classify(input, s, rule)).toBe(rule);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ kind }));
  });
});

describe("createClaudeClassifier — safety", () => {
  it("never downgrades an emergency the rules found (and alerts without waiting for the API)", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    expect(rule.category).toBe("emergency");
    const { classifier, create } = classifierWith(() =>
      apiMessage([output({ category: "chat", urgency: "normal", confidence: 0.99, reasoning: "あいさつです。" })]),
    );
    const result = await classifier.classify(input, s, rule);
    expect(create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ category: "emergency", urgency: "urgent" });
  });

  it("keeps an emergency even if a custom urgent rule is hit and Claude disagrees", async () => {
    const s = settings((x) => {
      x.keywordRules.push({ id: "r_custom", category: "machine_error", urgency: "urgent", keywords: ["両替機が空"], excludes: [], roles: [], enabled: true });
    });
    const { input, rule } = ruleGuessFor(s, "中央通り店の両替機が空です");
    expect(rule.urgency).toBe("urgent");
    const { classifier, create } = classifierWith(() =>
      apiMessage([output({ category: "info", urgency: "normal", confidence: 0.95, reasoning: "連絡です。" })]),
    );
    const result = await classifier.classify(input, s, rule);
    expect(create).not.toHaveBeenCalled();
    expect(result.urgency).toBe("urgent");
  });

  it("escalates when Claude spots an emergency the keywords missed", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "駅前店の床がなんかびちゃびちゃです");
    const { classifier } = classifierWith(() =>
      apiMessage([output({ category: "emergency", urgency: "urgent", confidence: 0.6, reasoning: "“びちゃびちゃ”から水漏れの可能性があると判断しました。" })]),
    );
    expect(await classifier.classify(input, s, rule)).toMatchObject({ category: "emergency", urgency: "urgent", source: "ai" });
  });

  it("hands the message to a person when Claude is unsure", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const { classifier } = classifierWith(() =>
      apiMessage([output({ category: "chat", urgency: "normal", confidence: 0.4, reasoning: "あいさつと思われます。" })]),
    );
    const result = await classifier.classify(input, s, rule);
    expect(result).toMatchObject({ category: "unknown", urgency: "attention" });
    expect(result.reasoning).toContain("判定を保留");
  });
});

describe("skipReason", () => {
  const s = settings((x) => {
    x.learned.push({ id: "l1", text: "4番の洗濯機の中に靴下が片方残っていました", category: "leftover", urgency: "attention", createdAt: 1 });
  });

  it("skips managers, urgent rule hits, learned examples and photo-only posts", () => {
    const manager = ruleGuessFor(s, "了解です", { sender: "m_owner" });
    expect(skipReason(manager.input, manager.rule)).toBe("manager");
    const emergency = ruleGuessFor(s, "北口店で焦げ臭いにおいがします");
    expect(skipReason(emergency.input, emergency.rule)).toBe("urgent_rule");
    const learned = ruleGuessFor(s, "4番の洗濯機の中に靴下が片方残っていました");
    expect(skipReason(learned.input, learned.rule)).toBe("learned_example");
    const photo = ruleGuessFor(s, "", { photos: 2 });
    expect(skipReason(photo.input, photo.rule)).toBe("no_text");
    const greeting = ruleGuessFor(s, "了解です👍");
    expect(skipReason(greeting.input, greeting.rule)).toBe("short_greeting");
    const normal = ruleGuessFor(s, "今日は雨がすごいですね");
    expect(skipReason(normal.input, normal.rule)).toBeNull();
  });
});

describe("time budget", () => {
  it("fits the request into the caller's deadline", () => {
    expect(requestBudget(undefined, 0)).toEqual({});
    expect(requestBudget(60_000, 0)).toEqual({ timeout: 20_000, maxRetries: 1 });
    expect(requestBudget(30_000, 0)).toEqual({ timeout: 20_000, maxRetries: 0 });
    expect(requestBudget(9_000, 0)).toEqual({ timeout: 9_000, maxRetries: 0 });
    expect(requestBudget(2_000, 0)).toBeNull();
  });

  it("returns the rule result without calling the API when the deadline is too close", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const { classifier, create } = classifierWith(() => apiMessage([]));
    const result = await classifier.classify(input, s, rule, { deadline: Date.now() + 1_000 });
    expect(create).not.toHaveBeenCalled();
    expect(result).toBe(rule);
  });

  it("passes the per-request timeout to the SDK", async () => {
    const s = settings();
    const { input, rule } = ruleGuessFor(s, "今日は雨がすごいですね");
    const { classifier, create } = classifierWith(() =>
      apiMessage([output({ category: "chat", urgency: "normal", confidence: 0.92, reasoning: "天気の話題です。" })]),
    );
    await classifier.classify(input, s, rule, { deadline: Date.now() + 12_000 });
    const options = create.mock.calls[0][1];
    expect(options?.maxRetries).toBe(0);
    expect(options?.timeout).toBeLessThanOrEqual(12_000);
  });
});
