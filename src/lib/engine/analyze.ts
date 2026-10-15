/**
 * Message classification.
 *
 * Deterministic "sample AI": keyword rules + FAQ + manager-corrected examples, with a confidence
 * score and an AI-style Japanese explanation. In production the same result is passed to the Claude
 * classifier as `ruleGuess`, so this module also defines the safety floor (emergencies are never
 * downgraded, uncertain results go to a human, words that hint at danger are never answered with a
 * routine reply).
 */
import type {
  Analysis,
  Category,
  EngineInput,
  Extracted,
  FaqEntry,
  LearnedExample,
  Member,
  Settings,
  Urgency,
} from "../types";
import { CATEGORY_LABELS, URGENCY_LABELS } from "../types";
import {
  describeEmergency,
  detectStore,
  displayKeyword,
  distinctKeywords,
  extract,
  findFaq,
  isDeniedAfter,
  scanRules,
  type FaqMatch,
  type KeywordMatch,
  type NegatedMatch,
  type RuleHit,
  type StoreDetection,
} from "./extract";
import { charLength, findAll, matchNeedle, matchText, normalize, type MatchText } from "./normalize";
import { similarity } from "./similarity";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** A corrected example is reused when the new message is at least this similar. */
export const LEARNED_SIMILARITY_THRESHOLD = 0.72;
/** Confidence of a staff photo with no recognisable text (treated as a completion report). */
export const PHOTO_ONLY_CONFIDENCE = 0.6;
/** Confidence reported when nothing matched at all. */
export const FALLBACK_CONFIDENCE = 0.3;
export const MIN_RULE_CONFIDENCE = 0.55;
export const MAX_RULE_CONFIDENCE = 0.97;
/** Confidence of a whole-message acknowledgement ("はーい", "👍") and of an all-clear report. */
const ACK_CONFIDENCE = 0.72;

/** Tie-break order between categories of the same urgency (first wins). */
export const CATEGORY_PRIORITY: readonly Category[] = [
  "emergency",
  "machine_error",
  "leftover",
  "question",
  "cleaning_done",
  "cleaning_start",
  "info",
  "chat",
  "unknown",
];

export const URGENCY_RANK: Record<Urgency, number> = { normal: 0, attention: 1, urgent: 2 };

export function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}

/** Categories that never need a human by themselves. */
const ROUTINE: ReadonlySet<Category> = new Set<Category>(["cleaning_start", "cleaning_done", "info", "chat"]);

/* ------------------------------------------------------------------ */
/* Safety cues                                                         */
/* ------------------------------------------------------------------ */

/** Whole-message acknowledgements: matched against the WHOLE message only, never as a substring. */
const ACKS = new Set([
  "はい",
  "はいはい",
  "りょ",
  "りょです",
  "りょうかい",
  "りょうかいです",
  "了解",
  "了解です",
  "了解しました",
  "了解いたしました",
  "承知",
  "承知です",
  "承知しました",
  "承知いたしました",
  "かしこまりました",
  "おけ",
  "おけです",
  "ok",
  "okです",
  "おk",
  "おっけ",
  "おっけです",
  "いえいえ",
  "どうも",
  "どうもです",
  "わかりました",
  "分かりました",
]);
const SYMBOLS = /[\p{Extended_Pictographic}\p{Emoji_Component}\p{P}\p{S}ー〜~]/gu;
const ONLY_SYMBOLS = /^[\p{Extended_Pictographic}\p{Emoji_Component}\p{P}\p{S}ー〜~w笑]+$/u;
/** Polite fillers that do not change what a greeting says ("お疲れ様です！本日もよろしくお願いします"). */
const FILLERS = /ございました|ございます|いたします|しました|します|でした|です|ます|本日も|今日も|明日も|引き続き|みなさん|皆さん|皆様|助かりました|助かります|ほんとうに|本当に|いつも|一日|今日|本日|明日/g;
/** Leftover text above this many characters means a greeting came with a real report. */
const CHAT_RESIDUAL_MAX = 12;

/** A staff photo counts as a completion report only with no text, a greeting, or a word like these. */
const COMPLETION_HINT = /完|終わ|おわ|終了|済み|済です|すみです|退店|撤収|片付け|片づけ|かたづけ|きれいに|綺麗に|ぴかぴか|写真|しゃしん|送ります|おくります/;

/** Explicit urgency words raise the main concern to 「緊急」 (the category itself is kept). */
const URGENCY_MARKERS = ["大至急", "至急", "緊急", "早急に", "すぐ来て", "すぐきて", "すぐに来て", "助けて", "たすけて"];
/** "…ではない" / "緊急連絡先" do not make a message urgent. */
const MARKER_DENIED = /^(?:で(?:は)?(?:ない|なく|ありません)|じゃない|性は(?:ない|ありません)|連絡先|時|の際|のとき|の場合|ではなくて)/;

