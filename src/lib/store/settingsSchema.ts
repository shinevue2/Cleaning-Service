/**
 * Validation of settings coming from outside the app: the 「設定の読み込み」 (JSON import) in the admin
 * screen and data restored from localStorage. Errors are explained in plain Japanese for the owner.
 */
import { z } from "zod";
import { parseClock } from "@/lib/engine";
import { CATEGORY_ORDER, type Category, type Settings } from "@/lib/types";

const category = z.enum(CATEGORY_ORDER as [Category, ...Category[]]);
const urgency = z.enum(["normal", "attention", "urgent"]);
const role = z.enum(["staff", "callcenter", "manager"]);
const id = z.string().trim().min(1);
const words = z.array(z.string()).default([]);

const storeSchema = z.object({
  id,
  name: z.string().trim().min(1),
  aliases: words,
});

const memberSchema = z.object({
  id,
  name: z.string().trim().min(1),
  role,
  storeIds: words,
  lineUserId: z.string().optional(),
  avatarColor: z.string().default("#64748b"),
});

const groupSchema = z.object({
  id,
  kind: z.enum(["cleaning", "callcenter", "alerts"]),
  name: z.string().trim().min(1),
  lineGroupId: z.string().optional(),
});

const replyPatternSchema = z.object({
  id,
  category,
  when: z.enum(["with_photo", "without_photo", "night", "any"]).optional(),
  roles: z.array(role).optional(),
  texts: z.array(z.string()),
  enabled: z.boolean().default(true),
});

const keywordRuleSchema = z.object({
  id,
  category,
  urgency,
  keywords: z.array(z.string()),
  excludes: words,
  roles: z.array(role).default([]),
  enabled: z.boolean().default(true),
  memo: z.string().optional(),
});

const faqSchema = z.object({
  id,
  patterns: z.array(z.array(z.string())),
  question: z.string(),
  answer: z.string(),
  enabled: z.boolean().default(true),
});

const learnedSchema = z.object({
  id,
  text: z.string(),
  category,
  urgency,
  createdAt: z.number().finite(),
});

