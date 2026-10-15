/**
 * Fact extraction: which store, which machine, which error code, how many days, which rule keywords.
 * Everything here works on normalised text (see normalize.ts) and is deterministic.
 */
import type { Extracted, FaqEntry, KeywordRule, Member, MemberRole, Settings, Store } from "../types";
import { findAll, foldKana, matchNeedle, matchText, normalize, type MatchText } from "./normalize";

/* ------------------------------------------------------------------ */
/* Keyword rules                                                       */
/* ------------------------------------------------------------------ */

export interface KeywordMatch {
  /** keyword as written in the rule (for display) */
  keyword: string;
  start: number;
  end: number;
}

export interface RuleHit {
  rule: KeywordRule;
  /** every occurrence of every keyword of this rule, in text order */
  matches: KeywordMatch[];
}

/** A keyword that appeared but was immediately denied: "水漏れはありませんでした", "エラーなく". */
export interface NegatedMatch extends KeywordMatch {
  rule: KeywordRule;
}

/** A keyword occurrence dropped because it overlaps one of the rule's exclude words ("漏れなく"). */
export interface ExcludedMatch extends KeywordMatch {
  rule: KeywordRule;
  /** the exclude word as written in the rule */
  exclude: string;
}

export interface RuleScan {
  hits: RuleHit[];
  negated: NegatedMatch[];
  excluded: ExcludedMatch[];
  /** spans of every exclude word of every applicable rule (used by the analyser's safety net) */
  excludeSpans: Array<[number, number]>;
}

/** Accepts the raw message, an already-normalised string, or a prepared MatchText. */
export type MatchInput = string | MatchText;

function toMatchText(input: MatchInput): MatchText {
  return typeof input === "string" ? matchText(input) : input;
}

/** Godan te-forms used to derive "回ってない" from "回らない" (last kana of the negative stem → te-form). */
const TE_FORM: Record<string, string> = {
  か: "いて",
  が: "いで",
  さ: "して",
  た: "って",
  ら: "って",
  わ: "って",
  な: "んで",
  ば: "んで",
  ま: "んで",
};

/**
 * Everyday conjugations of a plain keyword, so a rule written as "動かない" also matches "動きません",
 * "動かなくなって", "動かず" and "動いてないです", and "止まった" matches "止まりました". Staff write
 * politely or casually, managers register keywords in the plain form. Variants that are not real words
 * are harmless: they never match.
 */
export function keywordVariants(needle: string): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    if (v && v !== needle && !out.includes(v)) out.push(v);
  };
  const swap = (suffix: string, replacements: readonly string[]): boolean => {
    if (!needle.endsWith(suffix) || needle.length <= suffix.length) return false;
    const stem = needle.slice(0, -suffix.length);
    for (const r of replacements) add(stem + r);
    return true;
  };
  if (!needle.endsWith("ません")) {
    // godan negatives first (動かない → 動きません, 回らない → 回りません), then ichidan / する (出ない → 出ません)
    const negatives: Array<[string, string]> = [
      ["かない", "きません"],
      ["らない", "りません"],
      ["わない", "いません"],
      ["たない", "ちません"],
      ["まない", "みません"],
      ["さない", "しません"],
    ];
    if (!negatives.some(([suffix, polite]) => swap(suffix, [polite]))) swap("ない", ["ません"]);
  }
  if (needle.endsWith("ない") && needle.length > 2) {
    // 動かない → 動かなく(なった) / 動かなかった / 動かず, and te-form negatives: 動いてない / 動いていません
    const stem = needle.slice(0, -2);
    add(`${stem}なく`);
    add(`${stem}なかった`);
    add(stem.endsWith("し") ? `${stem.slice(0, -1)}せず` : `${stem}ず`);
    const last = stem.slice(-1);
    const te = TE_FORM[last] ? stem.slice(0, -1) + TE_FORM[last] : `${stem}て`;
    for (const tail of ["ない", "いない", "ません", "いません", "なく", "いなく"]) add(te + tail);
  }
  if (!needle.endsWith("ました")) {
    // 止まった → 止まりました / 使った → 使いました / 倒れた → 倒れました
    if (!swap("った", ["りました", "いました", "ちました"])) swap("た", ["ました"]);
  }
  swap("る", ["ります", "ます"]); // 止まる → 止まります, 溢れる → 溢れます
  return out;
}