/** A fault the sender says is already fixed ("リセットしたら直りました", "今は正常です"). */
const RESOLVED = /直りました|なおりました|直った|なおった|直しました|直しておきました|解消しました|解消済|解消した|解消されました|復旧しました|復旧済|復旧した|正常に戻|正常になりました|普通に動きました|正常に動いて|問題なく動|今は正常|取り除きました|取り除いた|返金対応済|返金済|対応済み|対応済|もう大丈夫/g;
const NOT_RESOLVED = /直りません|直らない|なおらない|なおりません|解消しない|解消されない|解消しません|復旧しない|復旧しません|正常に戻らない/;

/**
 * Last-resort danger words, used when no rule recognised a concern. "Strong" ones are treated as urgent
 * (never answered with a routine reply, phone call at night); "weak" ones still go to a human.
 */
const DANGER_STRONG = [
  "煙", "けむり", "火事", "火災", "火が", "火花", "発火", "燃えて", "燃えた", "燃えそう", "焦げ", "こげくさ", "ボヤ", "爆発",
  "水漏", "水もれ", "みずもれ", "漏水", "漏れて", "もれて", "あふれ", "溢れ", "逆流", "水浸", "水びたし", "水だらけ",
  "びしょびしょ", "びちょびちょ", "水たまり", "水がたまって", "水が溜まって", "血", "救急", "警察", "盗", "泥棒", "侵入",
  "不審", "鍵穴", "ガス", "感電", "漏電", "ビリ", "びりびり", "閉じ込", "挟まれ", "やけど", "火傷", "破裂", "変なにおい", "変な臭い", "変な匂い", "異臭", "真っ暗", "停電", "酔っ払い", "酔っぱらい", "暴れ",
];
const DANGER_WEAK = ["臭い", "におい", "匂い", "くさい", "割れ", "壊", "怒", "やばい", "熱い", "熱く", "危ない", "危険", "怖い", "濡れ", "いたずら", "落書き", "倒れ", "騒いで"];
/** Phrases in which a danger stem is harmless. */
const DANGER_SAFE = [
  "たばこ", "煙草", "喫煙", "禁煙", "燃えるごみ", "燃えないごみ", "洗剤のにおい", "洗剤の匂い", "柔軟剤", "いい匂い", "いいにおい", "良い匂い",
  "盗難防止", "盗難対策", "警察の巡回", "緊急連絡先", "緊急時", "救急箱", "血圧", "火曜", "連絡漏れ",
];

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

interface Candidate {
  category: Category;
  urgency: Urgency;
  /** distinct keywords in text order (for display and strength) */
  keywords: string[];
  /** every occurrence, in text order (positions in the decoration-free text) */
  matches: KeywordMatch[];
}

function buildCandidates(hits: readonly RuleHit[]): Candidate[] {
  const byCategory = new Map<Category, { urgency: Urgency; matches: KeywordMatch[] }>();
  for (const hit of hits) {
    const entry = byCategory.get(hit.rule.category);
    if (entry) {
      entry.urgency = maxUrgency(entry.urgency, hit.rule.urgency);
      entry.matches.push(...hit.matches);
    } else {
      byCategory.set(hit.rule.category, { urgency: hit.rule.urgency, matches: [...hit.matches] });
    }
  }
  const candidates: Candidate[] = [];
  byCategory.forEach((v, category) => {
    const matches = [...v.matches].sort((a, b) => a.start - b.start || b.end - a.end);
    candidates.push({ category, urgency: v.urgency, keywords: distinctKeywords(matches), matches });
  });
  return candidates.sort(compareCandidates);
}

function compareCandidates(a: { category: Category; urgency: Urgency }, b: { category: Category; urgency: Urgency }): number {
  return (
    URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] ||
    CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category)
  );
}

/** Other detected categories, most important first; "chat" is noise next to a real category. */
function secondaryOf(candidates: readonly Candidate[], primary: Category): Category[] {
  return candidates.map((c) => c.category).filter((c) => c !== primary && c !== "chat");
}

