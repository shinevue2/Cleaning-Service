/**
 * Client-side demo store (zustand v5 + persist → localStorage).
 *
 * Holds the simulated LINE groups, the analysis log, the 要対応リスト, notification deliveries, the
 * per-store cleaning board and all editable settings. Message processing follows CONTRACT §4.4:
 *
 *   sendMessage → buffer per group+sender (wait `aggregateSeconds` for a follow-up photo/text)
 *              → flush → engine.run() → typing… (`replyDelayMs`) → commit:
 *                 analysis record, bot reply, alert card in the alerts group (+unread),
 *                 deliveries for email/phone/Chatwork, issue, store status
 *
 * Timers live in ./aggregator (never in the persisted state). Persistence is skipped until
 * <StoreBootstrap/> rehydrates on the client, so server and first client render always match.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildDailyReport, normalize, tokyoDateKey } from "@/lib/engine";
import { BOT_ID, DEFAULT_BEHAVIOR, defaultSettings } from "@/lib/seed";
import { CATEGORY_LABELS } from "@/lib/types";
import type {
  BehaviorSettings,
  Category,
  ChatMessage,
  FaqEntry,
  Issue,
  IssueStatus,
  KeywordRule,
  LearnedExample,
  Member,
  NotifyTarget,
  Photo,
  ReplyPattern,
  Store,
  Urgency,
} from "@/lib/types";
import {
  beginTyping,
  bufferKey,
  cancelAllTimers,
  cancelFlush,
  endTyping,
  scheduleFlush,
  scheduleReply,
} from "./aggregator";
import { newId, type IdKind } from "./ids";
import {
  applyOutcome,
  capHistory,
  isProcessableGroup,
  needsAnalysis,
  processBatch,
  resolveSender,
  shortMemberName,
  shouldFlushNow,
  stampOutcome,
  type BatchOutcome,
} from "./pipeline";
import { buildSeedHistory } from "./seedHistory";
import { parseSettingsJson } from "./settingsSchema";
import { createSafeStorage, mergePersisted, type PersistedDemoState } from "./storage";

export type { StoreStatusEntry } from "./pipeline";

/** localStorage key (CONTRACT §4.4). */
export const STORE_KEY = "laundry-line-ai:v1";
export const STORE_VERSION = 1;

/** Extra margin before a message left unprocessed by another tab is picked up here. */
const ORPHAN_GRACE_MS = 2_000;
/** Timer key of the delayed orphan check (buffer keys always contain ":", so this never collides). */
const RESUME_TIMER_KEY = "resume-interrupted";

/** Upper bounds that keep the simulator responsive whatever the admin enters. */
export const MAX_AGGREGATE_SECONDS = 60;
export const MAX_REPLY_DELAY_MS = 10_000;

export interface PendingEntry {
  groupId: string;
  senderId: string;
  messageIds: string[];
  /** epoch ms when the buffer is analysed automatically */
  dueAt: number;
}

export interface DemoState extends PersistedDemoState {
  /** true once persisted data was restored on the client (render skeletons until then) */
  hydrated: boolean;
  /** transient (not persisted): buffers waiting for a follow-up photo/text, keyed `${groupId}:${senderId}` */
  pending: Record<string, PendingEntry>;
  /** transient: groupId → the bot is "typing" */
  typing: Record<string, boolean>;
  /** transient: groupId → unread count (the alerts group lights up) */
  unread: Record<string, number>;

  sendMessage(groupId: string, senderId: string, text: string, photos?: Photo[]): void;
  /** Process buffered messages now (the 「すぐ判定」 button and the aggregation timers). No key = all buffers. */
  flushPending(key?: string): void;
  markRead(groupId: string): void;
  /** Back to defaultSettings() and a fresh "today" history. */
  resetDemo(): void;
  /** Seeds today's history once (and refreshes it on a new day if the visitor never interacted). */
  seedIfEmpty(): void;
  /**
   * Analyses messages that were sent but never processed (the page was closed or reloaded during the
   * aggregation wait). Called by <StoreBootstrap/>. Messages younger than the aggregation wait + reply
   * delay are checked again later (another open tab may still be processing them). Returns the number
   * of messages picked up now.
   */
  resumeInterrupted(): number;

