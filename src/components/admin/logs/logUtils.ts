/**
 * Pure helpers for the 判定ログ screen (no React) — filtering, the corrected judgement of a record and
 * the keyword suggestions used when a logged question is turned into an FAQ entry.
 */
import { containsWord, findFaq, matchText, normalize } from "@/lib/engine";
import type { AnalysisRecord, Category, FaqEntry, Issue, LearnedExample, Store, Urgency } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Effective judgement                                                 */
/* ------------------------------------------------------------------ */

/** The urgency a category usually carries — the default when a manager picks a new category. */
export const DEFAULT_URGENCY: Record<Category, Urgency> = {
  cleaning_start: "normal",
  cleaning_done: "normal",
  leftover: "attention",
  machine_error: "attention",
  question: "attention",
  info: "normal",
  emergency: "urgent",
  chat: "normal",
  unknown: "attention",
};

/** Index of learned examples by normalised text (the same key the store uses). */
export function indexLearned(learned: readonly LearnedExample[]): Map<string, LearnedExample> {
  const map = new Map<string, LearnedExample>();
  for (const example of learned) {
    const key = normalize(example.text);
    if (key) map.set(key, example);
  }
  return map;
}

/** A record as the logs screen shows it: the judgement after any manager correction. */
export interface LogJudgement {
  category: Category;
  urgency: Urgency;
  corrected: boolean;
  /** the learned example created from this record's correction, if any */
  learned?: LearnedExample;
}

/**
 * The judgement to display for a record. A correction is stored as `correctedCategory` on the record
 * and as a LearnedExample (with its urgency); the linked issue also carries the corrected urgency.
 */
export function judgementOf(
  record: AnalysisRecord,
  learnedByText: ReadonlyMap<string, LearnedExample>,
  issue?: Issue,
): LogJudgement {
  const corrected = record.correctedCategory;
  if (!corrected) {
    return { category: record.analysis.category, urgency: record.analysis.urgency, corrected: false };
  }
  // Corrections made before `correctedUrgency` existed fall back to the learned example / issue below.
  const stored = record.correctedUrgency;
  const key = normalize(record.combinedText);
  const candidate = key ? learnedByText.get(key) : undefined;
  const learned = candidate && candidate.category === corrected ? candidate : undefined;
  const urgency: Urgency =
    corrected === "emergency"
      ? "urgent"
      : (stored ??
        learned?.urgency ??
        (issue && issue.category === corrected ? issue.urgency : undefined) ??
        DEFAULT_URGENCY[corrected]);
  return { category: corrected, urgency, corrected: true, learned };
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export interface LogFilter {
  /** "" = every group */
  groupId: string;
  category: Category | "";
  urgency: Urgency | "";
  text: string;
  correctedOnly: boolean;
}

export const EMPTY_FILTER: LogFilter = { groupId: "", category: "", urgency: "", text: "", correctedOnly: false };

export function isFilterActive(filter: LogFilter): boolean {
  return (
    filter.groupId !== "" ||
    filter.category !== "" ||
    filter.urgency !== "" ||
    filter.text.trim() !== "" ||
    filter.correctedOnly
  );
}

/** Words of a free-text query (split on any whitespace, normalised like the engine). */
export function queryTerms(text: string): string[] {
  return text
    .split(/[\s　]+/)
    .map((t) => normalize(t))
    .filter((t) => t !== "");
}

export interface LogSearchFields {
  record: AnalysisRecord;
  judgement: LogJudgement;
  /** sender name, group name, store name… — anything the free text should also find */
  extra: readonly string[];
}

export function matchesFilter(item: LogSearchFields, filter: LogFilter, terms: readonly string[]): boolean {
  const { record, judgement } = item;
  if (filter.groupId && record.groupId !== filter.groupId) return false;
  if (filter.category && judgement.category !== filter.category) return false;
  if (filter.urgency && judgement.urgency !== filter.urgency) return false;
  if (filter.correctedOnly && !judgement.corrected) return false;
  if (terms.length === 0) return true;
  const haystack = normalize([record.combinedText, ...item.extra].join(" "));
  return terms.every((t) => haystack.includes(t));
}

/* ------------------------------------------------------------------ */
/* FAQ from a logged question                                          */
/* ------------------------------------------------------------------ */

/** One line for the FAQ list: the question text on a single line, at most `max` characters. */
export function questionLine(text: string, max = 80): string {
  const line = text.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : line;
}

/**
 * A general FAQ heading from a store-specific question:
 * 「中央通り店の自販機の釣り銭切れ、どうすればいいですか？」 → 「自販機の釣り銭切れ、どうすればいいですか？」
 */
export function generalQuestion(text: string, stores: readonly Store[], max = 80): string {
  const names = stores
    .flatMap((s) => [s.name, ...s.aliases])
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`${escaped}(?:店)?(?:の|で|に|は|、|,|\\s)*`, "g"), "");
  }
  out = out.replace(/^[\s、,。・]+/, "");
  return questionLine(out || text, max);
}