/** A rule applies to a sender when it has no role filter or lists the sender's role. */
export function ruleAppliesTo(rule: KeywordRule, role: MemberRole): boolean {
  return rule.roles.length === 0 || rule.roles.includes(role);
}

/* ---- negation -------------------------------------------------------------------------------- */

/**
 * What may follow an incident word to deny it, checked on the kana-folded text right after the word:
 *   水漏れ|はありませんでした   異臭|もなく   けが人|なし   停電|の予定はありません   エラー|は出ていません
 *   破損|などもありませんでした   けがを|しないように（注意）   壊れ|てはいない
 * The look-aheads keep "エラーがなくならない" and "…ないでください" positive. Fault words that are already
 * negative ("動かない", "反応なし") are never treated as denied.
 */
const NEGATION_AFTER = new RegExp(
  [
    "^(?:く|い(?:におい|匂い|臭い|感じ)?)?",
    "(?:人|類|表示)?(?:等|など|とか)?",
    "(?:の(?:異常|トラブル|予定|心配|恐れ|おそれ|影響|形跡|跡|気配|様子|兆候|問題|発生|被害|報告|連絡|表示))?",
    "(?:は|が|も|等|など|なども|などは|とか|は特に|も特に)?",
    "(?:一切|特に|全く|まったく|全然|ぜんぜん|何も|なにも)?",
    "(?:ありません|ございません|なし|無し|しません|しない(?!よう)|しなかった|いない|いません|いなかった|おりません|おらず|ない(?!でくだ|で下さ|でほし|で欲し)|無い|なく(?!な)|無く(?!な)|",
    "なかった|無かった|なさそう|なさげ|大丈夫|問題(?:ありません|なし|ない)|",
    "見当たりません|見当たらない|みあたらない|見られません|みられません|",
    "出ていません|でていません|出てません|でてません|出ていない|出てない|でてない|出なかった|でなかった|",
    "起きていません|起きてない|起きていない|おきていません|おきてない|",
    "していません|してません|していない|してない|しておりません|しなかった|",
    "発生していません|発生してない|発生していない|確認されません|確認されていません|確認されなかった|",
    "確認できません|確認できなかった|ぜろ|0件|0人)",
    "|^(?:を|に|が)?(?:しないよう|ならないよう|気をつけ|気を付け|注意し)",
    "|^て(?:は|も)?い?(?:ない|ません|なかった|おりません)",
  ].join(""),
);
/** Clause boundary for the negation look-ahead and for "A+B" keywords. */
const CLAUSE_END = /[。!?\n]/;
const NEGATION_WINDOW = 24;
const ALREADY_NEGATIVE = /(?:ない|ません|なし|無し|ず|なく|なかった)$/;

function isNegated(text: MatchText, end: number, needle: string): boolean {
  if (ALREADY_NEGATIVE.test(foldKana(needle))) return false;
  return isDeniedAfter(text, end);
}

/** "…ないか" / "…ませんか" asks whether something is wrong — a denial only when the check was done. */
const ASKS_WHETHER = /(?:ない|ません|いない)か/;
const CHECK_DONE = /確認し(?:ました|た|てい)|確認済|見ました|見てきました|チェックし(?:ました|た)|点検し(?:ました|た)|調べ(?:ました|た)/;

/**
 * True when the text right after `end` denies what came before ("…はありませんでした", "…なし").
 * "水漏れしてないか確認お願いします" is a request, not a denial; "水漏れがないか確認しました" is a denial.
 */
