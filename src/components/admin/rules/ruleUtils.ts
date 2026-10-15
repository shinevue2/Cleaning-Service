/**
 * Pure helpers for 管理画面 › 返信パターン・判定ルール (reply patterns, keyword rules and the test tab).
 * No React here — everything is unit-tested in __tests__/ruleUtils.test.ts.
 */
import {
  CATEGORY_PRIORITY,
  URGENCY_RANK,
  analyze,
  composeTarget,
  isNight,
  parseClock,
  plan,
  renderTemplate,
  shortName,
} from "@/lib/engine";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ActionPlan,
  type Analysis,
  type BehaviorSettings,
  type Category,
  type EngineInput,
  type Group,
  type KeywordRule,
  type Member,
  type MemberRole,
  type ReplyPattern,
  type Settings,
} from "@/lib/types";
import { cleanWords, commonWords, wordKey } from "../settings/shared/words";

/* ------------------------------------------------------------------ */
/* Reply patterns                                                      */
/* ------------------------------------------------------------------ */

export type PatternWhen = NonNullable<ReplyPattern["when"]>;

export const WHEN_ORDER: readonly PatternWhen[] = ["any", "with_photo", "without_photo", "night"];

export const WHEN_LABELS: Record<PatternWhen, string> = {
  any: "いつでも",
  with_photo: "写真あり",
  without_photo: "写真なし",
  night: "夜間",
};

export const WHEN_DESCRIPTIONS: Record<PatternWhen, string> = {
  any: "ほかの条件に当てはまらないときに使います",
  with_photo: "写真が添付されているときに使います",
  without_photo: "写真がないときに使います",
  night: "夜間の時間帯に、ほかの文面より優先して使います",
};

/** When the reply of each category is used, in one plain sentence for the owner. */
export const CATEGORY_HELP: Record<Category, string> = {
  cleaning_start: "「これから清掃に入ります」などの連絡に返信します。",
  cleaning_done: "清掃完了の報告に返信します。写真の有無で文面を分けられます。",
  leftover: "洗濯物の放置・忘れ物の報告に返信し、管理者へ転送します。",
  machine_error: "機械のエラー・故障の報告に返信し、管理者へ転送します。",
  question: "質問に返信します。よくある質問に一致したときは、登録した回答で答えます。",
  info: "コールセンターからの連絡事項に返信します。",
  emergency: "緊急トラブルに返信し、すぐに管理者へ転送します。夜間用の文面も用意できます。",
  chat: "あいさつ・お礼への返信です。初期設定では返信しない（オフ）にしています。",
  unknown: "内容を判断できなかったメッセージに返信し、担当者に確認を回します。",
};

/** Categories whose messages are forwarded to the managers in addition to the reply. */
export const FORWARDED_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  "leftover",
  "machine_error",
  "emergency",
  "unknown",
]);

export function whenOf(pattern: Pick<ReplyPattern, "when">): PatternWhen {
  return pattern.when ?? "any";
}

/* ---------------- who the pattern is for ---------------- */
// Managers never get automatic replies, so a pattern is for everyone, staff only or the call center only
// (the same RoleScope as keyword rules).

export const PATTERN_SCOPE_BADGES: Record<Exclude<RoleScope, "all">, string> = {
  staff: "清掃スタッフ向け",
  callcenter: "コールセンター向け",
};

export const PATTERN_SCOPE_DESCRIPTIONS: Record<RoleScope, string> = {
  all: "誰から届いたメッセージにも使います",
  staff: "清掃スタッフからのメッセージには、この文面を優先して使います",
  callcenter: "コールセンターからのメッセージには、この文面を優先して使います",
};

export function patternScopeOf(pattern: Pick<ReplyPattern, "roles">): RoleScope {
  return roleScopeOf(pattern.roles ?? []);
}

/** Roles to store on a pattern for a scope (undefined = everyone). */
export function patternRolesFromScope(scope: RoleScope): MemberRole[] | undefined {
  const roles = rolesFromScope(scope);
  return roles.length > 0 ? roles : undefined;
}

/** Stable key of the roles a pattern is limited to ("" = everyone). */
function rolesKey(pattern: Pick<ReplyPattern, "roles">): string {
  return [...(pattern.roles ?? [])].sort().join(",");
}

/** A question pattern containing {answer} is used when an FAQ matched. */
export function isFaqPattern(pattern: Pick<ReplyPattern, "texts">): boolean {
  return pattern.texts.some((t) => t.includes("{answer}"));
}

/** Condition label shown on a pattern card. */
export function patternConditionLabel(pattern: Pick<ReplyPattern, "category" | "when" | "texts">): string {
  if (pattern.category === "question" && whenOf(pattern) === "any") {
    return isFaqPattern(pattern) ? "よくある質問に一致したとき" : "よくある質問にないとき";
  }
  return WHEN_LABELS[whenOf(pattern)];
}