const HAN_OR_KATAKANA = /[㐀-䶿一-鿿豈-﫿々〆ァ-ヺーｦ-ﾟ]/;

/** Polite endings and particles that separate the content words of a short Japanese question. */
const SPLITTER = new RegExp(
  [
    "[\\s\\u3000、。，．,.!?！？「」『』()（）［］\\[\\]・…〜~:：;；/／]+",
    "でしょうか",
    "ですか",
    "ますか",
    "ください",
    "下さい",
    "ません",
    "ました",
    "ます",
    "です",
    "って",
    "から",
    "まで",
    "ので",
    "けど",
    "など",
    "の",
    "は",
    "が",
    "を",
    "に",
    "で",
    "と",
    "も",
    "へ",
    "や",
  ].join("|"),
  "u",
);

/** Everyday words that say nothing about the topic of a question. */
const STOP_WORDS = new Set([
  "お客様",
  "お客さん",
  "客様",
  "本日",
  "今日",
  "明日",
  "昨日",
  "先ほど",
  "先程",
  "連絡",
  "入電",
  "確認",
  "対応",
  "報告",
  "共有",
  "質問",
  "店舗",
  "お願い",
  "お疲れ様",
  "大丈夫",
  "場合",
]);

/** Interrogatives worth keeping as a condition (they make the FAQ fire only on questions). */
const QUESTION_WORDS = ["どこ", "いつ", "何曜", "いくら", "誰", "どれ"] as const;

/** Store names / aliases never belong in an FAQ condition (the answer should work for every store). */
function stripStores(text: string, stores: readonly Store[]): string {
  const names = stores
    .flatMap((s) => [s.name, ...s.aliases])
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of names) out = out.split(name).join(" ");
  return out;
}

/** Content words (kanji / katakana) of a question, in order of appearance, without duplicates. */
export function contentWords(text: string, stores: readonly Store[] = []): string[] {
  const words: string[] = [];
  for (const raw of stripStores(text, stores).split(SPLITTER)) {
    const word = raw.trim();
    if (Array.from(word).length < 2 || !HAN_OR_KATAKANA.test(word) || STOP_WORDS.has(word)) continue;
    if (!words.includes(word)) words.push(word);
  }
  return words;
}

/**
 * Suggested keyword groups for a new FAQ entry (each group: all words must appear).
 * Kept deliberately narrow — two content words — so the automatic answer only fires on the same question.
 */
export function suggestFaqPatterns(text: string, stores: readonly Store[] = []): string[][] {
  const words = contentWords(text, stores);
  const asked = QUESTION_WORDS.find((w) => text.includes(w));
  const groups: string[][] = [];
  if (words.length >= 2) groups.push(words.slice(0, 2));
  else if (words.length === 1) groups.push(asked ? [words[0], asked] : [words[0]]);
  if (words.length >= 2 && asked) groups.push([words[0], asked]);
  return groups;
}

/** "洗剤、補充\n洗剤、どこ" → [["洗剤","補充"],["洗剤","どこ"]] (empty words and lines dropped). */
export function parsePatternLines(input: string): string[][] {
  const groups: string[][] = [];
  for (const line of input.split(/\r?\n/)) {
    const words: string[] = [];
    for (const w of line.split(/[、,，\s　]+/)) {
      const word = w.trim();
      if (word && !words.includes(word)) words.push(word);
    }
    if (words.length > 0) groups.push(words);
  }
  return groups;
}

export function formatPatternLines(groups: readonly (readonly string[])[]): string {
  return groups.map((g) => g.join("、")).join("\n");
}

/** Whether the given keyword groups would answer `text` (same matching as the engine). */
export function patternsMatch(text: string, patterns: string[][]): boolean {
  if (patterns.length === 0) return false;
  const probe: FaqEntry = { id: "probe", patterns, question: "", answer: "", enabled: true };
  return findFaq(normalize(text), [probe]) !== undefined;
}

/** Words of the patterns that do not appear in `text` (to explain why a condition would not match). */
export function missingWords(text: string, patterns: string[][]): string[] {
  // Same matching as the engine (「ごみ」 also finds 「ゴミ」).
  const prepared = matchText(text);
  const missing: string[] = [];
  for (const group of patterns) {
    for (const w of group) {
      const n = normalize(w);
      if (n && !containsWord(prepared, w) && !missing.includes(w)) missing.push(w);
    }
  }
  return missing;
}
