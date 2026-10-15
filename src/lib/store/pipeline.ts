/**
 * Message-processing pipeline shared by the live store and the seed history.
 *
 * Pure functions only (no React, no timers, no storage): a batch of raw chat messages from one sender
 * goes in, a `BatchOutcome` (analysis record, bot reply, alert posts, issue, deliveries, store status)
 * comes out, and `applyOutcome()` merges it into the history. Keeping this in one place guarantees that
 * the seeded "today" history and live messages produce exactly the same kind of data.
 */
import { analyze, cleanAlertTitle, routeTargets, run, shortName, tokyoDateKey } from "@/lib/engine";
import { BOT_ID } from "@/lib/seed";
import { CATEGORY_LABELS } from "@/lib/types";
import type {
  AnalysisRecord,
  ChatMessage,
  Delivery,
  EngineResult,
  Group,
  Issue,
  Member,
  Settings,
  StoreCleaningStatus,
} from "@/lib/types";
import type { IdKind } from "./ids";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export interface StoreStatusEntry {
  status: StoreCleaningStatus;
  updatedAt: number;
  memberId?: string;
}

/** The persisted, append-mostly part of the demo data. */
export interface HistoryState {
  messages: ChatMessage[];
  records: AnalysisRecord[];
  issues: Issue[];
  deliveries: Delivery[];
  storeStatus: Record<string, StoreStatusEntry>;
}

export type IdFactory = (kind: IdKind) => string;

