/**
 * LINE webhook processing — pure and dependency-injected (no env, no fetch), so it is fully testable.
 *
 * For each group message event:
 *   LINE groupId → Group (settings.groups[].lineGroupId; unknown groups are treated as the cleaning group)
 *   LINE userId  → Member (settings.members[].lineUserId; unknown users become staff — or call-center
 *                  staff in the call-center group — named after their LINE display name)
 *   text / image → buffered per group+user, then one EngineInput
 *   rule engine (analyze) → deps.classifier (Claude or sample) → plan
 *   plan.reply   → deps.reply (free); falls back to deps.push into the same group if the token expired
 *   plan.forward → deps.push of an alert card to every enabled `line_group` notify target
 *
 * Aggregation ("photo and comment sent separately count as ONE report"): staff messages wait up to
 * `behavior.aggregateSeconds` for the other half; text + photo together, or an emergency, go out at once.
 * The buffer lives in memory, so on serverless it is BEST-EFFORT: two messages that land on different
 * function instances are handled separately. Production at scale would keep the buffer in a shared
 * store (e.g. Redis/KV). A short "already acknowledged" memory also stops a second
 * 「お疲れ様でした」 when the comment arrives after the window closed.
 */
import { z } from "zod";
import { analyze, normalize, plan, routeTargets } from "../engine";
import type {
  Analysis,
  Category,
  DecisionSource,
  EngineInput,
  Group,
  Member,
  NotifyChannel,
  Settings,
  Urgency,
} from "../types";
import type { AIClassifier, AIClassifierId } from "../ai/types";
import { alertFlexMessage, textMessage, type LineMessage, type LineSendResult } from "./client";
import { resolveLineDestination } from "./config";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface WebhookDeps {
  settings: Settings;
  classifier: AIClassifier;
  reply(replyToken: string, messages: LineMessage[]): Promise<LineSendResult>;
  push(to: string, messages: LineMessage[]): Promise<LineSendResult>;
  /** LINE display name of a group member (optional; used for members not registered in settings). */
  getDisplayName?(groupId: string, userId: string): Promise<string | null>;
  /** https link for the 「詳細を確認する」 button on alert cards. */
  alertUrl?: string;
  now?: () => number;
  pick?: (n: number) => number;
  sleep?: (ms: number) => Promise<void>;
  buffer?: AggregationBuffer;
  /**
   * Epoch ms when the serverless function is stopped. The AI call then ends early enough to leave time
   * for the LINE reply and the alert push (the rule result is used if the AI cannot answer in time).
   */
  deadline?: number;
}

/** Time kept free after the AI call for the LINE reply / push requests (each has a 10 s timeout). */
export const SEND_RESERVE_MS = 15_000;

export type WebhookOutcome = "processed" | "held" | "ignored" | "duplicate" | "setup";

export interface WebhookSummary {
  outcome: WebhookOutcome;
  eventType: string;
  groupId?: string;
  userId?: string;
  messageIds: string[];
  /** why an event was ignored / held (Japanese, for logs) */
  reason?: string;
  category?: Category;
  urgency?: Urgency;
  source?: DecisionSource;
  classifier?: AIClassifierId;
  /** how the answer reached the group: "reply" (free), "push" (fallback), or false */
  replied?: "reply" | "push" | false;
  /** LINE ids the alert card was pushed to */
  forwardedTo?: string[];
  /** email / phone / Chatwork targets that matched but are not sent automatically by this version */
  pendingChannels?: NotifyChannel[];
  notes?: string[];
  errors?: string[];
}

/* ------------------------------------------------------------------ */
/* Event parsing (permissive: unknown fields and event types pass)     */
/* ------------------------------------------------------------------ */

const EventSchema = z.object({
  type: z.string(),
  mode: z.string().optional(),
  timestamp: z.number().optional(),
  webhookEventId: z.string().optional(),
  replyToken: z.string().optional(),
  source: z
    .object({
      type: z.string(),
      groupId: z.string().optional(),
      roomId: z.string().optional(),
      userId: z.string().optional(),
    })
    .optional(),
  message: z
    .object({
      id: z.string(),
      type: z.string(),
      text: z.string().optional(),
      quoteToken: z.string().optional(),
    })
    .optional(),
});

