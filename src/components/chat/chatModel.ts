/**
 * Pure helpers for the LINE-like simulator (no React, no DOM) — easy to unit-test.
 *
 * Everything time-related takes `now` as an argument; callers get it from `useNow()` after hydration.
 */
import { formatShortDate, tokyoDateKey, truncate } from "@/lib/format";
import { getScenario, scenarioPhotos, type SampleScenario } from "@/lib/samples";
import type { RecordActions } from "@/lib/store/selectors";
import {
  CHANNEL_LABELS,
  CLEANING_STATUS_LABELS,
  ISSUE_STATUS_LABELS,
  URGENCY_LABELS,
  type AnalysisRecord,
  type ChatMessage,
  type Group,
  type GroupKind,
  type Member,
  type MemberRole,
  type Photo,
  type Settings,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Drafts                                                              */
/* ------------------------------------------------------------------ */

/** What is typed / attached in the composer of one group (not sent yet). */
export interface Draft {
  text: string;
  photos: Photo[];
}

export const EMPTY_DRAFT: Draft = { text: "", photos: [] };

/** Photos per message — keeps the browser storage small and the bubbles readable. */
export const MAX_ATTACHED_PHOTOS = 4;

export function isDraftEmpty(draft: Draft): boolean {
  return draft.text.trim() === "" && draft.photos.length === 0;
}

/* ------------------------------------------------------------------ */
/* Timeline (date separators + LINE-style grouping)                    */
/* ------------------------------------------------------------------ */

export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      message: ChatMessage;
      /** same sender as the previous message within a few minutes → hide avatar and name */
      continued: boolean;
    };

const DAY_MS = 86_400_000;
const CONTINUE_WINDOW_MS = 3 * 60_000;

/** 「今日」「昨日」 or 「10月12日（月）」 (Asia/Tokyo). */
export function dateLabel(ms: number, now: number): string {
  const key = tokyoDateKey(ms);
  if (key === tokyoDateKey(now)) return "今日";
  // Japan has no daylight saving time, so "24 hours earlier" is always yesterday's date.
  if (key === tokyoDateKey(now - DAY_MS)) return "昨日";
  return formatShortDate(ms);
}