/** Everything one processed batch produces. */
export interface BatchOutcome {
  record: AnalysisRecord;
  /** bot reply in the source group (null = no reply) */
  reply: ChatMessage | null;
  /** alert cards posted into alerts groups (one per routed LINE group target) */
  alerts: ChatMessage[];
  issue: Issue | null;
  /** notifications to non-chat targets (email / phone / Chatwork / LINE groups outside the demo) */
  deliveries: Delivery[];
  storeStatus: { storeId: string; entry: StoreStatusEntry } | null;
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const UNKNOWN_MEMBER_NAME = "未登録のメンバー";
export const UNKNOWN_MEMBER_COLOR = "#94a3b8";

/** The member who sent a message; a deleted/unknown sender is treated as an unregistered staff member. */
export function resolveSender(settings: Settings, senderId: string): Member {
  return (
    settings.members.find((m) => m.id === senderId) ?? {
      id: senderId,
      name: UNKNOWN_MEMBER_NAME,
      role: "staff",
      storeIds: [],
      avatarColor: UNKNOWN_MEMBER_COLOR,
    }
  );
}

/** The bot reads cleaning and call-center groups. The managers' alerts group is never classified. */
export function isProcessableGroup(group: Group | undefined): group is Group {
  return Boolean(group) && group?.kind !== "alerts";
}

/** Human, non-manager message in a processable group = something the bot must analyse. */
export function needsAnalysis(message: ChatMessage, settings: Settings): boolean {
  if (message.senderId === BOT_ID || message.analysisId) return false;
  const group = settings.groups.find((g) => g.id === message.groupId);
  if (!isProcessableGroup(group)) return false;
  return resolveSender(settings, message.senderId).role !== "manager";
}

/** "山本（コールセンター）" → "山本" so that "{name}さん" reads naturally (same rule as the engine). */
export const shortMemberName = shortName;

/* ------------------------------------------------------------------ */
/* Aggregation helpers                                                 */
/* ------------------------------------------------------------------ */

export interface CombinedBatch {
  text: string;
  photoCount: number;
  hasText: boolean;
  hasPhoto: boolean;
}

/** Texts are newline-joined in order; photos are counted across the batch. */
export function combineBatch(messages: readonly ChatMessage[]): CombinedBatch {
  const texts = messages.map((m) => m.text.trim()).filter((t) => t !== "");
  const photoCount = messages.reduce((n, m) => n + m.photos.length, 0);
  return { text: texts.join("\n"), photoCount, hasText: texts.length > 0, hasPhoto: photoCount > 0 };
}

/**
 * Whether a buffered batch must be analysed now instead of waiting for follow-up photos/texts:
 * it already has both a text and a photo, or it is urgent (never make an emergency wait).
 */
export function shouldFlushNow(
  messages: readonly ChatMessage[],
  settings: Settings,
  sender: Member,
  group: Group,
  now: number,
): boolean {
  const batch = combineBatch(messages);
  if (batch.hasText && batch.hasPhoto) return true;
  if (!batch.hasText) return false;
  const analysis = analyze({ text: batch.text, photoCount: batch.photoCount, sender, group, now }, settings);
  // Also words that only hint at danger (判定保留 but 緊急): never make those wait either.
  return analysis.category === "emergency" || analysis.urgency === "urgent";
}

/* ------------------------------------------------------------------ */
/* Processing                                                          */
/* ------------------------------------------------------------------ */

export interface ProcessArgs {
  settings: Settings;
  group: Group;
  sender: Member;
  /** raw messages of the batch, oldest first */
  messages: readonly ChatMessage[];
  /** analysis time (epoch ms) */
  now: number;
  /** current store statuses — used to match a late completion photo to the store waiting for it */
  storeStatus: Readonly<Record<string, StoreStatusEntry>>;
  /** analysis records so far — used to avoid thanking the same completion report twice */
  records?: readonly AnalysisRecord[];
  newId: IdFactory;
  /** reply-variant picker (default: random) */
  pick?: (n: number) => number;
}

/**
 * A staff member who covers several stores reported 「清掃終わりました」 without a photo and then sends
 * only the photo: the engine cannot tell which store the photo belongs to. When exactly one store is
 * waiting for a completion photo from this person today, the photo is attributed to that store.
 */
function storeAwaitingPhoto(args: ProcessArgs): string | undefined {
  const { settings, sender, storeStatus, now } = args;
  const today = tokyoDateKey(now);
  const candidates = settings.stores.filter((store) => {
    const entry = storeStatus[store.id];
    if (!entry || entry.status !== "awaiting_photo" || tokyoDateKey(entry.updatedAt) !== today) return false;
    return entry.memberId === sender.id || (entry.memberId === undefined && sender.storeIds.includes(store.id));
  });
  return candidates.length === 1 ? candidates[0].id : undefined;
}

/** A completion report already thanked (with photos) within this window is not thanked twice. */
export const ACK_MEMORY_MS = 10 * 60_000;

const sameStore = (a: string | undefined, b: string | undefined): boolean => a === undefined || b === undefined || a === b;

/**
 * The photo arrived first and was thanked, then the comment came after the aggregation window
 * (typing with an IME easily takes longer): the latest completion report of this sender in this
 * group, if it had photos and was made within ACK_MEMORY_MS. Same rule as the LINE webhook.
 */
function recentPhotoCompletion(args: ProcessArgs, storeId: string | undefined): AnalysisRecord | undefined {
  const { records, sender, group, now } = args;
  if (!records) return undefined;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (r.senderId !== sender.id || r.groupId !== group.id) continue;
    if (now - r.createdAt > ACK_MEMORY_MS) return undefined;
    if ((r.correctedCategory ?? r.analysis.category) !== "cleaning_done") continue;
    const hadPhoto = r.photoCount > 0 || r.analysis.extracted.hasPhoto;
    return hadPhoto && sameStore(r.analysis.extracted.storeId, storeId) ? r : undefined;
  }
  return undefined;
}

