/**
 * Server-side configuration for the LINE webhook and the analyze API.
 *
 * Settings = defaultSettings()
 *          ← APP_SETTINGS_JSON   (optional; the JSON exported from 管理画面 › 設定 › データ)
 *          ← LINE_GROUP_CLEANING / LINE_GROUP_CALLCENTER / LINE_GROUP_ALERTS (LINE group IDs)
 *
 * Each top-level section of APP_SETTINGS_JSON is validated on its own: a broken section falls back
 * to the default and is reported in `warnings`, so a typo can never take the webhook down.
 */
import "server-only";

import { z } from "zod";
import { defaultSettings } from "../seed";
import type { Group, GroupKind, Settings } from "../types";
import { CATEGORY_VALUES, URGENCY_VALUES } from "../ai/schema";

type Env = Record<string, string | undefined>;

/* ------------------------------------------------------------------ */
/* Settings schema                                                     */
/* ------------------------------------------------------------------ */

const ROLE_VALUES = ["staff", "callcenter", "manager"] as const;
const GROUP_KIND_VALUES = ["cleaning", "callcenter", "alerts"] as const;
const CHANNEL_VALUES = ["line_group", "email", "chatwork", "phone"] as const;
const CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/;

const id = z.string().trim().min(1);
const strings = z.array(z.string()).default([]);
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const StoreSchema = z.object({ id, name: z.string().trim().min(1), aliases: strings });

const MemberSchema = z.object({
  id,
  name: z.string(),
  role: z.enum(ROLE_VALUES),
  storeIds: strings,
  lineUserId: optionalString,
  avatarColor: z.string().default("#64748b"),
});

const GroupSchema = z.object({
  id,
  kind: z.enum(GROUP_KIND_VALUES),
  name: z.string().trim().min(1),
  lineGroupId: optionalString,
});

const ReplyPatternSchema = z.object({
  id,
  category: z.enum(CATEGORY_VALUES),
  when: z.enum(["with_photo", "without_photo", "night", "any"]).optional(),
  roles: z.array(z.enum(ROLE_VALUES)).optional(),
  texts: z.array(z.string()),
  enabled: z.boolean().default(true),
});

const KeywordRuleSchema = z.object({
  id,
  category: z.enum(CATEGORY_VALUES),
  urgency: z.enum(URGENCY_VALUES),
  keywords: z.array(z.string()),
  excludes: strings,
  roles: z.array(z.enum(ROLE_VALUES)).default([]),
  enabled: z.boolean().default(true),
  memo: z.string().optional(),
});

const FaqSchema = z.object({
  id,
  patterns: z.array(z.array(z.string())),
  question: z.string(),
  answer: z.string(),
  enabled: z.boolean().default(true),
});

const LearnedSchema = z.object({
  id,
  text: z.string(),
  category: z.enum(CATEGORY_VALUES),
  urgency: z.enum(URGENCY_VALUES),
  createdAt: z.number().finite(),
});