/** Spans of the message in which a danger stem is harmless (safe phrases, rule excludes, denied words). */
function safeSpans(text: MatchText, excludeSpans: ReadonlyArray<[number, number]>, negated: readonly NegatedMatch[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [...excludeSpans, ...negated.map((n): [number, number] => [n.start, n.end])];
  for (const phrase of DANGER_SAFE) {
    const needle = matchNeedle(phrase);
    for (const at of findAll(text, needle)) spans.push([at, at + needle.length]);
  }
  return spans;
}

function findCues(text: MatchText, words: readonly string[], safe: ReadonlyArray<[number, number]>): string[] {
  const out: string[] = [];
  for (const word of words) {
    const needle = matchNeedle(word);
    const ok = findAll(text, needle).some((at) => !safe.some(([s, e]) => at < e && s < at + needle.length));
    if (ok && !out.includes(word)) out.push(word);
  }
  return out;
}

function urgencyMarker(text: MatchText): string | undefined {
  for (const marker of URGENCY_MARKERS) {
    const needle = matchNeedle(marker);
    for (const at of findAll(text, needle)) {
      if (MARKER_DENIED.test(text.folded.slice(at + needle.length, at + needle.length + 12))) continue;
      return marker;
    }
  }
  return undefined;
}

/** The resolved cue when every fault word comes before a "fixed" phrase ("…止まりましたが、直りました"). */
function resolvedCue(text: MatchText, fault: Candidate): string | undefined {
  if (NOT_RESOLVED.test(text.folded)) return undefined;
  let last: { word: string; at: number } | undefined;
  for (const m of text.folded.matchAll(RESOLVED)) last = { word: m[0], at: m.index ?? 0 };
  if (!last) return undefined;
  const lastFault = Math.max(...fault.matches.map((m) => m.start));
  return lastFault <= last.at ? last.word : undefined;
}

/** Is `[start, end)` inside a sentence that also contains a match of `other`? */
function sameSentence(text: MatchText, m: KeywordMatch, other: readonly KeywordMatch[]): boolean {
  const s = text.folded;
  let from = m.start;
  while (from > 0 && !/[。!?\n]/.test(s[from - 1])) from--;
  let to = m.end;
  while (to < s.length && !/[。!?\n]/.test(s[to])) to++;
  // "?" itself is a sentence end, so look one character past the sentence too.
  return other.some((o) => o.start >= from && o.start <= to);
}

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clampConfidence = (n: number): number => round2(Math.min(MAX_RULE_CONFIDENCE, Math.max(MIN_RULE_CONFIDENCE, n)));

/**
 * Rule confidence:
 *   base by the strongest keyword (≥4 chars: 0.80, 2–3: 0.72, 1 char such as "?": 0.60), +0.06 for urgent rules
 *   + 0.05 per additional distinct keyword (max +0.10)
 *   + category evidence (photo for a completion report, error code / machine for a fault, days for leftovers)
 *   + store named in the text (+0.04) or inferred from the sender (+0.02)
 *   − 0.05 per competing category of the same urgency (max −0.10)
 *   clamped to 0.55–0.97.
 */
function ruleConfidence(primary: Candidate, all: readonly Candidate[], extracted: Extracted, store: StoreDetection | undefined): number {
  const longest = Math.max(1, ...primary.keywords.map((k) => charLength(normalize(k))));
  let c = longest >= 4 ? 0.8 : longest >= 2 ? 0.72 : 0.6;
  // Urgent rules are written as narrow, unambiguous phrases (水漏れ, 焦げ臭…), so a hit is stronger evidence.
  if (primary.urgency === "urgent") c += 0.06;
  c += Math.min(0.1, 0.05 * (primary.keywords.length - 1));
  switch (primary.category) {
    case "cleaning_done":
      if (extracted.hasPhoto) c += 0.08;
      break;
    case "machine_error":
      if (extracted.errorCode) c += 0.06;
      if (extracted.machine) c += 0.03;
      break;
    case "leftover":
      if (extracted.days !== undefined) c += 0.04;
      if (extracted.machine) c += 0.03;
      if (extracted.hasPhoto) c += 0.02;
      break;
    case "emergency":
      if (extracted.hasPhoto) c += 0.02;
      break;
    default:
      break;
  }
  if (store) c += store.from === "text" ? 0.04 : 0.02;
  const rivals = all.filter((o) => o !== primary && o.category !== "chat" && o.urgency === primary.urgency).length;
  c -= Math.min(0.1, 0.05 * rivals);
  return clampConfidence(c);
}

function faqConfidence(match: FaqMatch, question: Candidate): number {
  let c = 0.8 + Math.min(0.08, 0.04 * (match.groups.length - 1));
  if (question.keywords.length >= 2) c += 0.04;
  return clampConfidence(c);
}

/* ------------------------------------------------------------------ */
/* Reasoning text                                                      */
/* ------------------------------------------------------------------ */

function quoteWord(word: string): string {
  return `“${word === "?" ? "？" : word}”`;
}

function quoteAll(words: readonly string[], max = 3): string {
  return words.slice(0, max).map(quoteWord).join("");
}

function storeRef(store: StoreDetection | undefined): string {
  if (!store) return "";
  return store.from === "text" ? store.store.name : `担当の${store.store.name}`;
}

/** Joins non-empty parts with "の": ["北口店", "洗濯機4番"] → "北口店の洗濯機4番". */
function joinNo(...parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join("の");
}

function excerpt(text: string, max = 24): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : flat;
}

const pct = (n: number): number => Math.round(n * 100);

function whoLabel(sender: Member): string {
  if (sender.role === "callcenter") return "コールセンター";
  if (sender.role === "manager") return "管理者";
  return "スタッフ";
}