  updateBehavior(patch: Partial<BehaviorSettings>): void;
  upsertReplyPattern(p: ReplyPattern): void;
  deleteReplyPattern(id: string): void;
  upsertKeywordRule(r: KeywordRule): void;
  deleteKeywordRule(id: string): void;
  upsertFaq(f: FaqEntry): void;
  deleteFaq(id: string): void;
  upsertMember(m: Member): void;
  deleteMember(id: string): void;
  upsertStore(s: Store): void;
  deleteStore(id: string): void;
  upsertNotifyTarget(t: NotifyTarget): void;
  deleteNotifyTarget(id: string): void;
  deleteLearned(id: string): void;

  /** Records a manager's correction and adds it as a learned example ("次回から同じような内容はこの判定になります"). */
  correctRecord(recordId: string, category: Category, urgency: Urgency): void;
  /**
   * Registers a new FAQ from a logged question. If the question was still waiting for a human answer,
   * the answer is also posted to the original group and the related issue is marked resolved.
   */
  addFaqFromRecord(recordId: string, question: string, answer: string, patterns: string[][]): void;
  setIssueStatus(issueId: string, status: IssueStatus, note?: string): void;
  /** Posts buildDailyReport() into the alerts group as the bot. */
  postDailyReport(): void;
  /** Pretty-printed JSON of the settings. */
  exportSettings(): string;
  importSettings(json: string): { ok: boolean; error?: string };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function upsertById<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

function withId<T extends { id: string }>(item: T, kind: IdKind): T {
  const id = typeof item.id === "string" ? item.id.trim() : "";
  return id === item.id && id ? item : { ...item, id: id || newId(kind) };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeBehavior(b: BehaviorSettings): BehaviorSettings {
  return {
    ...b,
    botName: b.botName?.trim() || DEFAULT_BEHAVIOR.botName,
    aggregateSeconds: clamp(Math.round(finiteOr(b.aggregateSeconds, DEFAULT_BEHAVIOR.aggregateSeconds)), 0, MAX_AGGREGATE_SECONDS),
    confidenceThreshold:
      Math.round(clamp(finiteOr(b.confidenceThreshold, DEFAULT_BEHAVIOR.confidenceThreshold), 0, 1) * 100) / 100,
    replyDelayMs: clamp(Math.round(finiteOr(b.replyDelayMs, DEFAULT_BEHAVIOR.replyDelayMs)), 0, MAX_REPLY_DELAY_MS),
  };
}

/** Memo put on an issue that a manager's correction made unnecessary (routine category / 通常). */
export const CORRECTION_RESOLVED_NOTE = "判定の修正により、対応不要としました。";

function correctedIssueTitle(category: Category, storeName: string | undefined): string {
  const label = `${CATEGORY_LABELS[category]}の報告`;
  return storeName ? `${storeName} ${label}` : label;
}

/** 「【自動回答】洗剤は…」 → 「洗剤は…」 for a reply written by a human manager. */
function stripAutoLabel(answer: string): string {
  return answer.replace(/^\s*【[^】]{1,10}】\s*/, "").trim();
}

function emptyHistory(): Pick<PersistedDemoState, "messages" | "records" | "issues" | "deliveries" | "storeStatus"> {
  return { messages: [], records: [], issues: [], deliveries: [], storeStatus: {} };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => {
      /** Marks that the visitor changed demo data (keeps their data on the next day). */
      const touched = (now: number) => ({ lastActivityAt: now });

      const setTyping = (groupId: string, on: boolean) =>
        set((s) => {
          if (on) return s.typing[groupId] ? {} : { typing: { ...s.typing, [groupId]: true } };
          if (!(groupId in s.typing)) return {};
          const typing = { ...s.typing };
          delete typing[groupId];
          return { typing };
        });

      /** Makes the outcome visible: record, reply, alerts (+unread), issue, deliveries, store status. */
      const commit = (outcome: BatchOutcome) => {
        const stamped = stampOutcome(outcome, Date.now());
        set((s) => {
          const next = capHistory(applyOutcome(s, stamped));
          const unread = { ...s.unread };
          for (const alert of stamped.alerts) unread[alert.groupId] = (unread[alert.groupId] ?? 0) + 1;
          return {
            messages: next.messages,
            records: next.records,
            issues: next.issues,
            deliveries: next.deliveries,
            storeStatus: next.storeStatus,
            unread,
          };
        });
      };

      /** Analyses a batch now; the visible answer follows after the reply delay. */
      const dispatch = (groupId: string, senderId: string, messageIds: readonly string[]) => {
        const state = get();
        const ids = new Set(messageIds);
        // Skip messages already analysed elsewhere (e.g. by another open tab) or deleted by a reset.
        const batch = state.messages.filter((m) => ids.has(m.id) && needsAnalysis(m, state.settings));
        if (batch.length === 0) return;
        const group = state.settings.groups.find((g) => g.id === groupId);
        if (!isProcessableGroup(group)) return;

        const outcome = processBatch({
          settings: state.settings,
          group,
          sender: resolveSender(state.settings, senderId),
          messages: batch,
          now: Date.now(),
          storeStatus: state.storeStatus,
          records: state.records,
          newId,
        });

        const delay = clamp(finiteOr(state.settings.behavior.replyDelayMs, 0), 0, MAX_REPLY_DELAY_MS);
        if (!outcome.reply || delay === 0) {
          commit(outcome);
          return;
        }
        beginTyping(groupId);
        setTyping(groupId, true);
        scheduleReply(delay, () => {
          commit(outcome);
          if (endTyping(groupId) === 0) setTyping(groupId, false);
        });
      };

      return {
        hydrated: false,
        settings: defaultSettings(),
        ...emptyHistory(),
        seededAt: null,
        lastActivityAt: null,
        pending: {},
        typing: {},
        unread: {},

        /* ---------------- chat ---------------- */

        sendMessage(groupId, senderId, text, photos = []) {
          const body = text.trim();
          const attached = photos.filter((p) => p && typeof p.src === "string" && p.src !== "");
          if (!body && attached.length === 0) return;

          const now = Date.now();
          const message: ChatMessage = {
            id: newId("msg"),
            groupId,
            senderId,
            text: body,
            // fresh ids: the same sample photo can be attached to many messages
            photos: attached.map((p) => ({ id: newId("pho"), src: p.src, alt: p.alt || "写真" })),
            createdAt: now,
          };
          set((s) => ({ ...capHistory({ ...s, messages: [...s.messages, message] }), ...touched(now) }));

          const { settings } = get();
          if (!needsAnalysis(message, settings)) return; // managers, the alerts group, unknown groups

          const group = settings.groups.find((g) => g.id === groupId);
          if (!group) return;
          const sender = resolveSender(settings, senderId);
          const key = bufferKey(groupId, senderId);
          const waitMs = clamp(finiteOr(settings.behavior.aggregateSeconds, 0), 0, MAX_AGGREGATE_SECONDS) * 1000;
          const previous = get().pending[key];
          const entry: PendingEntry = {
            groupId,
            senderId,
            messageIds: [...(previous?.messageIds ?? []), message.id],
            dueAt: now + waitMs,
          };
          set((s) => ({ pending: { ...s.pending, [key]: entry } }));

          const buffered = get().messages.filter((m) => entry.messageIds.includes(m.id));
          if (waitMs === 0 || shouldFlushNow(buffered, settings, sender, group, now)) {
            get().flushPending(key);
            return;
          }
          scheduleFlush(key, waitMs, () => get().flushPending(key));
        },

        flushPending(key) {
          const keys = key === undefined ? Object.keys(get().pending) : [key];
          for (const k of keys) {
            cancelFlush(k);
            const entry = get().pending[k];
            if (!entry) continue;
            set((s) => {
              const pending = { ...s.pending };
              delete pending[k];
              return { pending };
            });
            dispatch(entry.groupId, entry.senderId, entry.messageIds);
          }
        },

        markRead(groupId) {
          set((s) => (s.unread[groupId] ? { unread: { ...s.unread, [groupId]: 0 } } : {}));
        },

        resumeInterrupted() {
          const s = get();
          const waiting = new Set(Object.values(s.pending).flatMap((p) => p.messageIds));
          const orphans = s.messages
            .filter((m) => !waiting.has(m.id) && needsAnalysis(m, s.settings))
            .sort((a, b) => a.createdAt - b.createdAt);
          if (orphans.length === 0) return 0;

          // Split per sender into runs that would have been aggregated together.
          const windowMs = clamp(finiteOr(s.settings.behavior.aggregateSeconds, 0), 0, MAX_AGGREGATE_SECONDS) * 1000;
          interface Run {
            groupId: string;
            senderId: string;
            ids: string[];
            last: number;
          }
          const runs: Run[] = [];
          const open = new Map<string, Run>();
          for (const m of orphans) {
            const key = bufferKey(m.groupId, m.senderId);
            const current = open.get(key);
            if (current && m.createdAt - current.last <= windowMs) {
              current.ids.push(m.id);
              current.last = m.createdAt;
            } else {
              const run: Run = { groupId: m.groupId, senderId: m.senderId, ids: [m.id], last: m.createdAt };
              runs.push(run);
              open.set(key, run);
            }
          }
          // A message this young may still be waiting in ANOTHER open tab (its buffer is not shared):
          // leave it to that tab and look again once its wait and reply delay are surely over.
          const replyDelay = clamp(finiteOr(s.settings.behavior.replyDelayMs, 0), 0, MAX_REPLY_DELAY_MS);
          const grace = windowMs + replyDelay + ORPHAN_GRACE_MS;
          const now = Date.now();
          let dispatched = 0;
          let recheckAt = Infinity;
          for (const run of runs) {
            if (now - run.last >= grace) {
              dispatch(run.groupId, run.senderId, run.ids);
              dispatched += run.ids.length;
            } else {
              recheckAt = Math.min(recheckAt, run.last + grace);
            }
          }
          if (recheckAt !== Infinity) scheduleFlush(RESUME_TIMER_KEY, recheckAt - now + 50, () => get().resumeInterrupted());
          return dispatched;
        },

        /* ---------------- demo lifecycle ---------------- */

        resetDemo() {
          cancelAllTimers();
          const now = Date.now();
          const settings = defaultSettings();
          set({
            settings,
            ...buildSeedHistory(settings, now),
            seededAt: now,
            lastActivityAt: null,
            pending: {},
            typing: {},
            unread: {},
          });
        },

        seedIfEmpty() {
          const s = get();
          const now = Date.now();
          const empty = s.messages.length === 0 && s.records.length === 0;
          // A visitor who only looked around yesterday gets a fresh "today" instead of a stale log.
          const stale =
            !empty &&
            s.lastActivityAt === null &&
            s.seededAt !== null &&
            tokyoDateKey(s.seededAt) !== tokyoDateKey(now) &&
            Object.keys(s.pending).length === 0;
          if (!empty && !stale) return;
          set({ ...buildSeedHistory(s.settings, now), seededAt: now, lastActivityAt: null, typing: {}, unread: {} });
        },

        /* ---------------- settings ---------------- */

        updateBehavior(patch) {
          set((s) => ({ settings: { ...s.settings, behavior: sanitizeBehavior({ ...s.settings.behavior, ...patch }) } }));
        },

        upsertReplyPattern(p) {
          set((s) => ({ settings: { ...s.settings, replyPatterns: upsertById(s.settings.replyPatterns, withId(p, "pat")) } }));
        },
        deleteReplyPattern(id) {
          set((s) => ({ settings: { ...s.settings, replyPatterns: s.settings.replyPatterns.filter((x) => x.id !== id) } }));
        },

        upsertKeywordRule(r) {
          set((s) => ({ settings: { ...s.settings, keywordRules: upsertById(s.settings.keywordRules, withId(r, "rule")) } }));
        },
        deleteKeywordRule(id) {
          set((s) => ({ settings: { ...s.settings, keywordRules: s.settings.keywordRules.filter((x) => x.id !== id) } }));
        },

        upsertFaq(f) {
          set((s) => ({ settings: { ...s.settings, faqs: upsertById(s.settings.faqs, withId(f, "faq")) } }));
        },
        deleteFaq(id) {
          set((s) => ({ settings: { ...s.settings, faqs: s.settings.faqs.filter((x) => x.id !== id) } }));
        },

        upsertMember(m) {
          set((s) => ({ settings: { ...s.settings, members: upsertById(s.settings.members, withId(m, "mem")) } }));
        },
        deleteMember(id) {
          set((s) => ({ settings: { ...s.settings, members: s.settings.members.filter((x) => x.id !== id) } }));
        },

        upsertStore(store) {
          set((s) => ({ settings: { ...s.settings, stores: upsertById(s.settings.stores, withId(store, "sto")) } }));
        },
        deleteStore(id) {
          set((s) => {
            const storeStatus = { ...s.storeStatus };
            delete storeStatus[id];
            return {
              storeStatus,
              settings: {
                ...s.settings,
                stores: s.settings.stores.filter((x) => x.id !== id),
                // keep staff assignments consistent
                members: s.settings.members.map((m) =>
                  m.storeIds.includes(id) ? { ...m, storeIds: m.storeIds.filter((sid) => sid !== id) } : m,
                ),
              },
            };
          });
        },

        upsertNotifyTarget(t) {
          set((s) => ({ settings: { ...s.settings, notifyTargets: upsertById(s.settings.notifyTargets, withId(t, "tgt")) } }));
        },
        deleteNotifyTarget(id) {
          set((s) => ({ settings: { ...s.settings, notifyTargets: s.settings.notifyTargets.filter((x) => x.id !== id) } }));
        },

        deleteLearned(id) {
          set((s) => ({ settings: { ...s.settings, learned: s.settings.learned.filter((x) => x.id !== id) } }));
        },

        /* ---------------- review & follow-up ---------------- */

        correctRecord(recordId, category, urgency) {
          const now = Date.now();
          set((s) => {
            const record = s.records.find((r) => r.id === recordId);
            if (!record) return {};
            const effectiveUrgency: Urgency = category === "emergency" ? "urgent" : urgency;
            const records = s.records.map((r) =>
              r.id === recordId
                ? { ...r, correctedCategory: category, correctedUrgency: effectiveUrgency, correctedAt: now }
                : r,
            );

            let learned = s.settings.learned;
            const text = record.combinedText.trim();
            // A photo-only post has no wording to learn from; the correction is still recorded.
            if (normalize(text)) {
              const existing = learned.find((l) => normalize(l.text) === normalize(text));
              const example: LearnedExample = {
                id: existing?.id ?? newId("lex"),
                text,
                category,
                urgency: effectiveUrgency,
                createdAt: now,
              };
              learned = existing ? learned.map((l) => (l.id === existing.id ? example : l)) : [...learned, example];
            }

            // A routine judgement needs nobody: take it off the 要対応リスト (and put it back if the
            // manager changes their mind). A 判定保留 title is replaced by the corrected category.
            const store = s.settings.stores.find((st) => st.id === record.analysis.extracted.storeId);
            const issues = s.issues.map((i): Issue => {
              if (i.analysisId !== recordId) return i;
              const autoResolved = i.status === "resolved" && i.note === CORRECTION_RESOLVED_NOTE;
              if (i.status === "resolved" && !autoResolved) return i;
              const next: Issue = { ...i, category, urgency: effectiveUrgency, updatedAt: now };
              if (i.category === "unknown" && category !== "unknown") {
                next.title = correctedIssueTitle(category, store?.name);
              }
              if (effectiveUrgency === "normal") {
                next.status = "resolved";
                next.note = CORRECTION_RESOLVED_NOTE;
              } else if (autoResolved) {
                next.status = "open";
                delete next.note;
              }
              return next;
            });
            return { records, issues, settings: { ...s.settings, learned }, ...touched(now) };
          });
        },

        addFaqFromRecord(recordId, question, answer, patterns) {
          const cleanAnswer = answer.trim();
          const groups = patterns
            .map((g) => g.map((w) => w.trim()).filter((w) => w !== ""))
            .filter((g) => g.length > 0);
          const s = get();
          const record = s.records.find((r) => r.id === recordId);
          const cleanQuestion = question.trim() || record?.combinedText.trim() || "";
          if (!cleanAnswer || groups.length === 0 || !cleanQuestion) return;

          const now = Date.now();
          const faq: FaqEntry = { id: newId("faq"), patterns: groups, question: cleanQuestion, answer: cleanAnswer, enabled: true };
          const issue = record ? s.issues.find((i) => i.analysisId === record.id && i.status !== "resolved") : undefined;

          let reply: ChatMessage | null = null;
          if (record && issue) {
            const sender = resolveSender(s.settings, record.senderId);
            reply = {
              id: newId("msg"),
              groupId: record.groupId,
              senderId: BOT_ID,
              text: `${shortMemberName(sender.name)}さん、お待たせしました。\n${stripAutoLabel(cleanAnswer)}`,
              photos: [],
              createdAt: now,
              replyTo: record.messageIds,
            };
          }

          set((st) => ({
            settings: { ...st.settings, faqs: [...st.settings.faqs, faq] },
            issues: issue
              ? st.issues.map((i) =>
                  i.id === issue.id
                    ? { ...i, status: "resolved" as const, updatedAt: now, note: "よくある質問に回答を登録し、グループへ返信しました。" }
                    : i,
                )
              : st.issues,
            messages: reply ? capHistory({ ...st, messages: [...st.messages, reply] }).messages : st.messages,
            ...touched(now),
          }));
        },

        setIssueStatus(issueId, status, note) {
          const now = Date.now();
          set((s) => {
            if (!s.issues.some((i) => i.id === issueId)) return {};
            return {
              issues: s.issues.map((i): Issue => {
                if (i.id !== issueId) return i;
                const next: Issue = { ...i, status, updatedAt: now };
                if (note !== undefined) {
                  const trimmed = note.trim();
                  if (trimmed) next.note = trimmed;
                  else delete next.note;
                }
                return next;
              }),
              ...touched(now),
            };
          });
        },

        postDailyReport() {
          const s = get();
          const alertsGroup = s.settings.groups.find((g) => g.kind === "alerts");
          if (!alertsGroup) return;
          const now = Date.now();
          const text = buildDailyReport({
            records: s.records,
            issues: s.issues,
            storeStatus: s.storeStatus,
            settings: s.settings,
            now,
          });
          const message: ChatMessage = { id: newId("msg"), groupId: alertsGroup.id, senderId: BOT_ID, text, photos: [], createdAt: now };
          set((st) => ({
            messages: capHistory({ ...st, messages: [...st.messages, message] }).messages,
            unread: { ...st.unread, [alertsGroup.id]: (st.unread[alertsGroup.id] ?? 0) + 1 },
            ...touched(now),
          }));
        },

        exportSettings() {
          return JSON.stringify(get().settings, null, 2);
        },

        importSettings(json) {
          const result = parseSettingsJson(json, get().settings);
          if (!result.ok) return { ok: false, error: result.error };
          set({ settings: { ...result.settings, behavior: sanitizeBehavior(result.settings.behavior) } });
          return { ok: true };
        },
      };
    },
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      skipHydration: true,
      storage: createSafeStorage(),
      partialize: (s): PersistedDemoState => ({
        settings: s.settings,
        messages: s.messages,
        records: s.records,
        issues: s.issues,
        deliveries: s.deliveries,
        storeStatus: s.storeStatus,
        seededAt: s.seededAt,
        lastActivityAt: s.lastActivityAt,
      }),
      // Unknown/older versions are validated field by field in `merge` instead of being discarded.
      migrate: (persisted) => persisted as PersistedDemoState,
      merge: (persisted, current) => mergePersisted(persisted, current),
    },
  ),
);
