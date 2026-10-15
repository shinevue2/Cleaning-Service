/**
 * Claude classifier — SERVER ONLY (reads the API key; never import from client components).
 *
 * One Messages API call per incoming message:
 *   - model `claude-opus-5-5` (override with ANTHROPIC_MODEL), effort "low" (classification)
 *   - structured output via `output_config.format` (JSON schema) → validated again with zod
 *   - server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)
 *   - every failure (refusal, truncation, invalid JSON, API/network error) returns `ruleGuess`
 *   - the result is merged with the rule engine by `mergeWithRules` (emergencies are never lowered)
 */
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, EngineInput, Settings } from "../types";
import { mergeWithRules } from "./merge";
import { buildSettingsContext, buildUserMessage, CLASSIFIER_INSTRUCTIONS } from "./prompt";
import { buildOutputJsonSchema, ClassificationOutputSchema } from "./schema";
import { consoleLogger, type AIClassifier, type AILogger } from "./types";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
export const CLAUDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const CLAUDE_CLASSIFIER_LABEL = "Claude（本番）";

/** Output budget. Thinking is always on for Opus 5.5 (adaptive) and counts toward it, so leave headroom. */
const MAX_TOKENS = 2048;
/** Per-attempt timeout; a webhook should not hang on the AI — the rule result is a safe fallback. */
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;
/** Below this much time left before the caller's deadline, the API is not called at all. */
const MIN_USEFUL_MS = 3_000;

/**
 * Per-request time budget: one attempt that ends before the deadline, a retry only when two full
 * attempts fit. Without a deadline the client defaults apply (20 s, one retry).
 */
export function requestBudget(deadline: number | undefined, now: number): Anthropic.RequestOptions | null {
  if (deadline === undefined) return {};
  const left = deadline - now;
  if (left < MIN_USEFUL_MS) return null;
  const timeout = Math.min(REQUEST_TIMEOUT_MS, left);
  return { timeout, maxRetries: left >= 2 * REQUEST_TIMEOUT_MS + 1_000 ? MAX_RETRIES : 0 };
}

type BetaCreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

/** The slice of the SDK client we use — lets tests inject a fake without network access. */
export interface ClaudeMessagesClient {
  beta: {
    messages: {
      create(params: BetaCreateParams, options?: Anthropic.RequestOptions): PromiseLike<BetaMessage>;
    };
  };
}

export interface ClaudeClassifierOptions {
  apiKey: string;
  /** Defaults to `claude-opus-5-5`. */
  model?: string;
  /** Injected client (tests). Defaults to a real SDK client built from `apiKey`. */
  client?: ClaudeMessagesClient;
  logger?: AILogger;
}

/**
 * Builds the Messages API request. Stable content first (instructions → owner settings) with a cache
 * breakpoint after the settings block, then the per-message user turn.
 */
export function buildClaudeRequest(
  model: string,
  input: EngineInput,
  settings: Settings,
  ruleGuess: Analysis,
): BetaCreateParams {
  return {
    model,
    max_tokens: MAX_TOKENS,
    betas: [CLAUDE_FALLBACK_BETA],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: buildOutputJsonSchema(settings) },
    },
    system: [
      { type: "text", text: CLASSIFIER_INSTRUCTIONS },
      { type: "text", text: buildSettingsContext(settings), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildUserMessage(input, settings, ruleGuess) }],
  };
}

/**
 * Why the API call can be skipped (saves cost and latency), or null when Claude should be asked.
 *  - managers: the bot never acts on their messages
 *  - urgent rule hits: alert immediately — the AI may not lower them anyway
 *  - manager-corrected examples: the owner's correction is the answer
 *  - no text: the model would have nothing to read (photos are not sent)
 *  - short greetings / acknowledgements ("了解です", "👍"): nothing to decide, and they are frequent
 */
export const SHORT_GREETING_MAX_CHARS = 20;

export function skipReason(input: EngineInput, ruleGuess: Analysis): string | null {
  if (input.sender.role === "manager") return "manager";
  if (ruleGuess.category === "emergency" || ruleGuess.urgency === "urgent") return "urgent_rule";
  if (ruleGuess.source === "learned") return "learned_example";
  if (input.text.trim() === "") return "no_text";
  if (ruleGuess.category === "chat" && Array.from(input.text.replace(/\s+/g, "")).length <= SHORT_GREETING_MAX_CHARS) {
    return "short_greeting";
  }
  return null;
}

