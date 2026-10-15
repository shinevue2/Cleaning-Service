import { vi } from "vitest";
import { mockClassifier } from "@/lib/ai/mock";
import { defaultSettings } from "@/lib/seed";
import type { Settings } from "@/lib/types";
import type { LineMessage, LineSendResult } from "../client";
import { AggregationBuffer, type WebhookDeps } from "../webhook";

/** Epoch ms for a wall-clock time in Japan (JST = UTC+9). */
export function jst(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour - 9, minute);
}

/** Wed 2026-10-14 10:00 JST — daytime for the default 22:00–08:00 night window. */
export const DAY = jst(2026, 10, 14, 10, 0);
export const NIGHT = jst(2026, 10, 14, 23, 30);

export const GROUP_CLEANING = `C${"1".repeat(32)}`;
export const GROUP_CALL = `C${"2".repeat(32)}`;
export const GROUP_ALERTS = `C${"3".repeat(32)}`;
export const GROUP_UNKNOWN = `C${"9".repeat(32)}`;
export const USER_TANAKA = `U${"a".repeat(32)}`;
export const USER_YAMAMOTO = `U${"b".repeat(32)}`;
export const USER_OWNER = `U${"c".repeat(32)}`;
export const USER_STRANGER = `U${"d".repeat(32)}`;

/** Default settings wired to fake LINE ids. */
export function lineSettings(patch?: (s: Settings) => void): Settings {
  const s = defaultSettings();
  const ids: Record<string, string> = { g_cleaning: GROUP_CLEANING, g_call: GROUP_CALL, g_alerts: GROUP_ALERTS };
  s.groups = s.groups.map((g) => ({ ...g, lineGroupId: ids[g.id] }));
  const users: Record<string, string> = { m_tanaka: USER_TANAKA, m_yamamoto: USER_YAMAMOTO, m_owner: USER_OWNER };
  s.members = s.members.map((m) => (users[m.id] ? { ...m, lineUserId: users[m.id] } : m));
  patch?.(s);
  return s;
}

let seq = 0;
const nextId = (prefix: string): string => `${prefix}${++seq}`;

interface EventOpts {
  group?: string;
  user?: string | null;
  id?: string;
  replyToken?: string;
  eventId?: string;
}

function source(opts: EventOpts) {
  const src: Record<string, string> = { type: "group", groupId: opts.group ?? GROUP_CLEANING };
  if (opts.user !== null) src.userId = opts.user ?? USER_TANAKA;
  return src;
}

export function textEvent(text: string, opts: EventOpts = {}) {
  const id = opts.id ?? nextId("m");
  return {
    type: "message",
    mode: "active",
    timestamp: DAY,
    webhookEventId: opts.eventId ?? nextId("ev"),
    deliveryContext: { isRedelivery: false },
    replyToken: opts.replyToken ?? `rt-${id}`,
    source: source(opts),
    message: { id, type: "text", text, quoteToken: `qt-${id}` },
  };
}

export function imageEvent(opts: EventOpts = {}) {
  const id = opts.id ?? nextId("img");
  return {
    type: "message",
    mode: "active",
    timestamp: DAY,
    webhookEventId: opts.eventId ?? nextId("ev"),
    deliveryContext: { isRedelivery: false },
    replyToken: opts.replyToken ?? `rt-${id}`,
    source: source(opts),
    message: { id, type: "image", contentProvider: { type: "line" }, quoteToken: `qt-${id}` },
  };
}

export function webhookBody(...events: unknown[]) {
  return { destination: `U${"0".repeat(32)}`, events };
}

const OK: LineSendResult = { ok: true, status: 200 };

export type SendMock = ReturnType<typeof vi.fn<(target: string, messages: LineMessage[]) => Promise<LineSendResult>>>;

export function makeDeps(overrides: Partial<WebhookDeps> = {}) {
  let clock = DAY;
  const reply: SendMock = vi.fn(async () => OK);
  const push: SendMock = vi.fn(async () => OK);
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const deps: WebhookDeps = {
    settings: lineSettings(),
    classifier: mockClassifier,
    reply,
    push,
    now: () => clock,
    pick: () => 0,
    sleep,
    buffer: new AggregationBuffer(),
    ...overrides,
  };
  return {
    deps,
    reply,
    push,
    sleep,
    advance(ms: number) {
      clock += ms;
    },
  };
}

/** Text of the first message passed to a send mock call. */
export function sentText(mock: SendMock, call = 0): string {
  const message = mock.mock.calls[call]?.[1]?.[0];
  return message && message.type === "text" ? message.text : "";
}