function analyseBatch(args: ProcessArgs, batch: CombinedBatch): EngineResult {
  const { settings, group, sender, now, pick } = args;
  const input = { text: batch.text, photoCount: batch.photoCount, sender, group, now };
  const result = run(input, settings, pick);
  const { analysis } = result;

  // A comment (or an extra photo) after an already-thanked completion photo belongs to the same
  // report: record it and update the store, but don't thank twice.
  const partial = !(batch.hasText && batch.hasPhoto);
  if (partial && sender.role === "staff" && analysis.category === "cleaning_done") {
    const previous = recentPhotoCompletion(args, analysis.extracted.storeId);
    if (previous && batch.hasPhoto) {
      return {
        analysis,
        plan: { ...result.plan, reply: null, notes: ["直前の完了報告に追加された写真として受け付けました（重ねての返信は省略）", ...result.plan.notes] },
      };
    }
    if (previous) {
      const merged = run({ ...input, photoCount: Math.max(1, previous.photoCount) }, settings, pick);
      if (merged.analysis.category === "cleaning_done") {
        return {
          analysis: { ...merged.analysis, extracted: { ...merged.analysis.extracted, hasPhoto: true } },
          plan: {
            ...merged.plan,
            reply: null,
            notes: ["直前に届いた写真と同じ完了報告として受け付けました（重ねての返信は省略）", ...merged.plan.notes],
          },
        };
      }
    }
  }
  if (
    batch.hasPhoto &&
    sender.role === "staff" &&
    analysis.category === "cleaning_done" &&
    !analysis.extracted.storeId &&
    !result.plan.storeStatus
  ) {
    const storeId = storeAwaitingPhoto(args);
    const store = storeId ? settings.stores.find((s) => s.id === storeId) : undefined;
    if (store) {
      // Re-run with the sender scoped to that store so the reply, reasoning and status all name it.
      const scoped = run({ ...input, sender: { ...sender, storeIds: [store.id] } }, settings, pick);
      if (scoped.analysis.category === "cleaning_done" && scoped.plan.storeStatus?.storeId === store.id) {
        return {
          analysis: scoped.analysis,
          plan: {
            ...scoped.plan,
            notes: [`写真待ちだった${store.name}の完了写真として受け付けました`, ...scoped.plan.notes],
          },
        };
      }
    }
  }
  return result;
}

/** 「⚠️ 要対応：南町店 乾燥機3番（E21）」 → 「南町店 乾燥機3番（E21）」 (the list shows urgency as a badge). */
export { cleanAlertTitle };