type LineEvent = z.infer<typeof EventSchema>;

const BodySchema = z.object({
  destination: z.string().optional(),
  events: z.array(z.unknown()),
});

/* ------------------------------------------------------------------ */
/* Aggregation buffer                                                  */
/* ------------------------------------------------------------------ */

export interface PendingUnit {
  key: string;
  lineGroupId: string;
  lineUserId?: string;
  group: Group;
  sender: Member;
  texts: string[];
  photoCount: number;
  messageIds: string[];
  /** newest reply token (each token works once, shortly after its event) */
  replyToken?: string;
  /** quote token of the first text message — the answer is shown as a reply to it */
  quoteToken?: string;
  /** quote token of the first photo, used when the report has no text */
  mediaQuoteToken?: string;
  dueAt: number;
  version: number;
}

interface Acknowledgement {
  at: number;
  category: Category;
  photoCount: number;
  storeId?: string;
}

/** Upper bound for the aggregation window on serverless (the function must stay alive meanwhile). */
export const MAX_AGGREGATE_MS = 30_000;
/** A completion report already acknowledged with photos within this window is not thanked twice. */
export const ACK_MEMORY_MS = 10 * 60_000;
const MAX_PENDING = 500;
const MAX_REMEMBERED = 1000;
const NAME_TTL_MS = 60 * 60_000;

function capMap<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/** In-memory state shared by webhook calls on the same function instance. */
export class AggregationBuffer {
  private readonly pending = new Map<string, PendingUnit>();
  private readonly acks = new Map<string, Acknowledgement>();
  private readonly seenEvents = new Map<string, number>();
  private readonly names = new Map<string, { name: string; at: number }>();
  private versionCounter = 0;

  /** Buffer-wide increasing version, so two units can never share one (ownership checks rely on it). */
  nextVersion(): number {
    this.versionCounter += 1;
    return this.versionCounter;
  }

  /** false when this webhookEventId was already handled here (LINE redelivery). */
  markEvent(eventId: string | undefined, now: number): boolean {
    if (!eventId) return true;
    if (this.seenEvents.has(eventId)) return false;
    this.seenEvents.set(eventId, now);
    capMap(this.seenEvents, MAX_REMEMBERED);
    return true;
  }

  peek(key: string): PendingUnit | undefined {
    return this.pending.get(key);
  }

  get size(): number {
    return this.pending.size;
  }

  isFull(): boolean {
    return this.pending.size >= MAX_PENDING;
  }

  put(unit: PendingUnit): void {
    this.pending.set(unit.key, unit);
  }

  /** Removes and returns the unit, but only if it is still the given version (when one is given). */
  take(key: string, version?: number): PendingUnit | undefined {
    const unit = this.pending.get(key);
    if (!unit || (version !== undefined && unit.version !== version)) return undefined;
    this.pending.delete(key);
    return unit;
  }

  rememberAck(key: string, ack: Acknowledgement): void {
    this.acks.delete(key);
    this.acks.set(key, ack);
    capMap(this.acks, MAX_REMEMBERED);
  }

  recentAck(key: string, now: number): Acknowledgement | undefined {
    const ack = this.acks.get(key);
    return ack && now - ack.at <= ACK_MEMORY_MS ? ack : undefined;
  }

  cachedName(userId: string, now: number): string | undefined {
    const hit = this.names.get(userId);
    return hit && now - hit.at <= NAME_TTL_MS ? hit.name : undefined;
  }

  cacheName(userId: string, name: string, now: number): void {
    this.names.set(userId, { name, at: now });
    capMap(this.names, MAX_REMEMBERED);
  }
}

const BUFFER_KEY = Symbol.for("laundry-line-ai.webhook-buffer");