interface ReasonCtx {
  sender: Member;
  extracted: Extracted;
  store: StoreDetection | undefined;
  photoCount: number;
  secondary: Category[];
}

function cleaningNote(secondary: readonly Category[]): string | null {
  if (secondary.includes("cleaning_done")) return "清掃完了の報告";
  if (secondary.includes("cleaning_start")) return "清掃開始の連絡";
  return null;
}

function reasonEmergency(cand: Candidate, ctx: ReasonCtx, learnedLabel?: string): string {
  const cue = quoteAll(cand.keywords);
  const at = ctx.store ? `${storeRef(ctx.store)}で` : "";
  const { kind } = describeEmergency(cand.keywords);
  if (learnedLabel) {
    return `過去の修正例（「${learnedLabel}」）に似た内容ですが、${cue}という緊急性の高い表現を含むため、安全を優先して緊急トラブルと判断しました。すぐに担当者へ知らせます。`;
  }
  switch (kind) {
    case "water":
      return `${cue}という表現から、${at}水漏れが起きていると判断しました。被害が広がる恐れがあるため、最優先で担当者へ知らせます。`;
    case "fire":
      return `${cue}という表現から、${at}火災や発煙につながる異常が起きている可能性があると判断しました。安全確保を最優先に、すぐに担当者へ知らせます。`;
    case "electric":
      return `${cue}という表現から、${at}電気設備の異常が起きていると判断しました。感電や火災の恐れがあるため、すぐに担当者へ知らせます。`;
    case "injury":
      return `${cue}という表現から、${at}けが人や体調の悪い方がいる可能性があると判断しました。人命に関わるため、すぐに担当者へ知らせます。`;
    case "security":
      return `${cue}という表現から、${at}防犯上のトラブルや設備の破損が起きていると判断しました。安全を確認しながら対応できるよう、すぐに担当者へ知らせます。`;
    case "claim":
      return `${cue}という表現から、お客様からの強いクレームと判断しました。早めの対応が必要なため、すぐに担当者へ知らせます。`;
    default:
      return `${cue}という緊急キーワードから、${at}緊急性の高いトラブルが起きていると判断しました。すぐに担当者へ知らせます。`;
  }
}

function reasonMachine(cand: Candidate, ctx: ReasonCtx): string {
  const { extracted } = ctx;
  const code = extracted.errorCode;
  const cues = code ? [code, ...cand.keywords.filter((k) => k.toUpperCase() !== code)] : cand.keywords;
  const subject = joinNo(storeRef(ctx.store), extracted.machine ?? "設備");
  const refund = cand.keywords.some((k) => k.includes("返金"));
  const state = extracted.errorCode
    ? "エラーで停止している"
    : refund
      ? "正常に動いておらず、返金の申し出が出ている"
      : "正常に動いていない";
  const first = `${quoteAll(cues)}という表現から、${subject}が${state}と判断しました。`;
  const note = cleaningNote(ctx.secondary);
  if (note) return `${first}${note}もあわせて受け付け、担当者へ転送します。`;
  if (ctx.sender.role === "callcenter") return `${first}お客様対応が必要なため、担当者へ転送します。`;
  if (extracted.hasPhoto) return `${first}写真も添えて担当者へ転送し、使用中止や修理の判断を依頼します。`;
  return `${first}現地での確認が必要なため、担当者へ転送します。`;
}

function reasonLeftover(cand: Candidate, ctx: ReasonCtx): string {
  const { extracted } = ctx;
  const days = extracted.days;
  const cues = days !== undefined ? [...cand.keywords.slice(0, 2), `${days}日間`] : cand.keywords;
  const place = joinNo(storeRef(ctx.store), extracted.machine);
  const forgotten = cand.keywords.some((k) => /忘れ/.test(k));
  let first: string;
  if (forgotten) {
    first = `${quoteAll(cues)}という表現から、${place ? `${place}で` : ""}忘れ物が見つかったと判断しました。`;
  } else {
    const how = days !== undefined && days >= 2 ? "長期間放置されている" : "放置されている";
    first = `${quoteAll(cues)}という表現から、${place ? `${place}に` : ""}洗濯物が${how}と判断しました。`;
  }
  const note = cleaningNote(ctx.secondary);
  if (note) return `${first}${note}もあわせて受け付けたうえで、担当者に確認を依頼します。`;
  return `${first}担当者の確認が必要です。`;
}

function reasonQuestionFaq(match: FaqMatch, ctx: ReasonCtx): string {
  const cue = quoteAll(match.groups[0] ?? []);
  const first = `${cue}を含む質問のため、よくある質問「${match.faq.question}」と同じ内容と判断しました。`;
  const note = cleaningNote(ctx.secondary);
  if (note) return `${first}${note}もあわせて受け付け、登録済みの回答で返信します。`;
  return `${first}登録済みの回答で自動返信します。`;
}

