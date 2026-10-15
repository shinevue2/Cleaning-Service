/**
 * Derived data for the screens.
 *
 * Each `select*` function is pure (easy to test, usable anywhere); each `use*` hook subscribes to the
 * smallest slice of the store and memoises the result. zustand v5 compares selector results with
 * Object.is, so never select a freshly built array/object directly — use these hooks instead.
 *
 * "Today" always means the Asia/Tokyo calendar day of the `now` you pass in. Get `now` from `useNow()`
 * (null during SSR / before mount) so nothing time-dependent renders on the server.
 */
import { useEffect, useMemo, useState } from "react";
import { URGENCY_RANK, normalize, tokyoDateKey } from "@/lib/engine";
import { BOT_ID } from "@/lib/seed";
import {
  CATEGORY_ORDER,
  type AnalysisRecord,
  type Category,
  type Urgency,
  type ChatMessage,
  type Delivery,
  type Issue,
  type LearnedExample,
  type Member,
  type MemberRole,
  type Settings,
  type Store,
  type StoreCleaningStatus,
} from "@/lib/types";
import { UNKNOWN_MEMBER_COLOR, UNKNOWN_MEMBER_NAME, shortMemberName, type StoreStatusEntry } from "./pipeline";
import { useDemoStore, type PendingEntry } from "./store";

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/** Messages of one group, oldest first. */
export function selectGroupMessages(messages: readonly ChatMessage[], groupId: string): ChatMessage[] {
  return messages.filter((m) => m.groupId === groupId);
}

/** Alert cards posted to the alerts group(s), newest first. */
export function selectRecentAlerts(messages: readonly ChatMessage[], limit = 5): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i -= 1) {
    if (messages[i].alert) out.push(messages[i]);
  }
  return out;
}

export function selectMessagesByIds(messages: readonly ChatMessage[], ids: readonly string[]): ChatMessage[] {
  const wanted = new Set(ids);
  return messages.filter((m) => wanted.has(m.id));
}

/* ------------------------------------------------------------------ */
/* Senders                                                             */
/* ------------------------------------------------------------------ */

export interface SenderInfo {
  id: string;
  /** full display name, e.g. 「山本（コールセンター）」 */
  name: string;
  /** name without the parenthesised role, e.g. 「山本」 */
  shortName: string;
  role: MemberRole | "bot";
  color: string;
  isBot: boolean;
  /** false when the member was deleted from the settings */
  known: boolean;
  member?: Member;
}

const BOT_COLOR = "#06b6a4";

/** Display info for any sender id, including the bot and deleted members. */
export function selectSender(settings: Settings, senderId: string): SenderInfo {
  if (senderId === BOT_ID) {
    const name = settings.behavior.botName || "アシスタント";
    return { id: BOT_ID, name, shortName: name, role: "bot", color: BOT_COLOR, isBot: true, known: true };
  }
  const member = settings.members.find((m) => m.id === senderId);
  if (!member) {
    return {
      id: senderId,
      name: UNKNOWN_MEMBER_NAME,
      shortName: UNKNOWN_MEMBER_NAME,
      role: "staff",
      color: UNKNOWN_MEMBER_COLOR,
      isBot: false,
      known: false,
    };
  }
  return {
    id: member.id,
    name: member.name,
    shortName: shortMemberName(member.name),
    role: member.role,
    color: member.avatarColor,
    isBot: false,
    known: true,
    member,
  };
}

/* ------------------------------------------------------------------ */
/* Analysis records                                                    */
/* ------------------------------------------------------------------ */

/** The category after a manager's correction, if any. */
export function effectiveCategory(record: AnalysisRecord): Category {
  return record.correctedCategory ?? record.analysis.category;
}

