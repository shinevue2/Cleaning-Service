/**
 * Shared domain types for the coin-laundry LINE auto-reply assistant.
 * Pure types only — imported by the engine, the client store, the LINE webhook and the UI.
 */

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/** What a message is about. Order matters for display. */
export type Category =
  | "cleaning_start" // 清掃開始の連絡
  | "cleaning_done" // 清掃完了の報告
  | "leftover" // 洗濯物の放置・忘れ物
  | "machine_error" // 機械のエラー・故障
  | "question" // 質問・確認依頼
  | "info" // 連絡事項（主にコールセンター）
  | "emergency" // 緊急トラブル
  | "chat" // あいさつ・お礼など（返信不要）
  | "unknown"; // 判定できない → 要確認として人へ

/** How urgently a human needs to act. */
export type Urgency = "normal" | "attention" | "urgent";

export const CATEGORY_ORDER: Category[] = [
  "cleaning_start",
  "cleaning_done",
  "leftover",
  "machine_error",
  "question",
  "info",
  "emergency",
  "chat",
  "unknown",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  cleaning_start: "清掃開始",
  cleaning_done: "清掃完了",
  leftover: "放置・忘れ物",
  machine_error: "機械エラー",
  question: "質問・確認",
  info: "連絡事項",
  emergency: "緊急トラブル",
  chat: "あいさつ等",
  unknown: "判定保留",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  normal: "通常",
  attention: "要対応",
  urgent: "緊急",
};

/** Facts pulled out of the text by the extractor. All optional. */
export interface Extracted {
  storeId?: string; // matched store id
  machine?: string; // e.g. "乾燥機3番", "洗濯機No.2"
  errorCode?: string; // e.g. "E21"
  days?: number; // e.g. 3 for "3日間"
  hasPhoto: boolean;
  keywords: string[]; // matched trigger words, for the "AI reasoning" display
}

/** Where the decision came from — shown in the UI as the basis of the judgement. */
export type DecisionSource =
  | "rule" // keyword / regex rule
  | "ai" // AI provider (mock in the demo, Claude in production)
  | "learned" // matched a human-corrected example
  | "faq" // matched an FAQ entry
  | "fallback"; // nothing matched well enough → safe side

export interface Analysis {
  /** primary category = the one that drives urgency */
  category: Category;
  /** other categories also detected, e.g. cleaning_done + leftover in one report */
  secondary: Category[];
  urgency: Urgency;
  confidence: number; // 0..1
  source: DecisionSource;
  /** Short Japanese explanation, written like an AI rationale. */
  reasoning: string;
  extracted: Extracted;
  /** id of the FAQ entry used to answer, when category === "question" and an FAQ matched */
  faqId?: string;
  /** id of the learned example used, when source === "learned" */
  exampleId?: string;
  /** true when the AI part was produced by the sample/mock provider (demo) */
  sample: boolean;
}

/* ------------------------------------------------------------------ */
/* Actions decided for an analysed message                             */
/* ------------------------------------------------------------------ */

export type StoreCleaningStatus =
  | "not_started" // 未着手
  | "cleaning" // 清掃中
  | "awaiting_photo" // 完了（写真待ち）
  | "done"; // 完了

export const CLEANING_STATUS_LABELS: Record<StoreCleaningStatus, string> = {
  not_started: "未着手",
  cleaning: "清掃中",
  awaiting_photo: "写真待ち",
  done: "完了",
};