/** Process-wide buffer (kept on globalThis so dev hot-reloads do not drop it). */
export function sharedBuffer(): AggregationBuffer {
  const g = globalThis as typeof globalThis & { [BUFFER_KEY]?: AggregationBuffer };
  g[BUFFER_KEY] ??= new AggregationBuffer();
  return g[BUFFER_KEY];
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

const FALLBACK_CLEANING_GROUP: Group = { id: "g_cleaning", kind: "cleaning", name: "清掃スタッフ連絡" };

export function resolveGroup(lineGroupId: string, settings: Settings): { group: Group; known: boolean } {
  const known = settings.groups.find((g) => g.lineGroupId === lineGroupId);
  if (known) return { group: known, known: true };
  const cleaning = settings.groups.find((g) => g.kind === "cleaning") ?? FALLBACK_CLEANING_GROUP;
  return { group: { ...cleaning, lineGroupId }, known: false };
}

export function resolveMember(
  lineUserId: string | undefined,
  group: Group,
  settings: Settings,
  displayName?: string,
): Member {
  const known = lineUserId ? settings.members.find((m) => m.lineUserId === lineUserId) : undefined;
  if (known) return known;
  return {
    id: lineUserId ? `line:${lineUserId}` : "line:unknown",
    // An empty name renders 「お疲れ様でした！」 instead of 「○○さん、お疲れ様でした！」.
    name: displayName?.trim() ?? "",
    role: group.kind === "callcenter" ? "callcenter" : "staff",
    storeIds: [],
    lineUserId,
    avatarColor: "#64748b",
  };
}

/** 「#ID」 / 「ID確認」 — replies with the group and user ids so the owner can fill in the settings. */
function isIdCommand(text: string): boolean {
  const n = normalize(text);
  return n === "#id" || n === "id確認" || n === "idかくにん";
}

/* ------------------------------------------------------------------ */
/* handleWebhook                                                       */
/* ------------------------------------------------------------------ */

interface Ctx {
  deps: WebhookDeps;
  settings: Settings;
  buffer: AggregationBuffer;
  now: () => number;
  windowMs: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function ignored(event: LineEvent | { type: string }, reason: string, extra: Partial<WebhookSummary> = {}): WebhookSummary {
  return { outcome: "ignored", eventType: event.type, messageIds: [], reason, ...extra };
}

function engineInput(unit: PendingUnit, now: number, photoCount = unit.photoCount): EngineInput {
  return { text: unit.texts.join("\n"), photoCount, sender: unit.sender, group: unit.group, now };
}

/** Should this unit be analysed now, or wait for the rest of the report? */
function isReady(unit: PendingUnit, ctx: Ctx): boolean {
  if (ctx.windowMs <= 0) return true;
  // Only cleaning staff typically send the photo and the comment as separate messages.
  if (unit.sender.role !== "staff") return true;
  const hasText = unit.texts.some((t) => t.trim() !== "");
  if (hasText && unit.photoCount > 0) return true;
  if (hasText) {
    // Emergencies never wait.
    const guess = analyze(engineInput(unit, ctx.now()), ctx.settings);
    if (guess.category === "emergency" || guess.urgency === "urgent") return true;
  }
  return false;
}

async function displayNameFor(lineGroupId: string, lineUserId: string | undefined, ctx: Ctx): Promise<string | undefined> {
  if (!lineUserId || !ctx.deps.getDisplayName) return undefined;
  if (ctx.settings.members.some((m) => m.lineUserId === lineUserId)) return undefined;
  const cached = ctx.buffer.cachedName(lineUserId, ctx.now());
  if (cached !== undefined) return cached;
  try {
    const name = await ctx.deps.getDisplayName(lineGroupId, lineUserId);
    if (name) ctx.buffer.cacheName(lineUserId, name, ctx.now());
    return name ?? undefined;
  } catch {
    return undefined;
  }
}

async function handleJoin(event: LineEvent, ctx: Ctx): Promise<WebhookSummary> {
  const lineGroupId = event.source?.groupId;
  if (!lineGroupId || !event.replyToken) return ignored(event, "グループ以外への参加");
  const { group, known } = resolveGroup(lineGroupId, ctx.settings);
  const bot = ctx.settings.behavior.botName;
  const text = known
    ? `${bot}です。「${group.name}」の連絡を担当します。どうぞよろしくお願いします。`
    : `${bot}です。グループに追加いただきありがとうございます。\n\n設定用のグループID：\n${lineGroupId}\n\nこのIDを開発担当にお知らせください。登録が済むまでは、清掃スタッフ用のグループとして動きます。`;
  const res = await ctx.deps.reply(event.replyToken, [textMessage(text)]);
  return {
    outcome: "setup",
    eventType: event.type,
    groupId: lineGroupId,
    messageIds: [],
    replied: res.ok ? "reply" : false,
    errors: res.ok ? undefined : [`reply: ${res.error ?? res.status}`],
  };
}

/**
 * The ids are only shown while setting things up: in a group or to a sender that is not registered
 * yet, or to a manager. In a configured group they would expose LINE ids to every member.
 */
function mayShowIds(lineGroupId: string, userId: string | undefined, settings: Settings): boolean {
  if (!resolveGroup(lineGroupId, settings).known) return true;
  const member = userId ? settings.members.find((m) => m.lineUserId === userId) : undefined;
  return !member || member.role === "manager";
}

async function handleIdCommand(event: LineEvent, lineGroupId: string, ctx: Ctx): Promise<WebhookSummary> {
  const userId = event.source?.userId;
  if (!mayShowIds(lineGroupId, userId, ctx.settings)) {
    return ignored(event, "登録済みのグループ・メンバーのため、IDは表示しません", {
      groupId: lineGroupId,
      userId,
      messageIds: event.message ? [event.message.id] : [],
    });
  }
  const lines = [`グループID：\n${lineGroupId}`];
  lines.push(userId ? `あなたのユーザーID：\n${userId}` : "あなたのユーザーIDは取得できませんでした（スマートフォンのLINEアプリから送ると表示されます）。");
  lines.push("このIDを設定に登録すると、グループやスタッフを正しく見分けられるようになります。");
  const res = event.replyToken ? await ctx.deps.reply(event.replyToken, [textMessage(lines.join("\n\n"))]) : undefined;
  return {
    outcome: "setup",
    eventType: event.type,
    groupId: lineGroupId,
    userId,
    messageIds: event.message ? [event.message.id] : [],
    replied: res?.ok ? "reply" : false,
    errors: res && !res.ok ? [`reply: ${res.error ?? res.status}`] : undefined,
  };
}

/** Settings as seen by the planner on this server: only notify targets it can actually deliver to. */
function sendableSettings(settings: Settings): Settings {
  return { ...settings, notifyTargets: settings.notifyTargets.filter((t) => t.channel === "line_group") };
}

function sameStore(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined || a === b;
}

/** Analyse one aggregated unit and carry out the plan. */
async function processUnit(unit: PendingUnit, ctx: Ctx): Promise<WebhookSummary> {
  const { deps, settings, buffer } = ctx;
  const now = ctx.now();
  const notes: string[] = [];
  const errors: string[] = [];

  let input = engineInput(unit, now);
  const ruleGuess = analyze(input, settings);
  let analysis: Analysis;
  try {
    const deadline = deps.deadline === undefined ? undefined : deps.deadline - SEND_RESERVE_MS;
    analysis = await deps.classifier.classify(input, settings, ruleGuess, { deadline });
  } catch {
    analysis = ruleGuess; // classify() must not throw, but a webhook must never die on it
  }

  // The same completion report was already thanked (with photos) a moment ago — e.g. the comment
  // arrived after the aggregation window, or an extra photo followed. Record it, don't thank twice.
  let suppressReply = false;
  const previous = buffer.recentAck(unit.key, now);
  if (
    analysis.category === "cleaning_done" &&
    previous?.category === "cleaning_done" &&
    previous.photoCount > 0 &&
    sameStore(previous.storeId, analysis.extracted.storeId)
  ) {
    suppressReply = true;
    if (input.photoCount === 0) {
      input = engineInput(unit, now, previous.photoCount);
      analysis = { ...analysis, extracted: { ...analysis.extracted, hasPhoto: true } };
    }
    notes.push("直前に同じ完了報告へ返信済みのため、重ねての返信は省略しました");
  }

  // This server only sends LINE messages; email / phone / Chatwork targets are reported as pending
  // (docs/PRODUCTION.md). Planning without them keeps the reply honest: no 「電話でも呼び出しています」.
  const actions = plan(input, analysis, sendableSettings(settings), deps.pick);
  notes.push(...actions.notes);
  if (analysis.category === "cleaning_done") {
    // Only completion reports are remembered, so an unrelated message in between does not reset it.
    buffer.rememberAck(unit.key, {
      at: now,
      category: analysis.category,
      photoCount: input.photoCount,
      storeId: analysis.extracted.storeId,
    });
  }

  // 1) Reply in the same group.
  let replied: WebhookSummary["replied"] = false;
  if (actions.reply && !suppressReply) {
    const quoted = textMessage(actions.reply, { quoteToken: unit.quoteToken ?? unit.mediaQuoteToken });
    const res: LineSendResult = unit.replyToken
      ? await deps.reply(unit.replyToken, [quoted])
      : { ok: false, status: 0, error: "no reply token" };
    if (res.ok) {
      replied = "reply";
    } else {
      // Reply tokens expire soon after the event; push into the same group instead (counts toward the quota).
      errors.push(`reply: ${res.error ?? res.status}`);
      const fallback = await deps.push(unit.lineGroupId, [textMessage(actions.reply)]);
      if (fallback.ok) replied = "push";
      else errors.push(`push(reply): ${fallback.error ?? fallback.status}`);
    }
  }

  // 2) Forward to the managers.
  const forwardedTo: string[] = [];
  const pendingChannels: NotifyChannel[] = [];
  if (actions.forward) {
    const destinations = new Set<string>();
    for (const target of routeTargets(actions.forward.urgency, now, settings)) {
      if (target.channel !== "line_group") {
        if (!pendingChannels.includes(target.channel)) pendingChannels.push(target.channel);
        continue;
      }
      const to = resolveLineDestination(target.address, settings);
      if (!to) {
        errors.push(`forward: 「${target.name}」のLINEグループIDが未設定です`);
        continue;
      }
      if (to !== unit.lineGroupId) destinations.add(to);
    }
    const card = alertFlexMessage({ ...actions.forward, url: deps.alertUrl });
    for (const to of destinations) {
      const res = await deps.push(to, [card]);
      if (res.ok) forwardedTo.push(to);
      else errors.push(`forward(${to}): ${res.error ?? res.status}`);
    }
  }

  const summary: WebhookSummary = {
    outcome: "processed",
    eventType: "message",
    groupId: unit.lineGroupId,
    userId: unit.lineUserId,
    messageIds: unit.messageIds,
    category: analysis.category,
    urgency: analysis.urgency,
    source: analysis.source,
    classifier: deps.classifier.id,
    replied,
    notes,
  };
  if (actions.forward) summary.forwardedTo = forwardedTo;
  if (pendingChannels.length > 0) summary.pendingChannels = pendingChannels;
  if (errors.length > 0) summary.errors = errors;
  return summary;
}

/**
 * Handles one webhook body. Resolves after every unit this call is responsible for has been
 * processed — including units held for the aggregation window — so run it inside `after()` (the
 * route already answered LINE with 200) or await it in tests.
 */
export async function handleWebhook(body: unknown, deps: WebhookDeps): Promise<WebhookSummary[]> {
  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) return [ignored({ type: "invalid" }, "Webhookの形式が正しくありません")];

  const settings = deps.settings;
  const ctx: Ctx = {
    deps,
    settings,
    buffer: deps.buffer ?? sharedBuffer(),
    now: deps.now ?? Date.now,
    windowMs: Math.min(MAX_AGGREGATE_MS, Math.max(0, settings.behavior.aggregateSeconds * 1000)),
  };
  const sleep = deps.sleep ?? defaultSleep;
  const summaries: WebhookSummary[] = [];
  /** units this call must flush when their window closes: key → version */
  const owned = new Map<string, number>();

  for (const raw of parsedBody.data.events) {
    const parsed = EventSchema.safeParse(raw);
    if (!parsed.success) {
      summaries.push(ignored({ type: "invalid" }, "イベントの形式が正しくありません"));
      continue;
    }
    const event = parsed.data;
    if (event.mode === "standby") {
      summaries.push(ignored(event, "待機モードのチャネル"));
      continue;
    }
    if (!ctx.buffer.markEvent(event.webhookEventId, ctx.now())) {
      summaries.push({ outcome: "duplicate", eventType: event.type, messageIds: [], reason: "再送された同じイベント" });
      continue;
    }
    if (event.type === "join") {
      summaries.push(await handleJoin(event, ctx));
      continue;
    }
    if (event.type !== "message" || !event.message) {
      summaries.push(ignored(event, "メッセージ以外のイベント"));
      continue;
    }
    const lineGroupId = event.source?.type === "group" ? event.source.groupId : undefined;
    if (!lineGroupId) {
      summaries.push(ignored(event, "グループ以外（1対1・複数人トーク）のメッセージ", { userId: event.source?.userId }));
      continue;
    }

    const { message } = event;
    const isText = message.type === "text";
    const isMedia = message.type === "image" || message.type === "video";
    if (!isText && !isMedia) {
      summaries.push(ignored(event, `対象外のメッセージ種別（${message.type}）`, { groupId: lineGroupId, messageIds: [message.id] }));
      continue;
    }
    if (isText && isIdCommand(message.text ?? "")) {
      summaries.push(await handleIdCommand(event, lineGroupId, ctx));
      continue;
    }

    const { group } = resolveGroup(lineGroupId, settings);
    if (group.kind === "alerts") {
      summaries.push(ignored(event, "管理者グループの投稿には反応しません", { groupId: lineGroupId, messageIds: [message.id] }));
      continue;
    }

    const lineUserId = event.source?.userId;
    const key = `${lineGroupId}:${lineUserId ?? "unknown"}`;
    // A unit whose window already closed but was never flushed (its owner was cut short): handle it first.
    const stale = ctx.buffer.peek(key);
    if (stale && ctx.now() >= stale.dueAt) {
      const taken = ctx.buffer.take(key, stale.version);
      if (taken) summaries.push(await processUnit(taken, ctx));
    }

    let unit = ctx.buffer.peek(key);
    if (!unit) {
      const displayName = await displayNameFor(lineGroupId, lineUserId, ctx);
      // Another webhook call for the same sender may have opened a unit while we awaited the profile,
      // so look again before creating one. No await from here on: the buffer cannot change under us.
      unit = ctx.buffer.peek(key) ?? {
        key,
        lineGroupId,
        lineUserId,
        group,
        sender: resolveMember(lineUserId, group, settings, displayName),
        texts: [],
        photoCount: 0,
        messageIds: [],
        dueAt: 0,
        version: 0,
      };
    }
    if (isText && message.text?.trim()) {
      unit.texts.push(message.text.trim());
      unit.quoteToken ??= message.quoteToken;
    }
    if (isMedia) {
      unit.photoCount += 1;
      unit.mediaQuoteToken ??= message.quoteToken;
    }
    unit.messageIds.push(message.id);
    if (event.replyToken) unit.replyToken = event.replyToken;
    unit.dueAt = ctx.now() + ctx.windowMs;
    unit.version = ctx.buffer.nextVersion();

    if (isReady(unit, ctx) || ctx.buffer.isFull()) {
      ctx.buffer.take(key);
      owned.delete(key);
      summaries.push(await processUnit(unit, ctx));
    } else {
      ctx.buffer.put(unit);
      owned.set(key, unit.version);
      summaries.push({
        outcome: "held",
        eventType: event.type,
        groupId: lineGroupId,
        userId: lineUserId,
        messageIds: [message.id],
        reason: `続けて届く写真・コメントを最大${Math.round(ctx.windowMs / 1000)}秒待ちます`,
      });
    }
  }

  // Flush the units this call is responsible for once their windows close. If a later webhook call
  // merged more messages into a unit, that call took over (version changed) and this one stops.
  while (owned.size > 0) {
    let next: PendingUnit | undefined;
    for (const [key, version] of owned) {
      const unit = ctx.buffer.peek(key);
      if (!unit || unit.version !== version) {
        owned.delete(key);
        continue;
      }
      if (!next || unit.dueAt < next.dueAt) next = unit;
    }
    if (!next) break;
    const wait = next.dueAt - ctx.now();
    if (wait > 0) await sleep(wait);
    const version = owned.get(next.key);
    owned.delete(next.key);
    const unit = ctx.buffer.take(next.key, version);
    if (unit) summaries.push(await processUnit(unit, ctx));
  }

  return summaries;
}
