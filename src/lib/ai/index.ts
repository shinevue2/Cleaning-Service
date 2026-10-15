/**
 * Server-side entry point of the AI layer. SERVER ONLY — client code should import
 * `@/lib/ai/mock` (and `@/lib/ai/types`) directly.
 */
import "server-only";

import { createClaudeClassifier } from "./claude";
import { mockClassifier } from "./mock";
import type { AIClassifier } from "./types";

export type { AIClassifier, AIClassifierId, AILogger } from "./types";
export { mockClassifier, MOCK_CLASSIFIER_LABEL } from "./mock";
export { createClaudeClassifier, DEFAULT_CLAUDE_MODEL, CLAUDE_CLASSIFIER_LABEL } from "./claude";

type Env = Record<string, string | undefined>;

let cached: { key: string; model: string; classifier: AIClassifier } | undefined;

/**
 * Claude when `ANTHROPIC_API_KEY` is set (model: `ANTHROPIC_MODEL`, default claude-opus-5-5),
 * otherwise the sample classifier. The Claude client is reused across requests in the same instance.
 */
export function getServerClassifier(env: Env = process.env): AIClassifier {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return mockClassifier;
  const model = env.ANTHROPIC_MODEL?.trim() ?? "";
  if (!cached || cached.key !== apiKey || cached.model !== model) {
    cached = { key: apiKey, model, classifier: createClaudeClassifier({ apiKey, model: model || undefined }) };
  }
  return cached.classifier;
}
