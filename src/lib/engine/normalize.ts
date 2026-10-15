/**
 * Text normalisation shared by every matcher in the engine.
 *
 * - NFKC folds full-width ASCII ("Ｅ２１" → "E21", "？" → "?"), half-width katakana ("ｶﾞ" → "ガ")
 *   and circled digits ("③" → "3") into one canonical form.
 * - Lower-casing makes "E21" / "e21" and "ERROR" / "error" equivalent.
 * - All whitespace is removed (incl. U+3000 full-width spaces and zero-width characters), so
 *   "清掃 完了" and "清掃完了" match the same keyword.
 */

// `\s` already covers U+3000 and U+FEFF; zero-width characters are not whitespace in JS, so they are
// listed explicitly (ZERO WIDTH SPACE / NON-JOINER / JOINER, WORD JOINER).
const WHITESPACE = /[\s​‌‍⁠]+/g;

export function normalize(text: string): string {
  if (!text) return "";
  return text.normalize("NFKC").toLowerCase().replace(WHITESPACE, "");
}

/** Normalises a list of user-entered words and drops the ones that become empty (an empty needle would match everything). */
export function normalizeWords(words: readonly string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const n = normalize(w);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Number of user-perceived characters (code points), used to weigh keyword strength. */
export function charLength(text: string): number {
  return Array.from(text).length;
}

/* ------------------------------------------------------------------ */
/* Matching keys                                                       */
/* ------------------------------------------------------------------ */

// Chat decoration: a long mark or wave dash after hiragana ("はいりまーす", "おわりました〜") and any
// wave dash. A long mark after katakana is part of the word ("エラー") and is kept.
const LONG_MARK_AFTER_HIRAGANA = /([ぁ-ゖ])[ー〜~]+/g;
const WAVE = /[〜~]+/g;
// Katakana letters ァ (U+30A1) … ヴ (U+30F4). ヵ/ヶ are left alone: "緑ヶ丘" keeps its spelling.
const KATAKANA = /[ァ-ヴ]/g;
const HAS_KATAKANA = /[ァ-ヴ]/;

/** `normalize()` plus removal of chat decoration ("はいりまーす" → "はいります"). Same text, shorter. */
export function decorationFree(text: string): string {
  return normalize(text).replace(LONG_MARK_AFTER_HIRAGANA, "$1").replace(WAVE, "");
}

/** Katakana → hiragana, character by character (same length, so positions stay valid). */
export function foldKana(s: string): string {
  return s.replace(KATAKANA, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function hasKatakana(s: string): boolean {
  return HAS_KATAKANA.test(s);
}

/**
 * Key used by the keyword, store and FAQ matchers: decoration-free and kana-folded, so "ミズモレ"
 * matches "みずもれ" and "ｷﾀｸﾞﾁ" matches the alias "きたぐち". Apply it to BOTH the message and the word.
 */
export function matchKey(text: string): string {
  return foldKana(decorationFree(text));
}

/**
 * A message prepared for matching. `folded` and `raw` have the same length, so a position found in
 * one is valid in the other.
 *
 * Matching rule (see `findAll`): hiragana in a word also matches katakana in the message
 * ("みずもれ" ↔ "ミズモレ", alias "きたぐち" ↔ "ｷﾀｸﾞﾁ"), but katakana in a word must be katakana in the
 * message, so "ボヤ" never matches "ぼやけて" and "ガス" never matches "さがす".
 */
export interface MatchText {
  raw: string;
  folded: string;
}

export function matchText(text: string): MatchText {
  const raw = decorationFree(text);
  return { raw, folded: foldKana(raw) };
}

/** A user-entered word in the same form as `MatchText.raw` ("" when it normalises to nothing). */
export function matchNeedle(word: string): string {
  return decorationFree(word);
}

/** Every start index of `needle` (already passed through `matchNeedle`) in the message. */
export function findAll(text: MatchText, needle: string): number[] {
  const found: number[] = [];
  if (!needle) return found;
  const folded = foldKana(needle);
  const katakanaAt = hasKatakana(needle)
    ? Array.from({ length: needle.length }, (_, i) => i).filter((i) => HAS_KATAKANA.test(needle[i]))
    : [];
  let from = 0;
  for (;;) {
    const i = text.folded.indexOf(folded, from);
    if (i < 0) return found;
    if (katakanaAt.every((k) => text.raw[i + k] === needle[k])) found.push(i);
    from = i + 1;
  }
}

/** True when the word appears anywhere in the message (same rules as `findAll`). */
export function containsWord(text: MatchText, word: string): boolean {
  return findAll(text, matchNeedle(word)).length > 0;
}