function reasonQuestion(cand: Candidate, ctx: ReasonCtx): string {
  const about = joinNo(storeRef(ctx.store), ctx.extracted.machine);
  const subject = about
    ? `${about}に関する${whoLabel(ctx.sender)}からの質問・確認の依頼`
    : `${whoLabel(ctx.sender)}からの質問・確認の依頼`;
  return `${quoteAll(cand.keywords)}という表現から、${subject}と判断しました。よくある質問に当てはまる回答が登録されていないため、管理者に確認をお願いします。`;
}

function reasonCleaningDone(cand: Candidate, ctx: ReasonCtx): string {
  const target = ctx.store ? `${storeRef(ctx.store)}の清掃` : "清掃";
  if (ctx.extracted.hasPhoto) {
    return `${quoteAll(cand.keywords)}という報告と写真${ctx.photoCount}枚の添付から、${target}が完了したと判断しました。`;
  }
  return `${quoteAll(cand.keywords)}という表現から${target}完了の報告と判断しましたが、完了写真はまだ届いていません。`;
}

function reasonPhotoOnly(ctx: ReasonCtx, chatWords: readonly string[], hasText: boolean): string {
  const target = ctx.store ? `${storeRef(ctx.store)}の清掃完了` : "清掃完了";
  const lead =
    chatWords.length > 0
      ? `${quoteAll(chatWords, 2)}というあいさつとともに写真が${ctx.photoCount}枚届いたため`
      : hasText
        ? `文面に判断材料はありませんが、清掃スタッフから写真が${ctx.photoCount}枚届いたため`
        : `本文はありませんが、清掃スタッフから写真が${ctx.photoCount}枚届いたため`;
  return `${lead}、${target}の報告と判断しました。写真のみの判断のため、確信度は控えめにしています。`;
}

function reasonCleaningStart(cand: Candidate, ctx: ReasonCtx): string {
  const first = `${quoteAll(cand.keywords)}という表現から、${ctx.store ? `${storeRef(ctx.store)}の` : ""}清掃開始の連絡と判断しました。`;
  return ctx.store
    ? `${first}店舗の状況を「清掃中」として記録します。`
    : `${first}店舗名が読み取れないため、店舗の状況は更新しません。`;
}

function reasonInfo(cand: Candidate, ctx: ReasonCtx): string {
  const about = ctx.store ? `${storeRef(ctx.store)}に関する` : `${whoLabel(ctx.sender)}からの`;
  return `${quoteAll(cand.keywords)}という表現から、${about}連絡事項と判断しました。トラブルや対応の依頼は含まれていないため、受け付けの返信のみ行います。`;
}

function reasonChat(cand: Candidate): string {
  return `${quoteAll(cand.keywords, 2)}といったあいさつ・お礼の言葉のみのため、対応は不要と判断しました。`;
}

function reasonFor(cand: Candidate, ctx: ReasonCtx): string {
  switch (cand.category) {
    case "emergency":
      return reasonEmergency(cand, ctx);
    case "machine_error":
      return reasonMachine(cand, ctx);
    case "leftover":
      return reasonLeftover(cand, ctx);
    case "question":
      return reasonQuestion(cand, ctx);
    case "cleaning_done":
      return reasonCleaningDone(cand, ctx);
    case "cleaning_start":
      return reasonCleaningStart(cand, ctx);
    case "info":
      return reasonInfo(cand, ctx);
    case "chat":
      return reasonChat(cand);
    default:
      return `${quoteAll(cand.keywords)}という表現から「${CATEGORY_LABELS[cand.category]}」と判断しました。`;
  }
}

/* ------------------------------------------------------------------ */
/* Learned examples                                                    */
/* ------------------------------------------------------------------ */

export interface LearnedMatch {
  example: LearnedExample;
  score: number;
}