const NotifyTargetSchema = z.object({
  id,
  name: z.string(),
  channel: z.enum(CHANNEL_VALUES),
  address: z.string(),
  urgencies: z.array(z.enum(URGENCY_VALUES)),
  nightOnly: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const BehaviorPatchSchema = z
  .object({
    botName: z.string().trim().min(1),
    aggregateSeconds: z.number().min(0).max(120),
    confidenceThreshold: z.number().min(0).max(1),
    nightStart: z.string().regex(CLOCK),
    nightEnd: z.string().regex(CLOCK),
    replyDelayMs: z.number().min(0).max(60_000),
    askPhotoWhenMissing: z.boolean(),
    dailyReportTime: z.string().regex(CLOCK),
  })
  .partial();

const LIST_SECTIONS = {
  stores: z.array(StoreSchema),
  members: z.array(MemberSchema),
  groups: z.array(GroupSchema),
  replyPatterns: z.array(ReplyPatternSchema),
  keywordRules: z.array(KeywordRuleSchema),
  faqs: z.array(FaqSchema),
  learned: z.array(LearnedSchema),
  notifyTargets: z.array(NotifyTargetSchema),
} as const;

type ListSection = keyof typeof LIST_SECTIONS;
const LIST_SECTION_NAMES = Object.keys(LIST_SECTIONS) as ListSection[];

export interface LoadedSettings {
  settings: Settings;
  /** Human-readable problems found in APP_SETTINGS_JSON (logged by the routes). */
  warnings: string[];
}

/** Merges a settings JSON (full or partial) over `base`. Unknown keys are ignored. */
export function mergeSettingsJson(base: Settings, json: string): LoadedSettings {
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { settings: base, warnings: ["APP_SETTINGS_JSON がJSONとして読み取れないため、初期設定を使います。"] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { settings: base, warnings: ["APP_SETTINGS_JSON の形式が正しくないため、初期設定を使います。"] };
  }
  const input = data as Record<string, unknown>;
  const settings: Settings = { ...base };

  // Assigning through a narrow helper keeps each section's schema and the Settings field in lock-step.
  const assign = <K extends ListSection>(key: K, value: Settings[K]) => {
    settings[key] = value;
  };
  for (const key of LIST_SECTION_NAMES) {
    if (!(key in input)) continue;
    const parsed = LIST_SECTIONS[key].safeParse(input[key]);
    if (parsed.success) assign(key, parsed.data as Settings[typeof key]);
    else warnings.push(`APP_SETTINGS_JSON の「${key}」に不正な値があるため、この項目は初期設定を使います。`);
  }

  if ("behavior" in input) {
    const parsed = BehaviorPatchSchema.safeParse(input.behavior);
    if (parsed.success) settings.behavior = { ...base.behavior, ...parsed.data };
    else warnings.push("APP_SETTINGS_JSON の「behavior」に不正な値があるため、この項目は初期設定を使います。");
  }
  return { settings, warnings };
}

const GROUP_ENV: ReadonlyArray<[GroupKind, string]> = [
  ["cleaning", "LINE_GROUP_CLEANING"],
  ["callcenter", "LINE_GROUP_CALLCENTER"],
  ["alerts", "LINE_GROUP_ALERTS"],
];

/** defaultSettings() ← APP_SETTINGS_JSON ← LINE_GROUP_* env. */
export function loadServerSettings(env: Env = process.env): LoadedSettings {
  const base = defaultSettings();
  const json = env.APP_SETTINGS_JSON?.trim();
  const { settings, warnings } = json ? mergeSettingsJson(base, json) : { settings: base, warnings: [] as string[] };

  const groups: Group[] = settings.groups.map((g) => ({ ...g }));
  for (const [kind, name] of GROUP_ENV) {
    const lineGroupId = env[name]?.trim();
    if (!lineGroupId) continue;
    const group = groups.find((g) => g.kind === kind);
    if (group) group.lineGroupId = lineGroupId;
    else warnings.push(`${name} に対応するグループが設定にないため、無視しました。`);
  }
  return { settings: { ...settings, groups }, warnings };
}

/* ------------------------------------------------------------------ */
/* LINE connection                                                     */
/* ------------------------------------------------------------------ */

export interface LineCredentials {
  channelSecret: string;
  accessToken: string;
}

/** Both secrets present → the real webhook is enabled. */
export function readLineCredentials(env: Env = process.env): LineCredentials | null {
  const channelSecret = env.LINE_CHANNEL_SECRET?.trim();
  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  return channelSecret && accessToken ? { channelSecret, accessToken } : null;
}

/** Optional https link shown as 「詳細を確認する」 on alert cards (e.g. the admin screen or a shared sheet). */
export function readAlertLinkUrl(env: Env = process.env): string | undefined {
  const url = env.LINE_ALERT_LINK_URL?.trim();
  return url && /^https:\/\//.test(url) ? url : undefined;
}

/** LINE ids: C… group, R… multi-person chat, U… user. */
export function isLineId(value: string): boolean {
  return /^[CRU][0-9a-f]{32}$/i.test(value.trim());
}

/**
 * A `line_group` notify target's address is either a LINE id ("C…") or the id of a group in the
 * settings (e.g. "g_alerts"), which is resolved through that group's `lineGroupId`.
 */
export function resolveLineDestination(address: string, settings: Settings): string | undefined {
  const value = address.trim();
  if (!value) return undefined;
  if (isLineId(value)) return value;
  // An id the owner configured explicitly (env / settings) is trusted as-is.
  const group = settings.groups.find((g) => g.id === value);
  return group?.lineGroupId?.trim() || undefined;
}