export interface ActionPlan {
  /** Text the bot replies in the same group. null = no reply. */
  reply: string | null;
  /** Forward to notification targets for this urgency. null = no forward. */
  forward: { urgency: Urgency; title: string; body: string } | null;
  /** Create an open issue (要対応リスト). */
  createIssue: boolean;
  /** Update a store's cleaning status. */
  storeStatus?: { storeId: string; status: StoreCleaningStatus };
  /** Extra notes shown in the analysis panel, e.g. "夜間のため電話通知も実行". */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* People, places, groups                                              */
/* ------------------------------------------------------------------ */

export type MemberRole = "staff" | "callcenter" | "manager";

export const ROLE_LABELS: Record<MemberRole, string> = {
  staff: "清掃スタッフ",
  callcenter: "コールセンター",
  manager: "管理者",
};

export interface Member {
  id: string;
  name: string; // display name, e.g. "田中"
  role: MemberRole;
  storeIds: string[]; // stores this person usually covers
  /** LINE userId in production (U...); empty in the demo */
  lineUserId?: string;
  avatarColor: string; // tailwind-free hex, e.g. "#f59e0b"
}

export interface Store {
  id: string;
  name: string; // e.g. "駅前店"
  /** extra spellings to detect in text, e.g. ["駅前", "えきまえ"] */
  aliases: string[];
}

export type GroupKind = "cleaning" | "callcenter" | "alerts";

export interface Group {
  id: string;
  kind: GroupKind;
  name: string; // e.g. "【清掃】スタッフ連絡"
  /** LINE groupId in production (C...); empty in the demo */
  lineGroupId?: string;
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export interface Photo {
  id: string;
  /** data: URL (downscaled) or /public path */
  src: string;
  alt: string;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  /** member id, or "bot" for the assistant */
  senderId: string;
  text: string;
  photos: Photo[];
  createdAt: number; // epoch ms
  /** for bot messages: which incoming message(s) this replies to */
  replyTo?: string[];
  /** for bot messages in the alerts group: forwarded alert payload */
  alert?: { urgency: Urgency; title: string; sourceGroupId: string; sourceMessageIds: string[] };
  /** analysis attached to an incoming (human) message after processing */
  analysisId?: string;
}

/** One processed unit: possibly several raw messages merged (text + photos). */
export interface AnalysisRecord {
  id: string;
  groupId: string;
  senderId: string;
  messageIds: string[]; // merged raw messages
  combinedText: string;
  photoCount: number;
  analysis: Analysis;
  plan: ActionPlan;
  createdAt: number;
  /** set when a manager corrected the category in the logs screen */
  correctedCategory?: Category;
  /** urgency chosen together with correctedCategory */
  correctedUrgency?: Urgency;
  correctedAt?: number;
}

/* ------------------------------------------------------------------ */
/* Issues (要対応リスト)                                                */
/* ------------------------------------------------------------------ */

export type IssueStatus = "open" | "in_progress" | "resolved";

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "対応済み",
};

export interface Issue {
  id: string;
  analysisId: string;
  category: Category;
  urgency: Urgency;
  storeId?: string;
  title: string;
  detail: string;
  status: IssueStatus;
  createdAt: number;
  updatedAt: number;
  note?: string; // manager memo
}

/** A notification delivered to a non-chat target (email / phone / Chatwork) — shown in the UI as a log. */
export interface Delivery {
  id: string;
  targetId: string;
  channel: NotifyChannel;
  urgency: Urgency;
  title: string;
  body: string;
  recordId: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Settings (editable in the admin screens)                             */
/* ------------------------------------------------------------------ */

/**
 * Reply templates per category.
 * Placeholders: {name} sender name, {store} store name (empty when unknown — 「{store}の」 then disappears),
 * {target} composed subject such as "駅前店の乾燥機3番（E21）", {time} HH:MM, {answer} FAQ answer.
 */
export interface ReplyPattern {
  id: string;
  category: Category;
  /** optional sub-condition */
  when?: "with_photo" | "without_photo" | "night" | "any";
  /**
   * Only for senders with these roles; empty/undefined = everyone. A role-specific pattern beats a
   * general one with the same condition (e.g. the call center is not asked to put up a 「使用中止」 sign).
   */
  roles?: MemberRole[];
  /** variants; one is chosen at send time */
  texts: string[];
  enabled: boolean;
}

/** A keyword rule. Matching is done on normalised text (NFKC, lower-case, no spaces). */
export interface KeywordRule {
  id: string;
  category: Category;
  urgency: Urgency;
  /** any of these words triggers the rule; "A+B" = both words in the same sentence */
  keywords: string[];
  /**
   * keyword occurrences that overlap one of these words are ignored (e.g. "漏れなく" ignores the 漏れ in
   * it). Other occurrences in the same message still count, so a harmless phrase never hides a real alarm.
   */
  excludes: string[];
  /** only applies to messages from these roles; empty = all */
  roles: MemberRole[];
  enabled: boolean;
  /** shown in the admin screen */
  memo?: string;
}

export interface FaqEntry {
  id: string;
  /** question keywords — all of one group must appear; groups are OR-ed */
  patterns: string[][];
  question: string; // representative question, for display
  answer: string;
  enabled: boolean;
}

/** A manager correction used as a "learned" example. */
export interface LearnedExample {
  id: string;
  text: string; // original combined text
  category: Category;
  urgency: Urgency;
  createdAt: number;
}

export type NotifyChannel = "line_group" | "email" | "chatwork" | "phone";

export const CHANNEL_LABELS: Record<NotifyChannel, string> = {
  line_group: "LINEグループ",
  email: "メール",
  chatwork: "Chatwork",
  phone: "電話（自動音声）",
};

export interface NotifyTarget {
  id: string;
  name: string; // e.g. "管理者グループ（LINE）"
  channel: NotifyChannel;
  address: string; // group id / email / room id / phone (masked in demo)
  /** which urgencies are sent here */
  urgencies: Urgency[];
  /** only during night hours */
  nightOnly: boolean;
  enabled: boolean;
}

export interface BehaviorSettings {
  botName: string; // e.g. "ランドリーアシスタント"
  /** seconds to wait for follow-up photos/texts from the same sender before analysing */
  aggregateSeconds: number;
  /** below this confidence the message is treated as 判定保留 (unknown → human) */
  confidenceThreshold: number; // 0..1
  nightStart: string; // "22:00"
  nightEnd: string; // "08:00"
  /** reply delay to feel natural, ms */
  replyDelayMs: number;
  /** reply to cleaning-done without photo by asking for one */
  askPhotoWhenMissing: boolean;
  /** time of the daily report, "21:00" */
  dailyReportTime: string;
}

export interface Settings {
  stores: Store[];
  members: Member[];
  groups: Group[];
  replyPatterns: ReplyPattern[];
  keywordRules: KeywordRule[];
  faqs: FaqEntry[];
  learned: LearnedExample[];
  notifyTargets: NotifyTarget[];
  behavior: BehaviorSettings;
}

/* ------------------------------------------------------------------ */
/* Engine I/O                                                           */
/* ------------------------------------------------------------------ */

export interface EngineInput {
  text: string;
  photoCount: number;
  sender: Member;
  group: Group;
  /** epoch ms — used for night mode and {time} */
  now: number;
}

export interface EngineResult {
  analysis: Analysis;
  plan: ActionPlan;
}