/** Most similar corrected example at or above the reuse threshold (newest wins ties). */
export function findLearned(text: string, learned: readonly LearnedExample[]): LearnedMatch | undefined {
  const norm = normalize(text);
  if (!norm) return undefined;
  let best: LearnedMatch | undefined;
  for (const example of learned) {
    if (!normalize(example.text)) continue;
    const score = similarity(norm, example.text);
    if (score < LEARNED_SIMILARITY_THRESHOLD) continue;
    if (!best || score > best.score || (score === best.score && example.createdAt > best.example.createdAt)) {
      best = { example, score };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* analyze()                                                           */
/* ------------------------------------------------------------------ */

function withThreshold(result: Analysis, settings: Settings): Analysis {
  const threshold = settings.behavior.confidenceThreshold;
  if (result.category === "emergency" || result.category === "unknown" || result.confidence >= threshold) {
    return result;
  }
  const guess = result.category;
  const guessLabel = CATEGORY_LABELS[guess];
  const basis =
    result.source === "learned"
      ? `過去の修正例に似た内容で「${guessLabel}」の可能性があります`
      : result.extracted.keywords.length > 0
        ? `${quoteAll(result.extracted.keywords)}から「${guessLabel}」の可能性があります`
        : `「${guessLabel}」の可能性があります`;
  return {
    ...result,
    category: "unknown",
    // An explicit 「至急」 stays urgent even when the category is uncertain.
    urgency: maxUrgency(result.urgency, "attention"),
    secondary: [guess, ...result.secondary.filter((c) => c !== guess)],
    source: "fallback",
    faqId: undefined,
    sample: false,
    reasoning: `${basis}が、確信度（${pct(result.confidence)}%）が基準の${pct(threshold)}%に届かないため判定を保留しました。誤った自動返信を避けるため、担当者に確認を回します。`,
  };
}

/** Words that were denied right away, for the "異常なしの報告" explanation (incident words first). */
function deniedWords(negated: readonly NegatedMatch[]): string[] {
  const incident = negated.filter((n) => n.rule.category === "emergency" || n.rule.category === "machine_error");
  const words: string[] = [];
  for (const n of incident.length > 0 ? incident : negated) {
    const w = displayKeyword(n.keyword);
    if (!words.includes(w)) words.push(w);
  }
  return words;
}

function deniedNote(negated: readonly NegatedMatch[]): string {
  const words = deniedWords(negated.filter((n) => n.rule.category === "emergency" || n.rule.category === "machine_error"));
  return words.length > 0 ? `なお、${quoteAll(words, 2)}は直後に打ち消しの表現があるため、異常の報告ではないと判断しました。` : "";
}

export function analyze(input: EngineInput, settings: Settings): Analysis {
  const { sender } = input;
  const text = matchText(input.text);
  const norm = normalize(input.text);
  const photoCount = Math.max(0, Math.floor(input.photoCount) || 0);
  const extracted = extract(input.text, photoCount, settings, sender);
  const scan = scanRules(text, settings.keywordRules, sender.role);
  const candidates = buildCandidates(scan.hits);
  /** categories moved out of the running (kept as secondary) */
  const demoted: Category[] = [];
  /** extra words shown as the basis of the judgement */
  const extraCues: string[] = [];

  // An error code ("E21", "エラー21") is evidence of a machine fault even without a fault word.
  if (extracted.errorCode && !candidates.some((c) => c.category === "machine_error")) {
    const at = Math.max(0, text.folded.indexOf(extracted.errorCode.slice(1)));
    const end = at + extracted.errorCode.length - 1;
    if (!isDeniedAfter(text, end)) {
      candidates.push({
        category: "machine_error",
        urgency: "attention",
        keywords: [extracted.errorCode],
        matches: [{ keyword: extracted.errorCode, start: at, end }],
      });
    }
  }

  // A fault the sender says is already fixed is a 連絡事項 (unless something urgent is going on).
  const fault = candidates.find((c) => c.category === "machine_error");
  if (fault && !candidates.some((c) => c.urgency === "urgent")) {
    const cue = resolvedCue(text, fault);
    if (cue) {
      candidates.splice(candidates.indexOf(fault), 1);
      demoted.push("machine_error");
      if (!candidates.some((c) => c.category === "info")) {
        const at = Math.max(0, text.folded.indexOf(cue));
        candidates.push({ category: "info", urgency: "normal", keywords: [cue], matches: [{ keyword: cue, start: at, end: at + cue.length }] });
      }
      extraCues.push(cue);
    }
  }

  // "クレジットカードは使えないですか？" is a question, not a fault: a fault word inside the question
  // itself, with no machine number or error code, does not make it a machine error.
  const question = candidates.find((c) => c.category === "question");
  const faultNow = candidates.find((c) => c.category === "machine_error");
  if (
    question &&
    faultNow &&
    faultNow.urgency !== "urgent" &&
    !extracted.machine &&
    !extracted.errorCode &&
    faultNow.matches.every((m) => sameSentence(text, m, question.matches))
  ) {
    candidates.splice(candidates.indexOf(faultNow), 1);
    demoted.push("machine_error");
  }

  // Explicit urgency words ("至急", "助けて") raise the main concern to 緊急.
  const marker = urgencyMarker(text);
  if (marker) {
    const concern = candidates.filter((c) => !ROUTINE.has(c.category)).sort(compareCandidates)[0];
    if (concern && concern.urgency !== "urgent") {
      concern.urgency = "urgent";
      if (!concern.keywords.includes(marker)) concern.keywords = [...concern.keywords, marker];
    }
  }
  candidates.sort(compareCandidates);

  // The store named closest before the main concern ("①駅前店：…説明済み ②南町店：洗濯機2番が回らない").
  let store: StoreDetection | undefined = detectStore(text, settings.stores, sender);
  const main = candidates.find((c) => c.category !== "chat");
  if (main && main.matches.length > 0) {
    const anchored = detectStore(text, settings.stores, sender, main.matches[0].start);
    if (anchored) store = anchored;
  }
  if (store) extracted.storeId = store.store.id;
  else delete extracted.storeId;
  for (const cue of extraCues) if (!extracted.keywords.includes(cue)) extracted.keywords.push(cue);

  const emergency = candidates.find((c) => c.category === "emergency");
  const base = { extracted, sample: true } as const;

  // 1) Manager-corrected examples. They can raise a judgement but never lower an emergency keyword hit.
  const learned = findLearned(input.text, settings.learned);
  let blockedLearned: LearnedExample | undefined;
  if (learned) {
    const ex = learned.example;
    if (emergency && ex.category !== "emergency") {
      blockedLearned = ex;
    } else {
      const secondary = secondaryOf(candidates, ex.category);
      const faq = ex.category === "question" ? findFaq(text, settings.faqs) : undefined;
      const confidence = round2(learned.score);
      const result: Analysis = {
        ...base,
        category: ex.category,
        secondary,
        urgency: ex.category === "emergency" ? "urgent" : ex.urgency,
        confidence,
        source: "learned",
        sample: false,
        exampleId: ex.id,
        reasoning: `管理者が以前修正した「${excerpt(ex.text)}」とよく似た内容のため（類似度${pct(confidence)}%）、その修正にならって「${CATEGORY_LABELS[ex.category]}」と判断しました。緊急度は「${URGENCY_LABELS[ex.category === "emergency" ? "urgent" : ex.urgency]}」として扱います。`,
      };
      if (faq) result.faqId = faq.faq.id;
      return withThreshold(result, settings);
    }
  }

  const ctxBase = { sender, extracted, store, photoCount };
  const substantive = candidates.filter((c) => c.category !== "chat");
  const concerns = substantive.filter((c) => !ROUTINE.has(c.category));
  const chat = candidates.find((c) => c.category === "chat");

  // 2) Safety net: words that hint at danger, when no rule recognised a concern.
  if (concerns.length === 0) {
    const safe = safeSpans(text, scan.excludeSpans, scan.negated);
    const strong = findCues(text, DANGER_STRONG, safe);
    const weak = substantive.length === 0 ? findCues(text, DANGER_WEAK, safe) : [];
    if (marker && !strong.includes(marker)) strong.push(marker);
    if (strong.length > 0 || weak.length > 0) {
      const urgent = strong.length > 0;
      const cues = urgent ? strong : weak;
      const secondary = [...secondaryOf(candidates, "unknown"), ...demoted.filter((d) => !candidates.some((c) => c.category === d))];
      return {
        ...base,
        extracted: { ...extracted, keywords: [...extracted.keywords, ...cues.filter((c) => !extracted.keywords.includes(c))] },
        category: "unknown",
        secondary,
        urgency: urgent ? "urgent" : "attention",
        confidence: FALLBACK_CONFIDENCE,
        source: "fallback",
        sample: false,
        reasoning: urgent
          ? `登録された判定条件には当てはまりませんが、${quoteAll(cues, 2)}という危険につながる可能性のある言葉が含まれています。見落としを防ぐため、念のため緊急として担当者へすぐに知らせます。`
          : `登録された判定条件には当てはまりませんが、${quoteAll(cues, 2)}という気になる言葉が含まれています。誤った自動返信を避けるため、担当者に確認を回します。`,
      };
    }
  }

  // 3) Nothing substantive: acknowledgements, all-clear reports, photo-only completion reports, greetings.
  if (substantive.length === 0) {
    const bare = norm.replace(SYMBOLS, "");
    const isAck = !extracted.hasPhoto && norm.length > 0 && (ONLY_SYMBOLS.test(norm) || ACKS.has(bare));
    if (isAck) {
      return withThreshold(
        {
          ...base,
          category: "chat",
          secondary: [],
          urgency: "normal",
          confidence: ACK_CONFIDENCE,
          source: "ai",
          reasoning: `「${excerpt(input.text, 12)}」という短い返事・あいさつのみのため、対応は不要と判断しました。`,
        },
        settings,
      );
    }

    // Every incident word was denied right away ("水漏れはありませんでした") → an all-clear report.
    if (scan.negated.length > 0 && !extracted.hasPhoto) {
      return withThreshold(
        {
          ...base,
          category: "info",
          secondary: [],
          urgency: "normal",
          confidence: ACK_CONFIDENCE,
          source: "ai",
          reasoning: `${quoteAll(deniedWords(scan.negated), 2)}という言葉はありますが、すぐ後に打ち消しの表現が続くため、異常がないことの報告と判断しました。受け付けの返信のみ行います。`,
        },
        settings,
      );
    }

    // A greeting is "chat" only when nothing else is said ("お疲れ様です。南町店のお客様より…" is not chat).
    let residual = text.folded;
    for (const m of chat?.matches ?? []) residual = residual.slice(0, m.start) + " ".repeat(m.end - m.start) + residual.slice(m.end);
    residual = residual.replace(/ /g, "").replace(SYMBOLS, "").replace(FILLERS, "");
    const greetingOnly = Boolean(chat) && charLength(residual) <= CHAT_RESIDUAL_MAX && !/お客/.test(residual);

    // Photo-only completion report: a staff member often posts the photos first, or with just a greeting.
    if (
      sender.role === "staff" &&
      extracted.hasPhoto &&
      (norm.length === 0 || greetingOnly || COMPLETION_HINT.test(text.folded) || scan.negated.length > 0)
    ) {
      return withThreshold(
        {
          ...base,
          category: "cleaning_done",
          secondary: [],
          urgency: "normal",
          confidence: PHOTO_ONLY_CONFIDENCE,
          source: "ai",
          reasoning: `${reasonPhotoOnly({ ...ctxBase, secondary: [] }, chat?.keywords ?? [], norm.length > 0)}${deniedNote(scan.negated)}`,
        },
        settings,
      );
    }
    if (chat && greetingOnly) {
      return withThreshold(
        {
          ...base,
          category: "chat",
          secondary: [],
          urgency: "normal",
          confidence: ruleConfidence(chat, candidates, extracted, undefined),
          source: "ai",
          reasoning: reasonChat(chat),
        },
        settings,
      );
    }
    // 4) Nothing recognisable → a human decides.
    return {
      ...base,
      category: "unknown",
      secondary: demoted,
      urgency: "attention",
      confidence: FALLBACK_CONFIDENCE,
      source: "fallback",
      sample: false,
      reasoning: !norm && !extracted.hasPhoto
        ? "本文も写真もないため、内容を判断できませんでした。念のため担当者に確認を回します。"
        : !norm
          ? "写真のみの投稿で、内容を特定できませんでした。誤った自動返信を避けるため、担当者に確認を回します。"
          : chat
            ? `${quoteAll(chat.keywords, 2)}というあいさつに続けて、登録されている判定条件に当てはまらない内容が書かれています。誤った自動返信を避けるため、担当者に確認を回します。`
            : extracted.hasPhoto
              ? "写真つきの投稿ですが、文面が清掃完了の報告とは読み取れず、登録されている判定条件にも当てはまりませんでした。見落としを防ぐため、担当者に確認を回します。"
              : "登録されている判定条件のどれにも当てはまらず、内容を特定できませんでした。誤った自動返信を避けるため、担当者に確認を回します。",
    };
  }

  // FAQ: answers beat leftover / machine_error only when the text is clearly a question, and never an emergency.
  const hasUrgent = candidates.some((c) => c.urgency === "urgent");
  const asked = candidates.find((c) => c.category === "question");
  if (asked && !hasUrgent) {
    const faq = findFaq(text, settings.faqs);
    if (faq) {
      const secondary = [...secondaryOf(candidates, "question"), ...demoted];
      return withThreshold(
        {
          ...base,
          category: "question",
          secondary,
          urgency: "normal",
          confidence: faqConfidence(faq, asked),
          source: "faq",
          faqId: faq.faq.id,
          reasoning: reasonQuestionFaq(faq, { ...ctxBase, secondary }),
        },
        settings,
      );
    }
  }

  const primary = substantive[0];
  const secondary = [...secondaryOf(candidates, primary.category), ...demoted.filter((d) => d !== primary.category)];
  if (blockedLearned && !secondary.includes(blockedLearned.category) && blockedLearned.category !== primary.category) {
    secondary.push(blockedLearned.category);
  }
  const urgency = primary.category === "question" ? maxUrgency(primary.urgency, "attention") : primary.urgency;
  const ctx: ReasonCtx = { ...ctxBase, secondary };
  let reasoning =
    blockedLearned && primary.category === "emergency"
      ? reasonEmergency(primary, ctx, CATEGORY_LABELS[blockedLearned.category])
      : reasonFor(primary, ctx);
  if (primary.category !== "emergency") reasoning += deniedNote(scan.negated);
  if (marker && primary.urgency === "urgent" && primary.category !== "emergency") {
    reasoning += `“${marker}”とあるため、緊急として扱います。`;
  }

  return withThreshold(
    {
      ...base,
      category: primary.category,
      secondary,
      urgency: primary.category === "emergency" ? maxUrgency(urgency, "urgent") : urgency,
      confidence: ruleConfidence(primary, candidates, extracted, store),
      source: "ai",
      reasoning,
    },
    settings,
  );
}

/** Looks up the FAQ used by an analysis (admin "テスト" tab, plan, Claude prompt builder). */
export function faqById(settings: Settings, id: string | undefined): FaqEntry | undefined {
  return id ? settings.faqs.find((f) => f.id === id) : undefined;
}