/** Analyses one batch and decides every side effect. All timestamps are `now`; see `stampOutcome`. */
export function processBatch(args: ProcessArgs): BatchOutcome {
  const { settings, group, sender, messages, now, newId } = args;
  const batch = combineBatch(messages);
  const { analysis, plan } = analyseBatch(args, batch);

  const record: AnalysisRecord = {
    id: newId("rec"),
    groupId: group.id,
    senderId: sender.id,
    messageIds: messages.map((m) => m.id),
    combinedText: batch.text,
    photoCount: batch.photoCount,
    analysis,
    plan,
    createdAt: now,
  };

  const reply: ChatMessage | null = plan.reply
    ? {
        id: newId("msg"),
        groupId: group.id,
        senderId: BOT_ID,
        text: plan.reply,
        photos: [],
        createdAt: now,
        replyTo: record.messageIds,
      }
    : null;

  const alerts: ChatMessage[] = [];
  const deliveries: Delivery[] = [];
  if (plan.forward) {
    const forward = plan.forward;
    const postedTo = new Set<string>();
    for (const target of routeTargets(forward.urgency, now, settings)) {
      if (target.channel === "line_group") {
        const alertGroup = settings.groups.find(
          (g) => g.id === target.address || (Boolean(g.lineGroupId) && g.lineGroupId === target.address),
        );
        // Never post an alert back into the group it came from (that would loop in production).
        if (alertGroup && alertGroup.id !== group.id) {
          if (postedTo.has(alertGroup.id)) continue;
          postedTo.add(alertGroup.id);
          alerts.push({
            id: newId("msg"),
            groupId: alertGroup.id,
            senderId: BOT_ID,
            text: forward.body,
            photos: [],
            createdAt: now,
            alert: {
              urgency: forward.urgency,
              title: forward.title,
              sourceGroupId: group.id,
              sourceMessageIds: record.messageIds,
            },
          });
          continue;
        }
        if (alertGroup) continue;
      }
      deliveries.push({
        id: newId("dlv"),
        targetId: target.id,
        channel: target.channel,
        urgency: forward.urgency,
        title: forward.title,
        body: forward.body,
        recordId: record.id,
        createdAt: now,
      });
    }
  }

  let issue: Issue | null = null;
  if (plan.createIssue) {
    const urgency = plan.forward?.urgency ?? analysis.urgency;
    issue = {
      id: newId("iss"),
      analysisId: record.id,
      category: analysis.category,
      urgency,
      title: plan.forward ? cleanAlertTitle(plan.forward.title) : defaultIssueTitle(record, settings),
      detail: batch.text || `（写真${batch.photoCount}枚のみの投稿）`,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    if (analysis.extracted.storeId) issue.storeId = analysis.extracted.storeId;
  }

  const storeStatus = plan.storeStatus
    ? {
        storeId: plan.storeStatus.storeId,
        entry: { status: plan.storeStatus.status, updatedAt: now, memberId: sender.id } satisfies StoreStatusEntry,
      }
    : null;

  return { record, reply, alerts, issue, deliveries, storeStatus };
}

function defaultIssueTitle(record: AnalysisRecord, settings: Settings): string {
  const store = settings.stores.find((s) => s.id === record.analysis.extracted.storeId);
  const { category } = record.analysis;
  const label = category === "unknown" ? "内容の確認が必要なメッセージ" : `${CATEGORY_LABELS[category]}の報告`;
  return store ? `${store.name} ${label}` : label;
}

/**
 * Sets the time at which the side effects become visible (the bot "answers" after a short delay).
 * The record keeps its analysis time.
 */
export function stampOutcome(outcome: BatchOutcome, at: number): BatchOutcome {
  return {
    record: outcome.record,
    reply: outcome.reply ? { ...outcome.reply, createdAt: at } : null,
    alerts: outcome.alerts.map((a) => ({ ...a, createdAt: at })),
    issue: outcome.issue ? { ...outcome.issue, createdAt: at, updatedAt: at } : null,
    deliveries: outcome.deliveries.map((d) => ({ ...d, createdAt: at })),
    storeStatus: outcome.storeStatus
      ? { storeId: outcome.storeStatus.storeId, entry: { ...outcome.storeStatus.entry, updatedAt: at } }
      : null,
  };
}

/** Merges an outcome into the history (immutable). Source messages get their `analysisId`. */
export function applyOutcome<S extends HistoryState>(state: S, outcome: BatchOutcome): S {
  const { record } = outcome;
  const sourceIds = new Set(record.messageIds);
  const messages = state.messages.map((m) => (sourceIds.has(m.id) ? { ...m, analysisId: record.id } : m));
  if (outcome.reply) messages.push(outcome.reply);
  messages.push(...outcome.alerts);
  return {
    ...state,
    messages,
    records: [...state.records, record],
    issues: outcome.issue ? [...state.issues, outcome.issue] : state.issues,
    deliveries: outcome.deliveries.length > 0 ? [...state.deliveries, ...outcome.deliveries] : state.deliveries,
    storeStatus: outcome.storeStatus
      ? { ...state.storeStatus, [outcome.storeStatus.storeId]: outcome.storeStatus.entry }
      : state.storeStatus,
  };
}

/* ------------------------------------------------------------------ */
/* Size limits                                                          */
/* ------------------------------------------------------------------ */

/** Generous caps so a long demo session never fills the browser storage. */
export const HISTORY_LIMITS = { messages: 800, records: 500, issues: 300, deliveries: 300 } as const;

function tail<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(items.length - max) : items;
}

export function capHistory<S extends HistoryState>(state: S): S {
  return {
    ...state,
    messages: tail(state.messages, HISTORY_LIMITS.messages),
    records: tail(state.records, HISTORY_LIMITS.records),
    issues: tail(state.issues, HISTORY_LIMITS.issues),
    deliveries: tail(state.deliveries, HISTORY_LIMITS.deliveries),
  };
}