/** Patterns grouped by category in display order (CATEGORY_ORDER), each group sorted by condition. */
export function groupPatterns(patterns: readonly ReplyPattern[]): Array<{ category: Category; patterns: ReplyPattern[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    patterns: patterns
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => p.category === category)
      .sort(
        (a, b) =>
          (isFaqPattern(b.p) ? 1 : 0) - (isFaqPattern(a.p) ? 1 : 0) ||
          WHEN_ORDER.indexOf(whenOf(a.p)) - WHEN_ORDER.indexOf(whenOf(b.p)) ||
          a.index - b.index,
      )
      .map(({ p }) => p),
  }));
}

/** True when the category has at least one enabled pattern with some text. */
export function hasActivePattern(patterns: readonly ReplyPattern[], category: Category): boolean {
  return patterns.some((p) => p.category === category && p.enabled && p.texts.some((t) => t.trim() !== ""));
}

/**
 * The engine uses the FIRST usable pattern for a category + condition (stored order). Later enabled
 * patterns with the same condition are never sent — the screen marks them as 「使われていません」.
 */
export function shadowedPatternIds(patterns: readonly ReplyPattern[]): Set<string> {
  const first = new Set<string>();
  const shadowed = new Set<string>();
  for (const p of patterns) {
    if (!p.enabled || !p.texts.some((t) => t.trim() !== "")) continue;
    const key = `${p.category}|${whenOf(p)}|${p.category === "question" ? String(isFaqPattern(p)) : ""}|${rolesKey(p)}`;
    if (first.has(key)) shadowed.add(p.id);
    else first.add(key);
  }
  return shadowed;
}

/** The enabled pattern that wins for this category + condition, if it is not `self`. */
export function winningPattern(
  patterns: readonly ReplyPattern[],
  self: Pick<ReplyPattern, "id" | "category" | "when" | "texts" | "roles">,
): ReplyPattern | undefined {
  const faq = isFaqPattern(self);
  const roles = rolesKey(self);
  return patterns.find(
    (p) =>
      p.id !== self.id &&
      p.enabled &&
      p.category === self.category &&
      whenOf(p) === whenOf(self) &&
      rolesKey(p) === roles &&
      (self.category !== "question" || isFaqPattern(p) === faq) &&
      p.texts.some((t) => t.trim() !== ""),
  );
}

/* ---------------- placeholders ---------------- */

export interface PlaceholderInfo {
  key: string;
  token: string;
  label: string;
  example: string;
}

/** The placeholders offered as chips. {answer} only for the question category. */
export const PLACEHOLDERS: readonly PlaceholderInfo[] = [
  { key: "name", token: "{name}", label: "送った人の名前", example: "田中" },
  { key: "store", token: "{store}", label: "店舗名", example: "駅前店" },
  { key: "target", token: "{target}", label: "報告の対象", example: "緑ヶ丘店の乾燥機3番（E21）" },
  { key: "time", token: "{time}", label: "受け取った時刻", example: "14:05" },
  { key: "answer", token: "{answer}", label: "よくある質問の回答", example: "（登録した回答）" },
];

/** Every key the engine fills in (renderTemplate leaves unknown keys empty). */
export const KNOWN_PLACEHOLDER_KEYS: ReadonlySet<string> = new Set([
  "name",
  "store",
  "target",
  "time",
  "answer",
  "machine",
  "code",
  "bot",
]);

export function placeholdersFor(category: Category): PlaceholderInfo[] {
  return PLACEHOLDERS.filter((p) => p.key !== "answer" || category === "question");
}

/** 「｛name｝」 typed with full-width braces → 「{name}」 (the engine only reads ASCII braces). */
export function fixPlaceholderBraces(text: string): string {
  return text.replace(/[｛{]\s*([A-Za-zＡ-Ｚａ-ｚ_＿]+)\s*[｝}]/g, (_m, key: string) => `{${key.normalize("NFKC").toLowerCase()}}`);
}

/** Placeholder keys the engine does not know (they would become empty). */
export function unknownPlaceholders(text: string): string[] {
  const found: string[] = [];
  for (const m of fixPlaceholderBraces(text).matchAll(/\{([^{}\s]*)\}/g)) {
    const key = m[1];
    if (!KNOWN_PLACEHOLDER_KEYS.has(key) && !found.includes(key)) found.push(key);
  }
  return found;
}

/** Inserts `token` over the selection [start, end) and returns the new text and caret position. */
export function insertToken(text: string, start: number, end: number, token: string): { text: string; caret: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return { text: text.slice(0, s) + token + text.slice(e), caret: s + token.length };
}

