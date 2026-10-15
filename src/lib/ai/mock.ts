/**
 * Sample AI used while no API key is configured. Browser-safe (no SDK, no env access).
 *
 * The rule engine already writes AI-style reasoning and marks its own AI-style results with
 * `sample: true`, so the mock simply returns that judgement. Results that did not come from the
 * "AI" at all (manager-corrected examples, 判定保留 fallbacks) keep `sample: false`, exactly as the
 * engine produced them, so the browser simulator and the server show the same labels.
 */
import type { Analysis } from "../types";
import type { AIClassifier } from "./types";

export const MOCK_CLASSIFIER_LABEL = "サンプルAI（デモ）";

export const mockClassifier: AIClassifier = {
  id: "mock",
  label: MOCK_CLASSIFIER_LABEL,
  sample: true,
  async classify(_input, _settings, ruleGuess): Promise<Analysis> {
    const isAiStyle = ruleGuess.source === "ai" || ruleGuess.source === "faq" || ruleGuess.source === "rule";
    return { ...ruleGuess, sample: isAiStyle ? true : ruleGuess.sample };
  },
};