/** Messages (oldest first) with a date separator before the first message of every day. */
export function buildTimeline(messages: readonly ChatMessage[], now: number): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDay = "";
  let previous: ChatMessage | undefined;
  for (const message of messages) {
    const day = tokyoDateKey(message.createdAt);
    if (day !== lastDay) {
      items.push({ kind: "date", key: `date-${day}`, label: dateLabel(message.createdAt, now) });
      lastDay = day;
      previous = undefined;
    }
    const continued =
      previous !== undefined &&
      previous.senderId === message.senderId &&
      !previous.alert &&
      !message.alert &&
      message.createdAt - previous.createdAt < CONTINUE_WINDOW_MS;
    items.push({ kind: "message", key: message.id, message, continued });
    previous = message;
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Groups and senders                                                  */
/* ------------------------------------------------------------------ */

/** Who normally posts in each kind of group. Managers can post everywhere. */
const ROLES_BY_KIND: Record<GroupKind, readonly MemberRole[]> = {
  cleaning: ["staff", "manager"],
  callcenter: ["callcenter", "manager"],
  alerts: ["manager"],
};

/** Members who can be chosen as the sender in a group (all members if nobody fits). */
export function senderOptions(settings: Settings, group: Group): Member[] {
  const roles = ROLES_BY_KIND[group.kind] ?? [];
  const fitting = settings.members.filter((m) => roles.includes(m.role));
  return fitting.length > 0 ? fitting : settings.members;
}

/** The first non-manager who fits the group (managers get no auto-reply, so they are a poor default). */
export function defaultSenderId(settings: Settings, group: Group): string | undefined {
  const options = senderOptions(settings, group);
  return (options.find((m) => m.role !== "manager") ?? options[0])?.id;
}

/** The chosen sender if still valid for the group, else the default. */
export function resolveSenderId(settings: Settings, group: Group, wanted: string | undefined): string | undefined {
  if (wanted && senderOptions(settings, group).some((m) => m.id === wanted)) return wanted;
  if (wanted && settings.members.some((m) => m.id === wanted) && group.kind !== "alerts") return wanted;
  return defaultSenderId(settings, group);
}

/** Members shown in the group header, plus the assistant. */
export function groupMemberCount(settings: Settings, group: Group): number {
  return senderOptions(settings, group).length + 1;
}

/** One-line preview for the group list. */
export function messagePreview(message: ChatMessage): string {
  if (message.alert) return message.alert.title;
  const text = message.text.trim().replace(/\s+/g, " ");
  if (text) return text;
  if (message.photos.length > 0) return `写真を${message.photos.length}枚送信しました`;
  return "";
}

/* ------------------------------------------------------------------ */
/* Aggregation wait                                                    */
/* ------------------------------------------------------------------ */

/** 「写真の追加を待っています」 for text, 「コメントの追加を待っています」 for a photo-only post. */
export function waitingLabel(buffered: readonly ChatMessage[]): string {
  const hasText = buffered.some((m) => m.text.trim() !== "");
  const hasPhoto = buffered.some((m) => m.photos.length > 0);
  return hasPhoto && !hasText ? "コメントの追加を待っています" : "写真の追加を待っています";
}

/** Remaining share of the wait (1 → just sent, 0 → due). */
export function waitProgress(dueAt: number, now: number, totalMs: number): number {
  if (!(totalMs > 0)) return 0;
  return Math.min(1, Math.max(0, (dueAt - now) / totalMs));
}

/* ------------------------------------------------------------------ */
/* Scenarios (deep links and chips)                                    */
/* ------------------------------------------------------------------ */

export interface ScenarioPlan {
  scenario: SampleScenario;
  groupId: string;
  senderId: string;
  draft: Draft;
}

/** Resolves `?scenario=<id>` against the current settings (the sender may have been deleted). */
export function planScenario(id: string | null | undefined, settings: Settings): ScenarioPlan | null {
  const scenario = getScenario(id);
  if (!scenario) return null;
  const group = settings.groups.find((g) => g.id === scenario.groupId);
  if (!group) return null;
  const senderId = settings.members.some((m) => m.id === scenario.senderId)
    ? scenario.senderId
    : defaultSenderId(settings, group);
  if (!senderId) return null;
  const photos = scenarioPhotos(scenario).map(({ id, src, alt }) => ({ id, src, alt }));
  return { scenario, groupId: group.id, senderId, draft: { text: scenario.text, photos } };
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/**
 * message id → record, but only for the LAST message of each record, so a photo and a comment that
 * were judged together carry a single 「AI判定」 tag.
 */
export function recordTagIndex(records: readonly AnalysisRecord[]): Map<string, AnalysisRecord> {
  const index = new Map<string, AnalysisRecord>();
  for (const record of records) {
    const last = record.messageIds[record.messageIds.length - 1];
    if (last) index.set(last, record);
  }
  return index;
}

/** message id → record for every message of every record (to highlight a selected record). */
export function recordMembership(records: readonly AnalysisRecord[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const record of records) for (const id of record.messageIds) index.set(id, record.id);
  return index;
}

/**
 * Record shown by default in the AI panel: the latest record of a cleaning / call-center group,
 * or — for the managers' group — the record behind the latest alert card.
 */
export function defaultRecordId(
  group: Group,
  records: readonly AnalysisRecord[],
  messages: readonly ChatMessage[],
): string | undefined {
  if (group.kind === "alerts") {
    const bySource = recordMembership(records);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.groupId !== group.id || !m.alert) continue;
      for (const id of m.alert.sourceMessageIds) {
        const recordId = bySource.get(id);
        if (recordId) return recordId;
      }
    }
    return undefined;
  }
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i].groupId === group.id) return records[i].id;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Alert cards                                                         */
/* ------------------------------------------------------------------ */

export interface AlertField {
  label: string;
  value: string;
}

const ALERT_LABEL = /^(送信者|グループ|店舗|内容|写真|判断理由|[^\s：:]{0,8}判定(?:（[^）]*）)?)[：:]\s*(.*)$/u;

/**
 * Splits the forward body (「送信者：…\nグループ：…\n内容：…」) into label/value rows.
 * Lines without a known label continue the previous value (multi-line reports).
 */
export function parseAlertBody(text: string): AlertField[] {
  const fields: AlertField[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const match = ALERT_LABEL.exec(line.trim());
    if (match) {
      fields.push({ label: match[1], value: match[2] });
    } else if (fields.length > 0) {
      const last = fields[fields.length - 1];
      last.value = last.value ? `${last.value}\n${line}` : line;
    } else if (line.trim()) {
      fields.push({ label: "", value: line });
    }
  }
  return fields;
}