/** Values used for the live preview under each reply text. Uses the shop's real names where possible. */
export function sampleVars(category: Category, settings: Settings): Record<string, string> {
  const staff = settings.members.find((m) => m.role === "staff") ?? settings.members[0];
  const name = staff ? shortName(staff.name) : "田中";
  const storeName = settings.stores[0]?.name ?? "駅前店";
  const faq = settings.faqs.find((f) => f.enabled && f.answer.trim()) ?? settings.faqs[0];
  const targets: Partial<Record<Category, string>> = {
    leftover: `${storeName}の洗濯機4番に3日間残っている洗濯物`,
    machine_error: `${storeName}の乾燥機3番（E21）`,
    emergency: `${storeName}の水漏れ`,
    question: "ご質問",
    cleaning_start: `${storeName}の清掃`,
    cleaning_done: `${storeName}の清掃`,
  };
  return {
    name,
    store: storeName,
    target: targets[category] ?? `${storeName}のご報告`,
    time: "14:05",
    answer: faq?.answer ?? "（よくある質問に登録した回答が入ります）",
    machine: category === "machine_error" ? "乾燥機3番" : "",
    code: category === "machine_error" ? "E21" : "",
    bot: settings.behavior.botName,
  };
}

/** The reply as the bot would send it (sample values filled in). */
export function previewText(text: string, category: Category, settings: Settings): string {
  return renderTemplate(fixPlaceholderBraces(text), sampleVars(category, settings));
}

export const MAX_REPLY_LENGTH = 500;

/** Trimmed texts with fixed braces; empty variants dropped. */
export function cleanPatternTexts(texts: readonly string[]): string[] {
  return texts.map((t) => fixPlaceholderBraces(t).trim()).filter((t) => t !== "");
}

export interface PatternCheck {
  /** blocking problem */
  error?: string;
  /** per-variant non-blocking notes */
  warnings: string[];
}

export function checkPatternTexts(texts: readonly string[], category: Category): PatternCheck {
  const cleaned = cleanPatternTexts(texts);
  if (cleaned.length === 0) return { error: "返信の文面を1つ以上入力してください。", warnings: [] };
  if (cleaned.some((t) => Array.from(t).length > MAX_REPLY_LENGTH)) {
    return { error: `返信の文面は${MAX_REPLY_LENGTH}文字以内にしてください。`, warnings: [] };
  }
  const warnings: string[] = [];
  const unknown = [...new Set(cleaned.flatMap(unknownPlaceholders))];
  if (unknown.length > 0) {
    warnings.push(
      `${unknown.map((k) => `{${k}}`).join("・")} は差し込みに使えないため、空欄になります。下のボタンから差し込んでください。`,
    );
  }
  if (category !== "question" && cleaned.some((t) => t.includes("{answer}"))) {
    warnings.push("{answer}（よくある質問の回答）は「質問・確認」の返信でのみ使えます。");
  }
  return { warnings };
}

/* ------------------------------------------------------------------ */
/* Keyword rules                                                       */
/* ------------------------------------------------------------------ */

export type RoleScope = "all" | "staff" | "callcenter";

export const ROLE_SCOPE_LABELS: Record<RoleScope, string> = {
  all: "全員",
  staff: "清掃スタッフのみ",
  callcenter: "コールセンターのみ",
};

export function roleScopeOf(roles: readonly MemberRole[]): RoleScope {
  const staff = roles.includes("staff");
  const cc = roles.includes("callcenter");
  if (staff && !cc) return "staff";
  if (cc && !staff) return "callcenter";
  return "all";
}

export function rolesFromScope(scope: RoleScope): MemberRole[] {
  return scope === "all" ? [] : [scope];
}

/** Emergency first, then 要対応, then 通常; same urgency by the engine's tie-break priority. */
export function sortRules(rules: readonly KeywordRule[]): KeywordRule[] {
  const priority = (c: Category) => {
    const i = CATEGORY_PRIORITY.indexOf(c);
    return i < 0 ? CATEGORY_PRIORITY.length : i;
  };
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort(
      (a, b) =>
        URGENCY_RANK[b.rule.urgency] - URGENCY_RANK[a.rule.urgency] ||
        priority(a.rule.category) - priority(b.rule.category) ||
        a.index - b.index,
    )
    .map(({ rule }) => rule);
}

export function ruleTitle(rule: Pick<KeywordRule, "category" | "memo">): string {
  return rule.memo?.trim() || `${CATEGORY_LABELS[rule.category]}のルール`;
}

export interface RuleCheck {
  errors: { keywords?: string; excludes?: string };
  /** words also registered in other enabled rules (shown as information) */
  shared: Array<{ word: string; rule: KeywordRule }>;
}

