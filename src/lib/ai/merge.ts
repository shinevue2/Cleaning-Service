/**
 * Safety policy for combining the rule engine's guess with an AI answer. Pure and deterministic.
 *
 *   - An urgent result from the rules (緊急キーワード) is never lowered.
 *   - The AI may always escalate (emergency / unknown → a human sees it).
 *   - Low confidence → 判定保留 (unknown, attention): "迷ったら人に回す".
 *   - Lowering the rules' urgency (e.g. 要対応 → 自動回答) needs a clearly confident AI.
 *   - FAQ answers are only used when the AI picked an FAQ that is registered and enabled.
 */
import { maxUrgency, URGENCY_RANK } from "../engine";
import type { Analysis, Category, Settings, Urgency } from "../types";
import { CATEGORY_LABELS } from "../types";
import type { ClassificationOutput } from "./schema";

/** Minimum AI confidence required to lower the urgency the rules found. */
export const DOWNGRADE_MIN_CONFIDENCE = 0.8;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const pct = (n: number): number => Math.round(n * 100);

/** Categories that always need a person to look at them. */
const NEEDS_PERSON: ReadonlySet<Category> = new Set<Category>(["leftover", "machine_error", "unknown"]);
/** Routine categories that are handled by the reply alone. */
const ROUTINE: ReadonlySet<Category> = new Set<Category>(["cleaning_start", "cleaning_done", "info", "chat"]);

function uniqueSecondary(primary: Category, ...lists: ReadonlyArray<readonly Category[]>): Category[] {
  const out: Category[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (c !== primary && c !== "unknown" && c !== "chat" && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

function endWithPeriod(text: string): string {
  return /[。！？!?）)」]$/.test(text) ? text : `${text}。`;
}

/** 判定保留: hand the message to a person, keeping both guesses visible as `secondary`. */
function holdForPerson(rule: Analysis, ai: ClassificationOutput, confidence: number, reasoning: string): Analysis {
  return {
    category: "unknown",
    secondary: uniqueSecondary("unknown", [ai.category], ai.secondary, [rule.category], rule.secondary),
    urgency: maxUrgency("attention", maxUrgency(ai.urgency, rule.urgency)),
    confidence,
    source: "ai",
    reasoning,
    extracted: rule.extracted,
    sample: false,
  };
}

/**
 * Combines the rule-based guess with Claude's structured answer.
 * `rule` is returned (unchanged or annotated) whenever the AI answer would be less safe.
 */
export function mergeWithRules(rule: Analysis, ai: ClassificationOutput, settings: Settings): Analysis {
  const threshold = settings.behavior.confidenceThreshold;
  const confidence = round2(Math.min(1, Math.max(0, ai.confidence)));
  const aiReason = endWithPeriod(ai.reasoning.trim());

  // 1) Rules found something urgent (emergency keywords). Never lower it; the AI can only explain it.
  if (rule.category === "emergency" || rule.urgency === "urgent") {
    if (ai.category === rule.category && ai.urgency === "urgent") {
      return {
        ...rule,
        urgency: "urgent",
        secondary: uniqueSecondary(rule.category, rule.secondary, ai.secondary),
        confidence: Math.max(rule.confidence, confidence),
        source: "ai",
        reasoning: aiReason,
        sample: false,
      };
    }
    return {
      ...rule,
      source: "rule",
      sample: false,
      reasoning: `${endWithPeriod(rule.reasoning)}（AIは「${CATEGORY_LABELS[ai.category]}」と判断しましたが、緊急性の高い言葉を含むため、安全を優先してこの判定のまま扱います。）`,
    };
  }

  // 2) The AI found an emergency the keyword rules missed → escalate, whatever the confidence.
  if (ai.category === "emergency") {
    return {
      category: "emergency",
      secondary: uniqueSecondary("emergency", ai.secondary, [rule.category], rule.secondary),
      urgency: "urgent",
      confidence,
      source: "ai",
      reasoning: aiReason,
      extracted: rule.extracted,
      sample: false,
    };
  }

  // 3) The AI is unsure → a person decides.
  if (ai.category === "unknown") {
    return holdForPerson(rule, ai, confidence, aiReason);
  }
  if (confidence < threshold) {
    return holdForPerson(
      rule,
      ai,
      confidence,
      `${aiReason}ただし、確信度（${pct(confidence)}%）が基準の${pct(threshold)}%に届かないため判定を保留し、担当者に確認を回します。`,
    );
  }

  // 4) Make urgency consistent with the category.
  const faq =
    ai.category === "question" && ai.faqId ? settings.faqs.find((f) => f.id === ai.faqId && f.enabled) : undefined;
  let urgency: Urgency = ai.urgency;
  if (ai.category === "question") {
    urgency = faq ? "normal" : maxUrgency(urgency, "attention");
  } else if (NEEDS_PERSON.has(ai.category)) {
    urgency = maxUrgency(urgency, "attention");
  } else if (ROUTINE.has(ai.category) && urgency !== "normal") {
    // "Routine, but needs attention" is contradictory: the reply-only path would drop it. Hand it over.
    return holdForPerson(
      rule,
      ai,
      confidence,
      `${aiReason}通常の連絡とも読めますが、対応が必要な可能性があるため、担当者に確認を回します。`,
    );
  }

  // 5) Lowering what the rules asked for (e.g. 要対応 → 自動回答) requires a clearly confident AI.
  const lowersRule = rule.category !== "unknown" && URGENCY_RANK[urgency] < URGENCY_RANK[rule.urgency];
  if (lowersRule && confidence < DOWNGRADE_MIN_CONFIDENCE) {
    return holdForPerson(
      rule,
      ai,
      confidence,
      `${aiReason}ただし、キーワードによる判定（${CATEGORY_LABELS[rule.category]}）と結果が分かれたため、念のため担当者に確認を回します。`,
    );
  }

  const result: Analysis = {
    category: ai.category,
    // Keep what the rules found, so the log still shows e.g. that a fault word was flagged.
    secondary: uniqueSecondary(ai.category, ai.secondary, [rule.category], rule.secondary),
    urgency,
    confidence,
    source: "ai",
    reasoning: aiReason,
    extracted: rule.extracted,
    sample: false,
  };
  if (faq) result.faqId = faq.id;
  return result;
}