const notifyTargetSchema = z.object({
  id,
  name: z.string().trim().min(1),
  channel: z.enum(["line_group", "email", "chatwork", "phone"]),
  address: z.string(),
  urgencies: z.array(urgency),
  nightOnly: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const clock = z.string().refine((v) => parseClock(v) !== null);

const behaviorSchema = z
  .object({
    botName: z.string().trim().min(1),
    aggregateSeconds: z.number().finite().min(0).max(120),
    confidenceThreshold: z.number().finite().min(0).max(1),
    nightStart: clock,
    nightEnd: clock,
    replyDelayMs: z.number().finite().min(0).max(30_000),
    askPhotoWhenMissing: z.boolean(),
    dailyReportTime: clock,
  })
  .partial();

/** Every top-level key is optional: an imported file replaces only the sections it contains. */
const importSchema = z.object({
  stores: z.array(storeSchema).optional(),
  members: z.array(memberSchema).optional(),
  groups: z.array(groupSchema).optional(),
  replyPatterns: z.array(replyPatternSchema).optional(),
  keywordRules: z.array(keywordRuleSchema).optional(),
  faqs: z.array(faqSchema).optional(),
  learned: z.array(learnedSchema).optional(),
  notifyTargets: z.array(notifyTargetSchema).optional(),
  behavior: behaviorSchema.optional(),
});

export const SETTINGS_SECTIONS = [
  "stores",
  "members",
  "groups",
  "replyPatterns",
  "keywordRules",
  "faqs",
  "learned",
  "notifyTargets",
  "behavior",
] as const satisfies readonly (keyof Settings)[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_LABELS: Record<SettingsSection, string> = {
  stores: "店舗",
  members: "スタッフ",
  groups: "グループ",
  replyPatterns: "返信パターン",
  keywordRules: "判定ルール",
  faqs: "よくある質問",
  learned: "判定の修正例",
  notifyTargets: "通知先",
  behavior: "動作設定",
};

const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  name: "名前",
  aliases: "別の呼び方",
  role: "役割",
  storeIds: "担当店舗",
  lineUserId: "LINEユーザーID",
  avatarColor: "アイコンの色",
  kind: "種類",
  lineGroupId: "LINEグループID",
  category: "分類",
  when: "使う条件",
  texts: "返信文",
  enabled: "有効・無効",
  urgency: "緊急度",
  keywords: "キーワード",
  excludes: "除外するキーワード",
  roles: "対象の役割",
  memo: "メモ",
  patterns: "質問のキーワード",
  question: "質問",
  answer: "回答",
  text: "文章",
  createdAt: "登録日時",
  channel: "通知方法",
  address: "宛先",
  urgencies: "通知する緊急度",
  nightOnly: "夜間のみ",
  botName: "アシスタントの名前",
  aggregateSeconds: "写真を待つ時間",
  confidenceThreshold: "判定保留にする基準",
  nightStart: "夜間の開始時刻",
  nightEnd: "夜間の終了時刻",
  replyDelayMs: "返信までの間",
  askPhotoWhenMissing: "写真の催促",
  dailyReportTime: "日次レポートの時刻",
};

function describePath(path: readonly PropertyKey[]): string {
  const [section, ...rest] = path;
  const parts: string[] = [];
  if (typeof section === "string" && section in SECTION_LABELS) parts.push(`「${SECTION_LABELS[section as SettingsSection]}」`);
  let field: string | undefined;
  for (const key of rest) {
    if (typeof key === "number") {
      if (field === undefined) parts.push(`${key + 1}件目`);
    } else if (field === undefined) {
      field = FIELD_LABELS[String(key)] ?? String(key);
    }
  }
  if (field) parts.push(`「${field}」`);
  return parts.join("の");
}

function duplicateId(items: readonly { id: string }[]): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type SettingsParseResult =
  | { ok: true; settings: Settings; sections: SettingsSection[] }
  | { ok: false; error: string };

/**
 * Parses settings JSON (as written by 「設定を書き出す」, optionally wrapped as `{ "settings": … }`).
 * Sections present in the JSON replace those of `base`; missing sections are kept from `base`.
 */
export function parseSettings(raw: unknown, base: Settings): SettingsParseResult {
  const source = isRecord(raw) && isRecord(raw.settings) ? raw.settings : raw;
  if (!isRecord(source)) {
    return { ok: false, error: "設定データの形式が正しくありません。書き出した設定ファイルの内容をそのままお使いください。" };
  }
  const sections = SETTINGS_SECTIONS.filter((key) => key in source);
  if (sections.length === 0) {
    return {
      ok: false,
      error: "設定の項目が見つかりませんでした。「設定を書き出す」で保存したファイルをお使いください。",
    };
  }

  const result = importSchema.safeParse(source);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue ? describePath(issue.path) : "";
    return {
      ok: false,
      error: where
        ? `${where}の内容が正しくありません。値を確認してから、もう一度読み込んでください。`
        : "設定の内容が正しくありません。値を確認してから、もう一度読み込んでください。",
    };
  }

  const data = result.data;
  const settings: Settings = {
    stores: data.stores ?? base.stores,
    members: data.members ?? base.members,
    groups: data.groups ?? base.groups,
    replyPatterns: data.replyPatterns ?? base.replyPatterns,
    keywordRules: data.keywordRules ?? base.keywordRules,
    faqs: data.faqs ?? base.faqs,
    learned: data.learned ?? base.learned,
    notifyTargets: data.notifyTargets ?? base.notifyTargets,
    behavior: { ...base.behavior, ...data.behavior },
  };

  if (settings.members.length === 0) {
    return { ok: false, error: "「スタッフ」が1人も登録されていません。少なくとも1人は必要です。" };
  }
  if (settings.groups.length === 0) {
    return { ok: false, error: "「グループ」が登録されていません。少なくとも1つは必要です。" };
  }
  for (const key of SETTINGS_SECTIONS) {
    if (key === "behavior") continue;
    const dup = duplicateId(settings[key]);
    if (dup) return { ok: false, error: `「${SECTION_LABELS[key]}」のID「${dup}」が重複しています。` };
  }

  return { ok: true, settings, sections };
}

/** `parseSettings` for a JSON string (the admin import box). */
export function parseSettingsJson(json: string, base: Settings): SettingsParseResult {
  if (!json.trim()) return { ok: false, error: "読み込む内容が空です。設定ファイルの内容を貼り付けてください。" };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {
      ok: false,
      error: "JSONとして読み取れませんでした。書き出した設定ファイルの内容を、途中で切れないようにそのまま貼り付けてください。",
    };
  }
  return parseSettings(raw, base);
}