/** Text produced by the model that finally served the request (after the last fallback hop, if any). */
function finalText(content: readonly Anthropic.Beta.Messages.BetaContentBlock[]): string {
  let start = 0;
  content.forEach((block, i) => {
    if (block.type === "fallback") start = i + 1;
  });
  return content
    .slice(start)
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

interface ErrorInfo extends Record<string, unknown> {
  kind: string;
  hint: string;
  status?: number;
  requestId?: string | null;
}

/** Most specific first: APIConnectionError and friends are subclasses of APIError in the TS SDK. */
function describeError(error: unknown): ErrorInfo {
  if (error instanceof Anthropic.AuthenticationError) {
    return { kind: "authentication", status: 401, requestId: error.requestID, hint: "APIキーが正しくありません" };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { kind: "permission_denied", status: 403, requestId: error.requestID, hint: "このAPIキーでは利用できません" };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return { kind: "not_found", status: 404, requestId: error.requestID, hint: "モデル名（ANTHROPIC_MODEL）を確認してください" };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { kind: "rate_limited", status: 429, requestId: error.requestID, hint: "利用上限に達しました。しばらくすると回復します" };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { kind: "bad_request", status: 400, requestId: error.requestID, hint: "リクエストの内容が受け付けられませんでした" };
  }
  if (error instanceof Anthropic.InternalServerError) {
    return { kind: "server_error", status: error.status, requestId: error.requestID, hint: "AI側の一時的な障害です" };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { kind: "timeout", hint: "AIの応答が時間内に返りませんでした" };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { kind: "connection", hint: "AIに接続できませんでした" };
  }
  if (error instanceof Anthropic.APIError) {
    return { kind: "api_error", status: error.status, requestId: error.requestID, hint: "AIの呼び出しに失敗しました" };
  }
  return { kind: "unexpected", hint: error instanceof Error ? error.message : String(error) };
}

export function createClaudeClassifier(opts: ClaudeClassifierOptions): AIClassifier {
  const model = opts.model?.trim() || DEFAULT_CLAUDE_MODEL;
  const logger = opts.logger ?? consoleLogger;
  let client: ClaudeMessagesClient | undefined = opts.client;
  const getClient = (): ClaudeMessagesClient => {
    client ??= new Anthropic({ apiKey: opts.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    return client;
  };

  return {
    id: "claude",
    label: CLAUDE_CLASSIFIER_LABEL,
    sample: false,
    model,
    async classify(input, settings, ruleGuess, options): Promise<Analysis> {
      const skip = skipReason(input, ruleGuess);
      if (skip) return ruleGuess;
      const budget = requestBudget(options?.deadline, Date.now());
      if (!budget) {
        logger.warn("Not enough time left for the AI; using the rule-based result", {});
        return ruleGuess;
      }

      try {
        const response = await getClient().beta.messages.create(buildClaudeRequest(model, input, settings, ruleGuess), budget);

        // A policy decline (after any server-side fallback) comes back as HTTP 200 — check it before reading content.
        if (response.stop_reason === "refusal") {
          logger.warn("Claude declined; using the rule-based result", {
            category: response.stop_details?.category ?? null,
            model: response.model,
          });
          return ruleGuess;
        }
        if (response.stop_reason === "max_tokens") {
          logger.warn("Claude output was truncated; using the rule-based result", { model: response.model });
          return ruleGuess;
        }

        const text = finalText(response.content);
        if (!text) {
          logger.warn("Claude returned no text; using the rule-based result", { stopReason: response.stop_reason });
          return ruleGuess;
        }

        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          logger.warn("Claude returned invalid JSON; using the rule-based result", { length: text.length });
          return ruleGuess;
        }

        const parsed = ClassificationOutputSchema.safeParse(json);
        if (!parsed.success) {
          logger.warn("Claude output failed validation; using the rule-based result", {
            issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`),
          });
          return ruleGuess;
        }

        return mergeWithRules(ruleGuess, parsed.data, settings);
      } catch (error) {
        logger.warn("Claude request failed; using the rule-based result", describeError(error));
        return ruleGuess;
      }
    },
  };
}