/** Usual urgency of a category — for corrections saved before `correctedUrgency` existed. */
const USUAL_URGENCY: Record<Category, Urgency> = {
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

/** The urgency after a manager's correction, if any (an emergency is always 緊急). */
export function effectiveUrgency(record: AnalysisRecord): Urgency {
  const corrected = record.correctedCategory;
  if (!corrected) return record.analysis.urgency;
  if (corrected === "emergency") return "urgent";
  return record.correctedUrgency ?? USUAL_URGENCY[corrected];
}

/** source message id → record (every raw message merged into the record maps to it). */
export function selectRecordIndex(records: readonly AnalysisRecord[]): Map<string, AnalysisRecord> {
  const index = new Map<string, AnalysisRecord>();
  for (const r of records) for (const id of r.messageIds) index.set(id, r);
  return index;
}

/**
 * The record behind any message: a human message (via analysisId), a bot reply (via replyTo) or an
 * alert card (via alert.sourceMessageIds).
 */
export function selectRecordForMessage(
  records: readonly AnalysisRecord[],
  message: ChatMessage | undefined,
  index: Map<string, AnalysisRecord> = selectRecordIndex(records),
): AnalysisRecord | undefined {
  if (!message) return undefined;
  if (message.analysisId) {
    const direct = records.find((r) => r.id === message.analysisId);
    if (direct) return direct;
  }
  const sourceId = message.replyTo?.[0] ?? message.alert?.sourceMessageIds[0] ?? message.id;
  return index.get(sourceId);
}

export interface RecordActions {
  record: AnalysisRecord;
  /** the bot's reply in the source group */
  reply?: ChatMessage;
  /** alert cards posted to the managers' group */
  alerts: ChatMessage[];
  issue?: Issue;
  /** email / phone / Chatwork notifications */
  deliveries: Delivery[];
  /** the learned example created from a correction of this record */
  learned?: LearnedExample;
}

/** Everything that happened because of a record — for the AI判定パネル and the log details. */
export function selectRecordActions(
  state: { messages: readonly ChatMessage[]; issues: readonly Issue[]; deliveries: readonly Delivery[]; settings: Settings },
  record: AnalysisRecord,
): RecordActions {
  const sources = new Set(record.messageIds);
  let reply: ChatMessage | undefined;
  const alerts: ChatMessage[] = [];
  for (const m of state.messages) {
    if (m.senderId !== BOT_ID) continue;
    if (!reply && m.groupId === record.groupId && m.replyTo?.some((id) => sources.has(id))) reply = m;
    if (m.alert && m.alert.sourceMessageIds.some((id) => sources.has(id))) alerts.push(m);
  }
  const text = record.combinedText.trim();
  return {
    record,
    reply,
    alerts,
    issue: state.issues.find((i) => i.analysisId === record.id),
    deliveries: state.deliveries.filter((d) => d.recordId === record.id),
    learned:
      record.correctedCategory && normalize(text)
        ? state.settings.learned.find((l) => normalize(l.text) === normalize(text))
        : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

export function isToday(ms: number, now: number): boolean {
  return tokyoDateKey(ms) === tokyoDateKey(now);
}

export function selectTodayRecords(records: readonly AnalysisRecord[], now: number): AnalysisRecord[] {
  const today = tokyoDateKey(now);
  return records.filter((r) => tokyoDateKey(r.createdAt) === today);
}

export interface TodayStats {
  /** processed reports today (photo + comment sent separately count once) */
  received: number;
  /** raw human messages today in the cleaning / call-center groups */
  messages: number;
  autoReplied: number;
  forwarded: number;
  emergencies: number;
  /** answered from the FAQ without a human */
  faqAnswers: number;
  /** received − forwarded */
  autoHandled: number;
  /** autoHandled / received (0..1); null when nothing was received yet */
  autoRate: number | null;
  /** unresolved issues (any day) */
  openIssues: number;
  urgentOpenIssues: number;
  byCategory: Record<Category, number>;
}

export function selectTodayStats(
  records: readonly AnalysisRecord[],
  issues: readonly Issue[],
  messages: readonly ChatMessage[],
  now: number,
  settings?: Settings,
): TodayStats {
  const today = selectTodayRecords(records, now);
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of today) byCategory[effectiveCategory(r)] += 1;
  const forwarded = today.filter((r) => r.plan.forward !== null).length;
  const unresolved = issues.filter((i) => i.status !== "resolved");
  const todayKey = tokyoDateKey(now);
  const humanGroups = settings ? new Set(settings.groups.filter((g) => g.kind !== "alerts").map((g) => g.id)) : null;
  return {
    received: today.length,
    messages: messages.filter(
      (m) =>
        m.senderId !== BOT_ID &&
        (humanGroups ? humanGroups.has(m.groupId) : !m.alert) &&
        tokyoDateKey(m.createdAt) === todayKey &&
        (!settings || settings.members.find((x) => x.id === m.senderId)?.role !== "manager"),
    ).length,
    autoReplied: today.filter((r) => r.plan.reply !== null).length,
    forwarded,
    emergencies: byCategory.emergency,
    faqAnswers: today.filter((r) => r.analysis.source === "faq" || Boolean(r.analysis.faqId)).length,
    autoHandled: today.length - forwarded,
    autoRate: today.length > 0 ? (today.length - forwarded) / today.length : null,
    openIssues: unresolved.length,
    urgentOpenIssues: unresolved.filter((i) => i.urgency === "urgent").length,
    byCategory,
  };
}

/* ------------------------------------------------------------------ */
/* Issues                                                              */
/* ------------------------------------------------------------------ */

/**
 * Unresolved issues: urgent first, then newest first. The order deliberately ignores 未対応 / 対応中,
 * so changing a row's status never moves it under the owner's pointer (the badge shows the status).
 */
export function selectOpenIssues(issues: readonly Issue[]): Issue[] {
  return issues
    .filter((i) => i.status !== "resolved")
    .sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* Store board                                                         */
/* ------------------------------------------------------------------ */

export interface StoreBoardRow {
  store: Store;
  /** today's status; anything older than today counts as 未着手 */
  status: StoreCleaningStatus;
  updatedAt?: number;
  member?: Member;
}

export function selectStoreBoard(
  settings: Settings,
  storeStatus: Readonly<Record<string, StoreStatusEntry>>,
  now: number,
): StoreBoardRow[] {
  const today = tokyoDateKey(now);
  return settings.stores.map((store) => {
    const entry = storeStatus[store.id];
    if (!entry || tokyoDateKey(entry.updatedAt) !== today) return { store, status: "not_started" };
    const member = entry.memberId ? settings.members.find((m) => m.id === entry.memberId) : undefined;
    return { store, status: entry.status, updatedAt: entry.updatedAt, member };
  });
}

/* ------------------------------------------------------------------ */
/* Pending buffers                                                     */
/* ------------------------------------------------------------------ */

export function selectPendingForGroup(pending: Readonly<Record<string, PendingEntry>>, groupId: string): PendingEntry[] {
  return Object.values(pending)
    .filter((p) => p.groupId === groupId)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Current time for "today" filters and relative times, refreshed every `intervalMs`.
 * Returns null on the server and during the first client render (render a skeleton).
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, Math.max(250, intervalMs));
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

export function useGroupMessages(groupId: string): ChatMessage[] {
  const messages = useDemoStore((s) => s.messages);
  return useMemo(() => selectGroupMessages(messages, groupId), [messages, groupId]);
}

export function useRecordActions(record: AnalysisRecord | undefined): RecordActions | undefined {
  const messages = useDemoStore((s) => s.messages);
  const issues = useDemoStore((s) => s.issues);
  const deliveries = useDemoStore((s) => s.deliveries);
  const settings = useDemoStore((s) => s.settings);
  return useMemo(
    () => (record ? selectRecordActions({ messages, issues, deliveries, settings }, record) : undefined),
    [record, messages, issues, deliveries, settings],
  );
}

export function useTodayStats(now: number | null): TodayStats | null {
  const records = useDemoStore((s) => s.records);
  const issues = useDemoStore((s) => s.issues);
  const messages = useDemoStore((s) => s.messages);
  const settings = useDemoStore((s) => s.settings);
  return useMemo(
    () => (now === null ? null : selectTodayStats(records, issues, messages, now, settings)),
    [records, issues, messages, now, settings],
  );
}

export function useOpenIssues(): Issue[] {
  const issues = useDemoStore((s) => s.issues);
  return useMemo(() => selectOpenIssues(issues), [issues]);
}

export function useStoreBoard(now: number | null): StoreBoardRow[] | null {
  const settings = useDemoStore((s) => s.settings);
  const storeStatus = useDemoStore((s) => s.storeStatus);
  return useMemo(() => (now === null ? null : selectStoreBoard(settings, storeStatus, now)), [settings, storeStatus, now]);
}

export function useRecentAlerts(limit = 5): ChatMessage[] {
  const messages = useDemoStore((s) => s.messages);
  return useMemo(() => selectRecentAlerts(messages, limit), [messages, limit]);
}

export function usePendingForGroup(groupId: string): PendingEntry[] {
  const pending = useDemoStore((s) => s.pending);
  return useMemo(() => selectPendingForGroup(pending, groupId), [pending, groupId]);
}