export function isDeniedAfter(input: MatchInput, end: number): boolean {
  const text = toMatchText(input);
  let tail = text.folded.slice(end, end + NEGATION_WINDOW);
  const stop = tail.search(CLAUSE_END);
  if (stop >= 0) tail = tail.slice(0, stop);
  if (!NEGATION_AFTER.test(tail)) return false;
  const asks = ASKS_WHETHER.exec(tail);
  if (asks && asks.index <= 10 && !CHECK_DONE.test(tail.slice(asks.index))) return false;
  return true;
}

/** The sentence (between 。!? or newlines) that contains `index`. */
function sentenceSpan(text: MatchText, index: number): [number, number] {
  const s = text.folded;
  let from = index;
  while (from > 0 && !CLAUSE_END.test(s[from - 1])) from--;
  let to = index;
  while (to < s.length && !CLAUSE_END.test(s[to])) to++;
  return [from, to];
}

/** Splits a rule keyword into its parts: "残って+洗濯物" → ["残って", "洗濯物"] (all must be in one sentence). */
export function keywordParts(keyword: string): string[] {
  return keyword
    .split(/[+＋]/)
    .map((p) => matchNeedle(p))
    .filter(Boolean);
}

/** Display form of a rule keyword: "残って+洗濯物" → "残って・洗濯物". */
export function displayKeyword(keyword: string): string {
  return keyword
    .split(/[+＋]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("・");
}

/**
 * Evaluates every enabled rule against a message.
 *  - Excludes are LOCAL: an exclude word only removes the keyword occurrences it overlaps
 *    ("漏れなく" ignores the 水漏れ in "水漏れなく確認", not a later "水漏れしています"), so one harmless
 *    phrase can never switch off a real alarm elsewhere in the message.
 *  - "A+B" keywords need every part in the same sentence ("残って+洗濯物").
 *  - Incident words that are immediately denied ("水漏れはありませんでした") are moved to `negated`.
 */
export function scanRules(input: MatchInput, rules: readonly KeywordRule[], role: MemberRole): RuleScan {
  const text = toMatchText(input);
  const scan: RuleScan = { hits: [], negated: [], excluded: [], excludeSpans: [] };
  if (!text.raw) return scan;
  for (const rule of rules) {
    if (!rule.enabled || !ruleAppliesTo(rule, role)) continue;
    const excludeSpans: Array<{ start: number; end: number; word: string }> = [];
    for (const word of rule.excludes) {
      const needle = matchNeedle(word);
      for (const at of findAll(text, needle)) excludeSpans.push({ start: at, end: at + needle.length, word: word.trim() });
    }
    for (const span of excludeSpans) scan.excludeSpans.push([span.start, span.end]);
    const overlapping = (start: number, end: number) => excludeSpans.find((x) => start < x.end && x.start < end);

    const matches: KeywordMatch[] = [];
    const seen = new Set<string>();
    const tryNeedle = (needle: string, display: string, extra: readonly string[]) => {
      for (const start of findAll(text, needle)) {
        const end = start + needle.length;
        const ex = overlapping(start, end);
        if (ex) {
          scan.excluded.push({ rule, keyword: display, start, end, exclude: ex.word });
          continue;
        }
        const parts: KeywordMatch[] = [];
        if (extra.length > 0) {
          const [from, to] = sentenceSpan(text, start);
          const sentence: MatchText = { raw: text.raw.slice(from, to), folded: text.folded.slice(from, to) };
          for (const part of extra) {
            const at = findAll(sentence, part).find((i) => !overlapping(from + i, from + i + part.length));
            if (at === undefined) break;
            parts.push({ keyword: part, start: from + at, end: from + at + part.length });
          }
          if (parts.length < extra.length) continue;
        }
        if (isNegated(text, end, needle)) {
          scan.negated.push({ rule, keyword: display, start, end });
          continue;
        }
        matches.push({ keyword: display, start, end }, ...parts);
      }
    };
    for (const keyword of rule.keywords) {
      const [needle, ...extra] = keywordParts(keyword);
      if (!needle) continue;
      const signature = [needle, ...extra].join("+");
      if (seen.has(signature)) continue;
      seen.add(signature);
      // Single words are displayed as written in the rule; "A+B" shows its first part (the others follow).
      tryNeedle(needle, extra.length > 0 ? (keyword.split(/[+＋]/)[0] ?? "").trim() : keyword.trim(), extra);
      // Conjugated variants are displayed as written in the message ("動きません"), not as the rule keyword.
      for (const variant of keywordVariants(needle)) {
        const sig = [variant, ...extra].join("+");
        if (seen.has(sig)) continue;
        seen.add(sig);
        tryNeedle(variant, variant, extra);
      }
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.start - b.start || b.end - a.end);
      scan.hits.push({ rule, matches });
    }
  }
  return scan;
}

