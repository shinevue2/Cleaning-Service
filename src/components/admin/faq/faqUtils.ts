/**
 * Pure helpers for 管理画面 › よくある質問. Matching uses the engine's own `findFaq`, so what the
 * screen shows is exactly what the bot will do.
 */
import { analyze, findFaq, normalize, type FaqMatch } from "@/lib/engine";
import type { Category, FaqEntry, Member, Settings } from "@/lib/types";
import { cleanWords, matchesQuery, wordKey } from "../settings/shared/words";

export type FaqStatusFilter = "all" | "enabled" | "disabled";

export function filterFaqs(faqs: readonly FaqEntry[], query: string, status: FaqStatusFilter): FaqEntry[] {
  return faqs.filter(
    (f) =>
      (status === "all" || (status === "enabled" ? f.enabled : !f.enabled)) &&
      matchesQuery(query, [f.question, f.answer, ...f.patterns.flat()]),
  );
}

/** Trimmed, de-duplicated words; empty groups and repeated groups dropped. */
export function cleanPatternGroups(groups: readonly (readonly string[])[]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const group of groups) {
    const words = cleanWords(group);
    if (words.length === 0) continue;
    const key = words.map(wordKey).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(words);
  }
  return out;
}

/** True when every word of the group appears in the text (the engine's rule). */
export function groupMatches(text: string, group: readonly string[]): boolean {
  const norm = normalize(text);
  const words = group.map(normalize).filter(Boolean);
  return words.length > 0 && words.every((w) => norm.includes(w));
}

export interface FaqDraft {
  question: string;
  answer: string;
  patterns: string[][];
}

export const MAX_QUESTION_LENGTH = 120;
export const MAX_ANSWER_LENGTH = 500;

export interface FaqCheck {
  errors: { question?: string; answer?: string; patterns?: string };
  warnings: string[];
}

export function checkFaq(draft: FaqDraft, others: readonly FaqEntry[] = []): FaqCheck {
  const errors: FaqCheck["errors"] = {};
  const warnings: string[] = [];
  const question = draft.question.trim();
  const answer = draft.answer.trim();
  const groups = cleanPatternGroups(draft.patterns);

  if (!question) errors.question = "質問を入力してください。";
  else if (Array.from(question).length > MAX_QUESTION_LENGTH) errors.question = `質問は${MAX_QUESTION_LENGTH}文字以内にしてください。`;
  if (!answer) errors.answer = "回答を入力してください。";
  else if (Array.from(answer).length > MAX_ANSWER_LENGTH) errors.answer = `回答は${MAX_ANSWER_LENGTH}文字以内にしてください。`;
  if (groups.length === 0) errors.patterns = "反応する言葉を1つ以上登録してください。";

  if (question && groups.length > 0 && !groups.some((g) => groupMatches(question, g))) {
    warnings.push("登録した「質問」の文は、どの条件にも当てはまりません。言葉の組み合わせを確認してください。");
  }
  const broad = groups.filter((g) => g.length === 1 && Array.from(normalize(g[0])).length <= 2);
  if (broad.length > 0) {
    warnings.push(
      `「${broad.map((g) => g[0]).join("」「")}」だけの条件は、関係のない質問にも反応しやすくなります。2つ以上の言葉を組み合わせるのがおすすめです。`,
    );
  }
  const keys = new Set(groups.map((g) => g.map(wordKey).sort().join("|")));
  const twin = others.find((f) => f.patterns.some((g) => keys.has(cleanWords(g).map(wordKey).sort().join("|"))));
  if (twin) {
    warnings.push(`同じ条件が「${twin.question}」にも登録されています。どちらの回答を使うか迷う原因になります。`);
  }
  return { errors, warnings };
}

export function finalizeFaq<T extends FaqDraft>(draft: T): T {
  return { ...draft, question: draft.question.trim(), answer: draft.answer.trim(), patterns: cleanPatternGroups(draft.patterns) };
}

/* ------------------------------------------------------------------ */
/* Test box                                                            */
/* ------------------------------------------------------------------ */

export type FaqTestOutcome =
  /** the bot answers with this FAQ */
  | { kind: "answer"; match: FaqMatch }
  /** an FAQ matches but the message is not recognised as a question (no 「？」「ですか」…) */
  | { kind: "not_question"; match: FaqMatch }
  /** an FAQ matches but something more important was found (e.g. an emergency) */
  | { kind: "overridden"; match: FaqMatch; categoryLabel: string }
  /** only a disabled FAQ matches */
  | { kind: "disabled"; match: FaqMatch }
  | { kind: "none" };

/**
 * What happens when a staff member asks `text`: answered from the FAQ, or not (and why).
 * `categoryLabel` is passed in to keep this module free of display maps.
 */
export function testFaq(
  text: string,
  settings: Settings,
  sender: Member,
  labelOf: (category: Category) => string,
): FaqTestOutcome {
  const norm = normalize(text);
  if (!norm) return { kind: "none" };
  const match = findFaq(norm, settings.faqs);
  if (!match) {
    const disabled = findFaq(
      norm,
      settings.faqs.filter((f) => !f.enabled).map((f) => ({ ...f, enabled: true })),
    );
    return disabled ? { kind: "disabled", match: disabled } : { kind: "none" };
  }
  const group = settings.groups.find((g) => g.kind === "cleaning") ?? settings.groups[0];
  const analysis = analyze(
    { text, photoCount: 0, sender, group: group ?? { id: "g_test", kind: "cleaning", name: "テスト" }, now: 0 },
    settings,
  );
  if (analysis.category === "question" && analysis.faqId) {
    const used = settings.faqs.find((f) => f.id === analysis.faqId);
    return { kind: "answer", match: used && used.id !== match.faq.id ? { faq: used, groups: [] } : match };
  }
  const questionHit = settings.keywordRules.some(
    (r) => r.enabled && r.category === "question" && r.keywords.some((k) => normalize(k) && norm.includes(normalize(k))),
  );
  if (!questionHit) return { kind: "not_question", match };
  return { kind: "overridden", match, categoryLabel: labelOf(analysis.category) };
}
