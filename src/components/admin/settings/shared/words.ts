/**
 * Word-list helpers shared by the tag inputs (keywords, excludes, aliases, FAQ conditions).
 * Duplicates are detected the same way the engine matches text: NFKC, lower-case, no spaces.
 */
import { normalize } from "@/lib/engine";

/** Separators that split typed or pasted text into several words: 「、」「,」「，」 and line breaks. */
export const WORD_SEPARATOR = /[、,，\r\n\t]+/;

/** Comparison key of a word (「ｴﾗｰ」「エラー」 and 「 エラー 」 are the same word). */
export function wordKey(word: string): string {
  return normalize(word);
}

/** 「水漏れ、漏水,浸水」 → ["水漏れ", "漏水", "浸水"] (trimmed, empty parts dropped). */
export function splitWords(input: string): string[] {
  return input
    .split(WORD_SEPARATOR)
    .map((w) => w.trim())
    .filter((w) => w !== "");
}

/** Trims every word and drops empty words and duplicates (first spelling wins). */
export function cleanWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const key = wordKey(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

export interface AddWordsResult {
  next: string[];
  added: string[];
  /** words that were already in the list (or repeated in the input) */
  duplicates: string[];
}

/** Appends words to a list, skipping ones that are already there. */
export function addWords(list: readonly string[], incoming: readonly string[]): AddWordsResult {
  const seen = new Set(list.map(wordKey));
  const next = [...list];
  const added: string[] = [];
  const duplicates: string[] = [];
  for (const raw of incoming) {
    const word = raw.trim();
    const key = wordKey(word);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push(word);
      continue;
    }
    seen.add(key);
    next.push(word);
    added.push(word);
  }
  return { next, added, duplicates };
}

/** Words present in both lists (compared by key), in the order of `a`. */
export function commonWords(a: readonly string[], b: readonly string[]): string[] {
  const keys = new Set(b.map(wordKey));
  return a.filter((w) => keys.has(wordKey(w)));
}

/** Free-text search: every space-separated term must appear somewhere in `fields`. */
export function matchesQuery(query: string, fields: readonly string[]): boolean {
  const terms = query
    .split(/[\s　]+/)
    .map((t) => normalize(t))
    .filter((t) => t !== "");
  if (terms.length === 0) return true;
  // "|" survives normalisation, so a term never matches across two fields.
  const haystack = normalize(fields.join("|"));
  return terms.every((t) => haystack.includes(t));
}