/** Rule hits only (see `scanRules`). Accepts the raw message or normalised text. */
export function matchRules(input: MatchInput, rules: readonly KeywordRule[], role: MemberRole): RuleHit[] {
  return scanRules(input, rules, role).hits;
}

/**
 * Picks non-overlapping matches (earliest first, longest on ties) and returns their keywords in
 * text order without duplicates — "清掃完了しました" yields ["清掃完了"], not also "完了しました".
 */
export function distinctKeywords(matches: readonly KeywordMatch[]): string[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: string[] = [];
  let lastEnd = -1;
  for (const m of sorted) {
    if (m.start < lastEnd) continue;
    lastEnd = m.end;
    if (!out.includes(m.keyword)) out.push(m.keyword);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface StoreDetection {
  store: Store;
  /** "text": named in the message; "sender": inferred because the sender covers exactly one store */
  from: "text" | "sender";
}

/**
 * The store a message is about.
 *  - Without `anchor`: the store named first in the text.
 *  - With `anchor` (position of the main keyword): the last store named before it, so a call-center
 *    summary "①駅前店：…説明済み ②南町店：洗濯機2番が回らない" is filed under 南町店.
 *  - No store named: the sender's only store, if they cover exactly one.
 */
export function detectStore(
  input: MatchInput,
  stores: readonly Store[],
  sender: Member,
  anchor?: number,
): StoreDetection | undefined {
  const text = toMatchText(input);
  const found: Array<{ store: Store; index: number; length: number }> = [];
  for (const store of stores) {
    for (const word of [store.name, ...store.aliases]) {
      const needle = matchNeedle(word);
      for (const index of findAll(text, needle)) found.push({ store, index, length: needle.length });
    }
  }
  if (found.length > 0) {
    found.sort((a, b) => a.index - b.index || b.length - a.length);
    if (anchor !== undefined) {
      const before = found.filter((f) => f.index <= anchor);
      if (before.length > 0) return { store: before[before.length - 1].store, from: "text" };
    }
    return { store: found[0].store, from: "text" };
  }
  if (sender.storeIds.length === 1) {
    const own = stores.find((s) => s.id === sender.storeIds[0]);
    if (own) return { store: own, from: "sender" };
  }
  return undefined;
}

/** Every store named in the text, in order of first mention. */
export function storesNamed(input: MatchInput, stores: readonly Store[]): Store[] {
  const text = toMatchText(input);
  const firstAt = new Map<string, number>();
  for (const store of stores) {
    for (const word of [store.name, ...store.aliases]) {
      const at = findAll(text, matchNeedle(word))[0];
      if (at !== undefined && (!firstAt.has(store.id) || at < (firstAt.get(store.id) ?? Infinity))) firstAt.set(store.id, at);
    }
  }
  return stores.filter((s) => firstAt.has(s.id)).sort((a, b) => (firstAt.get(a.id) ?? 0) - (firstAt.get(b.id) ?? 0));
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

const KANJI_DIGITS: Record<string, number> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** "12" → 12, "三" → 3, "十五" → 15, "二十" → 20. Returns null for anything else. */
export function parseJapaneseNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (!s) return null;
  let total = 0;
  let current = 0;
  let sawTen = false;
  for (const ch of Array.from(s)) {
    if (ch === "十") {
      if (sawTen) return null;
      total += (current || 1) * 10;
      current = 0;
      sawTen = true;
    } else if (ch in KANJI_DIGITS) {
      current = current * 10 + KANJI_DIGITS[ch];
    } else {
      return null;
    }
  }
  return total + current;
}

/* ------------------------------------------------------------------ */
/* Machine                                                             */
/* ------------------------------------------------------------------ */

/** Machine words, longest first so "洗濯乾燥機" wins over "乾燥機". Already in normalised form. */
const MACHINE_TYPES = [
  "スニーカーランドリー",
  "スニーカー洗濯機",
  "スニーカー乾燥機",
  "ドラム式洗濯機",
  "コイン両替機",
  "洗濯乾燥機",
  "自動販売機",
  "洗剤販売機",
  "洗剤自販機",
  "両替機",
  "洗濯機",
  "乾燥機",
  "脱水機",
  "自販機",
  "券売機",
  "精算機",
];
const TYPES = MACHINE_TYPES.join("|");
const KANJI_NUM = "[一二三四五六七八九十]{1,3}";
const SUFFIX = "(番機|号機|番台|番|号|台目)";
/** Characters that mean the number after a machine word is a quantity, not a machine number ("乾燥機10分"). */
const UNIT_AFTER_NUMBER = /^(?:[0-9分時円回度枚日秒個週月年人件台本袋着点%℃]|kg)/;

const RE_TYPE_THEN_NUMBER = new RegExp(`(${TYPES})の?(?:no\\.?|#)?(\\d{1,2}|${KANJI_NUM})${SUFFIX}?`, "g");
const RE_NUMBER_THEN_TYPE = new RegExp(`(^|[^0-9])(?:no\\.?|#)?(\\d{1,2})${SUFFIX}の?(${TYPES})`, "g");
const RE_NUMBER_ONLY = new RegExp(`(^|[^0-9])(?:no\\.?|#)?(\\d{1,2})(番機|号機|番台|番)`, "g");
const RE_TYPE = new RegExp(`(${TYPES})`, "g");

/**
 * "乾燥機3番" / "乾燥機の3番" / "洗濯機2号機" / "4番の洗濯機" / "乾燥機No.3" → "<type><n>番",
 * "両替機" → "両替機", "3番の機械" → "3番の機械" (or "<type>3番" when exactly one machine type is mentioned).
 */
export function detectMachine(norm: string): string | undefined {
  let best: { index: number; label: string } | undefined;
  const consider = (index: number, label: string) => {
    if (!best || index < best.index) best = { index, label };
  };

  for (const m of norm.matchAll(RE_TYPE_THEN_NUMBER)) {
    const [whole, type, num, suffix] = m;
    const index = m.index ?? 0;
    if (!suffix && UNIT_AFTER_NUMBER.test(norm.slice(index + whole.length))) continue;
    const n = parseJapaneseNumber(num);
    if (n === null || n === 0) continue;
    consider(index, `${type}${n}番`);
  }
  for (const m of norm.matchAll(RE_NUMBER_THEN_TYPE)) {
    const [, prefix, num, , type] = m;
    const n = Number(num);
    if (n === 0) continue;
    consider((m.index ?? 0) + prefix.length, `${type}${n}番`);
  }
  if (best) return best.label;

  const types = Array.from(norm.matchAll(RE_TYPE), (m) => m[1]);
  const distinctTypes = Array.from(new Set(types));
  for (const m of norm.matchAll(RE_NUMBER_ONLY)) {
    const n = Number(m[2]);
    if (n === 0) continue;
    return distinctTypes.length === 1 ? `${distinctTypes[0]}${n}番` : `${n}番の機械`;
  }
  return types[0];
}

/* ------------------------------------------------------------------ */
/* Error code                                                          */
/* ------------------------------------------------------------------ */

const RE_CODE = /(^|[^a-z0-9])([euhf])-?(\d{1,3})(?![0-9])/;
const RE_CODE_AFTER_WORD = /エラー(?:コード|番号|表示|no\.?)?(?:は|が|:)?([a-z]?)-?(\d{1,3})(?![0-9]|番|号|台|時|分|円|回|日|秒|枚|個|件)/;

/** "E21" / "e-21" / "Ｅ２１" / "エラー21" / "エラーコードU05" → "E21", "U05". */
export function detectErrorCode(norm: string): string | undefined {
  const direct = RE_CODE.exec(norm);
  const worded = RE_CODE_AFTER_WORD.exec(norm);
  const directAt = direct ? direct.index + direct[1].length : Infinity;
  const wordedAt = worded ? worded.index : Infinity;
  if (direct && directAt <= wordedAt) return `${direct[2].toUpperCase()}${direct[3]}`;
  if (worded) return `${(worded[1] || "e").toUpperCase()}${worded[2]}`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

const RE_DURATION = new RegExp(
  `(^|[^0-9月])(\\d{1,3}|${KANJI_NUM})(日|週間|週|か月|ヶ月|カ月|ケ月|ヵ月)(?!曜|\\()`,
);

/** "3日" / "三日" / "3日間" → 3, "1週間" → 7, "昨日から" → 1, "おとといから" → 2. Dates like "10月3日" are ignored. */
export function detectDays(norm: string): number | undefined {
  const m = RE_DURATION.exec(norm);
  if (m) {
    const n = parseJapaneseNumber(m[2]);
    if (n !== null && n > 0) {
      const unit = m[3];
      if (unit === "日") return n;
      if (unit.startsWith("週")) return n * 7;
      return n * 30;
    }
  }
  if (/(一昨日|おととい)(から|より)/.test(norm)) return 2;
  if (/(昨日|きのう|昨晩|昨夜)(から|より)/.test(norm)) return 1;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

export interface FaqMatch {
  faq: FaqEntry;
  /** keyword groups that matched completely (as written in the FAQ) */
  groups: string[][];
}

/**
 * Best enabled FAQ whose keyword groups match: most matching groups, then most matched characters.
 * Hiragana words also match katakana spellings ("ごみ" ↔ "ゴミ"). Accepts the raw message or normalised text.
 */
export function findFaq(input: MatchInput, faqs: readonly FaqEntry[]): FaqMatch | undefined {
  const text = toMatchText(input);
  let best: { match: FaqMatch; weight: number } | undefined;
  if (!text.raw) return undefined;
  for (const faq of faqs) {
    if (!faq.enabled) continue;
    const groups: string[][] = [];
    let weight = 0;
    for (const group of faq.patterns) {
      const words = group.map(matchNeedle).filter(Boolean);
      if (words.length === 0) continue;
      if (words.every((w) => findAll(text, w).length > 0)) {
        groups.push(group.map((w) => w.trim()).filter(Boolean));
        weight += words.reduce((sum, w) => sum + w.length, 0);
      }
    }
    if (groups.length === 0) continue;
    if (
      !best ||
      groups.length > best.match.groups.length ||
      (groups.length === best.match.groups.length && weight > best.weight)
    ) {
      best = { match: { faq, groups }, weight };
    }
  }
  return best?.match;
}

/* ------------------------------------------------------------------ */
/* Emergency wording                                                   */
/* ------------------------------------------------------------------ */

export type EmergencyKind = "water" | "fire" | "electric" | "injury" | "security" | "claim" | "generic";

/**
 * Word stems → kind of emergency and a short noun for alert titles. A keyword matches a hint when it
 * starts with one of the stems (after kana folding), so "水漏れしています" and "ミズモレ" both read 水漏れ.
 * Order matters: the first hint that matches wins.
 */
const EMERGENCY_HINTS: Array<{ words: string[]; kind: EmergencyKind; noun: string }> = [
  { words: ["水漏", "水もれ", "みずもれ", "漏水", "水が漏れ", "水がもれ", "水浸", "水びたし", "水だらけ", "浸水", "逆流", "あふれ", "溢れ", "水が溢", "水があふ", "びしょびしょ", "水がたまって", "水が溜まって", "雨漏り", "天井から水", "水が垂れ", "水がたれ", "水がぽたぽた", "破裂"], kind: "water", noun: "水漏れ" },
  { words: ["火事", "火災", "発火", "燃えて", "燃え", "ボヤ", "小火", "火が出", "火が上", "火が", "火花"], kind: "fire", noun: "火災の恐れ" },
  { words: ["煙", "けむり", "けむい"], kind: "fire", noun: "発煙" },
  { words: ["焦げ臭", "焦げくさ", "こげくさ", "焦げ"], kind: "fire", noun: "焦げ臭いにおい" },
  { words: ["ガス"], kind: "fire", noun: "ガス漏れの恐れ" },
  { words: ["異臭", "変なにおい", "変な臭い", "変な匂い"], kind: "fire", noun: "異臭" },
  { words: ["異常に熱", "熱すぎ", "すごく熱"], kind: "fire", noun: "異常な発熱" },
  { words: ["爆発"], kind: "fire", noun: "爆発の恐れ" },
  { words: ["漏電", "感電", "ビリっと", "ビリッと", "びりっと", "ビリビリ"], kind: "electric", noun: "漏電・感電の恐れ" },
  { words: ["停電", "ブレーカー", "真っ暗", "照明が全部消え", "電気が全部消え"], kind: "electric", noun: "停電" },
  { words: ["けが", "怪我", "出血", "血が", "挟まれ", "転倒", "転んで", "転び", "やけど", "火傷", "切った", "骨折"], kind: "injury", noun: "けが人の発生" },
  { words: ["救急", "倒れて", "倒れた", "119", "意識", "声をかけても"], kind: "injury", noun: "急病人・救急対応" },
  { words: ["激怒", "怒鳴", "お怒り", "大変怒", "かなり怒", "怒って", "訴える", "訴訟", "弁護士", "消費者センター", "警察を呼", "返金しろ", "責任者", "店長を"], kind: "claim", noun: "強いクレーム" },
  { words: ["警察", "110番"], kind: "security", noun: "警察対応" },
  { words: ["不審", "怪しい人", "あやしい人", "知らない人"], kind: "security", noun: "不審者" },
  { words: ["盗難", "泥棒", "盗まれ", "盗られ", "こじ開け", "開けられた", "いじられ", "荒らされ", "侵入", "空き巣"], kind: "security", noun: "盗難・侵入の恐れ" },
  { words: ["酔っ払い", "酔っぱらい", "暴れて"], kind: "security", noun: "店内での迷惑行為" },
  { words: ["割られ", "割れて", "破損", "壊され"], kind: "security", noun: "設備の破損" },
  { words: ["閉じ込め", "出られない"], kind: "security", noun: "閉じ込め" },
];

const HINT_KEYS = EMERGENCY_HINTS.map((h) => ({ ...h, keys: h.words.map((w) => foldKana(matchNeedle(w))) }));

/** Classifies the first emergency keyword (text order) into a kind and a short noun for titles. */
export function describeEmergency(keywords: readonly string[]): { kind: EmergencyKind; noun: string } {
  for (const keyword of keywords) {
    const k = foldKana(matchNeedle(keyword.split(/[+＋]/)[0] ?? ""));
    if (!k) continue;
    const hint = HINT_KEYS.find((h) => h.keys.some((w) => k.startsWith(w)));
    if (hint) return { kind: hint.kind, noun: hint.noun };
  }
  return { kind: "generic", noun: "緊急トラブル" };
}

/* ------------------------------------------------------------------ */
/* Public extract()                                                    */
/* ------------------------------------------------------------------ */

export function extract(text: string, photoCount: number, settings: Settings, sender: Member): Extracted {
  const norm = normalize(text);
  const prepared = matchText(text);
  const hits = matchRules(prepared, settings.keywordRules, sender.role);
  const result: Extracted = {
    hasPhoto: photoCount > 0,
    keywords: distinctKeywords(hits.flatMap((h) => h.matches)),
  };
  const store = detectStore(prepared, settings.stores, sender);
  if (store) result.storeId = store.store.id;
  const machine = detectMachine(norm);
  if (machine) result.machine = machine;
  const errorCode = detectErrorCode(norm);
  if (errorCode) result.errorCode = errorCode;
  const days = detectDays(norm);
  if (days !== undefined) result.days = days;
  return result;
}