/* ------------------------------------------------------------------ */
/* Actions taken (AI panel)                                            */
/* ------------------------------------------------------------------ */

export type ActionKind = "reply" | "forward" | "issue" | "email" | "phone" | "chatwork" | "line" | "store";

export interface ActionItem {
  kind: ActionKind;
  label: string;
  detail?: string;
  /** false = shown greyed out as 「行っていません」 */
  done: boolean;
}

const STORE_NOTE = /の清掃状況を「[^」]+」に更新$/u;

/** Plan notes worth showing in addition to the action list. */
export function extraNotes(record: AnalysisRecord): string[] {
  return record.plan.notes.filter((n) => !(record.plan.storeStatus && STORE_NOTE.test(n)));
}

/** What the assistant did for a record, in a fixed order the owner can scan. */
export function describeActions(actions: RecordActions, settings: Settings): ActionItem[] {
  const { record } = actions;
  const { plan } = record;
  const items: ActionItem[] = [];

  if (plan.reply !== null) {
    items.push({ kind: "reply", label: "自動返信", detail: truncate((actions.reply?.text ?? plan.reply).replace(/\s+/g, " "), 64), done: true });
  } else {
    const category = record.correctedCategory ?? record.analysis.category;
    const isManager = settings.members.find((m) => m.id === record.senderId)?.role === "manager";
    // The photo of the same completion report was already thanked (see pipeline: no double thanks).
    const alreadyThanked = plan.notes.some((n) => n.includes("重ねての返信は省略"));
    items.push({
      kind: "reply",
      label: "自動返信",
      detail: isManager
        ? "管理者の投稿のため返信していません"
        : alreadyThanked
          ? "同じ完了報告にお礼を返信済みのため、重ねて返信していません"
          : category === "chat"
            ? "あいさつ・お礼のため返信していません"
            : "返信パターンが無効のため返信していません",
      done: false,
    });
  }

  if (plan.forward) {
    const names = actions.alerts
      .map((m) => settings.groups.find((g) => g.id === m.groupId)?.name)
      .filter((n): n is string => Boolean(n));
    const urgency = URGENCY_LABELS[plan.forward.urgency];
    items.push({
      kind: "forward",
      label: "管理者へ転送",
      detail: names.length > 0 ? `「${urgency}」として${names.join("・")}へ転送しました` : `「${urgency}」として通知しました`,
      done: true,
    });
  } else {
    items.push({ kind: "forward", label: "管理者へ転送", detail: "転送が必要な内容ではありません", done: false });
  }

  if (plan.createIssue) {
    items.push({
      kind: "issue",
      label: "要対応リストに登録",
      detail: actions.issue ? `現在の状況：${ISSUE_STATUS_LABELS[actions.issue.status]}` : undefined,
      done: true,
    });
  } else {
    items.push({ kind: "issue", label: "要対応リストに登録", detail: "対応が必要な内容ではありません", done: false });
  }

  for (const delivery of actions.deliveries) {
    const target = settings.notifyTargets.find((t) => t.id === delivery.targetId);
    const where = target ? `${target.name}（${target.address}）` : CHANNEL_LABELS[delivery.channel];
    switch (delivery.channel) {
      case "email":
        items.push({ kind: "email", label: "メール通知", detail: `${where}へ送信しました`, done: true });
        break;
      case "phone":
        items.push({ kind: "phone", label: "電話通知", detail: `${where}を自動音声で呼び出しました`, done: true });
        break;
      case "chatwork":
        items.push({ kind: "chatwork", label: "Chatwork通知", detail: `${where}へ送信しました`, done: true });
        break;
      default:
        items.push({ kind: "line", label: "LINEグループへ通知", detail: `${where}へ送信しました`, done: true });
        break;
    }
  }

  if (plan.storeStatus) {
    const { storeId, status } = plan.storeStatus;
    const store = settings.stores.find((s) => s.id === storeId);
    items.push({
      kind: "store",
      label: "店舗の清掃状況を更新",
      detail: `${store?.name ?? "店舗"}を「${CLEANING_STATUS_LABELS[status]}」にしました`,
      done: true,
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

/** Size that fits inside `max`×`max` keeping the aspect ratio (never enlarges). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0 && height > 0 && max > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