export function checkRule(draft: KeywordRule, all: readonly KeywordRule[]): RuleCheck {
  const keywords = cleanWords(draft.keywords);
  const excludes = cleanWords(draft.excludes);
  const errors: RuleCheck["errors"] = {};
  if (keywords.length === 0) errors.keywords = "反応する言葉を1つ以上登録してください。";
  const both = commonWords(excludes, keywords);
  if (both.length > 0) {
    errors.excludes = `「${both.join("」「")}」が「反応する言葉」と「除外する言葉」の両方に入っています。どちらか一方にしてください。`;
  }
  const shared: RuleCheck["shared"] = [];
  for (const other of all) {
    if (other.id === draft.id || !other.enabled || other.category === draft.category) continue;
    const otherKeys = new Set(other.keywords.map(wordKey));
    for (const word of keywords) {
      if (otherKeys.has(wordKey(word))) shared.push({ word, rule: other });
    }
  }
  return { errors, shared };
}

/** Rule as saved: clean word lists, emergencies always 緊急, memo trimmed. */
export function finalizeRule(draft: KeywordRule): KeywordRule {
  const memo = draft.memo?.trim();
  const rule: KeywordRule = {
    ...draft,
    urgency: draft.category === "emergency" ? "urgent" : draft.urgency,
    keywords: cleanWords(draft.keywords),
    excludes: cleanWords(draft.excludes),
  };
  if (memo) rule.memo = memo;
  else delete rule.memo;
  return rule;
}

/* ------------------------------------------------------------------ */
/* Test tab                                                            */
/* ------------------------------------------------------------------ */

export type TimeOfDay = "day" | "night";

const DAY_MINUTES = 24 * 60;
/** Tokyo midnight of a fixed reference day; only the wall-clock time matters for the engine. */
const REFERENCE_MIDNIGHT = Date.UTC(2026, 0, 15) - 9 * 3600_000;

/** epoch ms whose Asia/Tokyo wall clock shows `minutes` after midnight. */
export function wallClockMs(minutes: number): number {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return REFERENCE_MIDNIGHT + m * 60_000;
}

const clockLabel = (minutes: number): string => {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * A representative moment for 日中 / 夜間 under the current night window, e.g. 14:00 and 23:00.
 * Returns null for 夜間 when no night window is configured.
 */
export function testMoment(mode: TimeOfDay, behavior: BehaviorSettings): { now: number; label: string } | null {
  const start = parseClock(behavior.nightStart);
  const end = parseClock(behavior.nightEnd);
  const hasNight = start !== null && end !== null && start !== end;
  if (mode === "night") {
    if (!hasNight) return null;
    const length = (end - start + DAY_MINUTES) % DAY_MINUTES;
    const minutes = (start + Math.min(60, Math.floor(length / 2))) % DAY_MINUTES;
    return { now: wallClockMs(minutes), label: clockLabel(minutes) };
  }
  const preferred = 14 * 60;
  if (!isNight(wallClockMs(preferred), behavior)) return { now: wallClockMs(preferred), label: clockLabel(preferred) };
  // The night window covers 14:00 — use the middle of the remaining day time.
  const s = start ?? 0;
  const e = end ?? 0;
  const dayLength = (s - e + DAY_MINUTES) % DAY_MINUTES;
  const minutes = (e + Math.floor(dayLength / 2)) % DAY_MINUTES;
  return { now: wallClockMs(minutes), label: clockLabel(minutes) };
}

/** The group a member normally posts in (call center → call-center group, otherwise the cleaning group). */
export function groupForMember(member: Pick<Member, "role">, groups: readonly Group[]): Group {
  const wanted = member.role === "callcenter" ? "callcenter" : "cleaning";
  return (
    groups.find((g) => g.kind === wanted) ??
    groups.find((g) => g.kind !== "alerts") ?? { id: "g_test", kind: "cleaning", name: "テスト用グループ" }
  );
}

export interface TestResult {
  analysis: Analysis;
  plan: ActionPlan;
  /** every distinct reply the bot could send (one per text variant) */
  replies: string[];
}

/** Runs the engine like the simulator would, without touching the store. */
export function runTest(input: EngineInput, settings: Settings, maxVariants = 8): TestResult {
  const analysis = analyze(input, settings);
  const first = plan(input, analysis, settings, () => 0);
  const replies: string[] = [];
  for (let k = 0; k < maxVariants; k += 1) {
    const reply = k === 0 ? first.reply : plan(input, analysis, settings, (n) => k % n).reply;
    if (reply !== null && !replies.includes(reply)) replies.push(reply);
  }
  return { analysis, plan: first, replies };
}

/** {target} as the engine composes it, for display ("報告の対象"). */
export function targetOf(analysis: Analysis, settings: Settings): string {
  return composeTarget(analysis, settings);
}
