/**
 * Minimal LINE Messaging API client (fetch-based, no SDK) + message builders.
 *
 *   replyMessage — answers in the group that sent the message. Free: does not count toward the
 *                  monthly message quota. A reply token can be used once, shortly after the event.
 *   pushMessage  — sends to any group/user at any time. Counts toward the monthly quota.
 *
 * Every call resolves to `{ ok, status, error? }` and never throws.
 */
import "server-only";

import type { Urgency } from "../types";

export const LINE_API_BASE = "https://api.line.me/v2/bot";
/** LINE accepts at most 5 message objects per reply/push request. */
export const MAX_MESSAGES_PER_REQUEST = 5;
const TEXT_MAX_CHARS = 5000;
const ALT_TEXT_MAX_CHARS = 400;
const FLEX_VALUE_MAX_CHARS = 500;
const REQUEST_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* Message types (the subset this app sends)                           */
/* ------------------------------------------------------------------ */

export interface LineTextMessage {
  type: "text";
  text: string;
  /** Quote token from the webhook event — shows the bot's answer as a reply to that message. */
  quoteToken?: string;
}

export interface FlexText {
  type: "text";
  text: string;
  size?: "xxs" | "xs" | "sm" | "md" | "lg" | "xl";
  weight?: "regular" | "bold";
  color?: string;
  wrap?: boolean;
  flex?: number;
}

export interface FlexButton {
  type: "button";
  style: "primary" | "secondary" | "link";
  color?: string;
  height?: "sm" | "md";
  action: { type: "uri"; label: string; uri: string };
}

export interface FlexSeparator {
  type: "separator";
  color?: string;
}

export interface FlexBox {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexComponent[];
  spacing?: "none" | "xs" | "sm" | "md" | "lg";
  paddingAll?: string;
  backgroundColor?: string;
}

export type FlexComponent = FlexBox | FlexText | FlexButton | FlexSeparator;

export interface FlexBubble {
  type: "bubble";
  size?: "kilo" | "mega" | "giga";
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: FlexBubble;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

export interface LineSendResult {
  ok: boolean;
  status: number;
  error?: string;
  /** `x-line-request-id`, useful when contacting LINE support */
  requestId?: string;
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

export function textMessage(text: string, opts: { quoteToken?: string } = {}): LineTextMessage {
  const message: LineTextMessage = { type: "text", text: truncate(text.trim() || "（本文なし）", TEXT_MAX_CHARS) };
  if (opts.quoteToken) message.quoteToken = opts.quoteToken;
  return message;
}

const ALERT_STYLE: Record<Urgency, { color: string; label: string }> = {
  urgent: { color: "#DC2626", label: "緊急トラブルの通知" },
  attention: { color: "#B45309", label: "要対応の通知" },
  normal: { color: "#0F766E", label: "お知らせ" },
};

/** "送信者：田中（清掃スタッフ）" → label/value row; other lines → full-width text. */
function bodyRow(line: string): FlexComponent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = /^([^：:]{1,10})[：:]\s*([\s\S]*)$/.exec(trimmed);
  if (m && m[2].trim()) {
    return {
      type: "box",
      layout: "baseline",
      spacing: "sm",
      contents: [
        { type: "text", text: m[1], size: "sm", color: "#64748B", flex: 2, wrap: true },
        { type: "text", text: truncate(m[2].trim(), FLEX_VALUE_MAX_CHARS), size: "sm", color: "#0F172A", flex: 5, wrap: true },
      ],
    };
  }
  return { type: "text", text: truncate(trimmed, FLEX_VALUE_MAX_CHARS), size: "sm", color: "#0F172A", wrap: true };
}

/**
 * Alert card for the managers' group: coloured header (red = 緊急, amber = 要対応), the forward body as
 * label/value rows and an optional "詳細を確認する" button. `altText` (shown in notifications) = title.
 */
export function alertFlexMessage(alert: { urgency: Urgency; title: string; body: string; url?: string }): LineFlexMessage {
  const style = ALERT_STYLE[alert.urgency];
  const title = alert.title.trim() || style.label;
  const rows = alert.body
    .split("\n")
    .map(bodyRow)
    .filter((row): row is FlexComponent => row !== null);

  const bubble: FlexBubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "16px",
      backgroundColor: style.color,
      contents: [
        { type: "text", text: style.label, size: "xs", weight: "bold", color: "#FFFFFFCC" },
        { type: "text", text: truncate(title, 120), size: "md", weight: "bold", color: "#FFFFFF", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: rows.length > 0 ? rows : [{ type: "text", text: "詳細はありません", size: "sm", color: "#64748B" }],
    },
  };

  if (alert.url && /^https:\/\//.test(alert.url)) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: style.color,
          height: "sm",
          action: { type: "uri", label: "詳細を確認する", uri: alert.url },
        },
      ],
    };
  }

  return { type: "flex", altText: truncate(title, ALT_TEXT_MAX_CHARS), contents: bubble };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

export interface LineClientOptions {
  /** Injected fetch (tests). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

async function errorText(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object") {
      const { message, details } = data as { message?: unknown; details?: unknown };
      const detail = Array.isArray(details)
        ? details
            .map((d) => (d && typeof d === "object" ? `${(d as { property?: string }).property ?? ""} ${(d as { message?: string }).message ?? ""}`.trim() : ""))
            .filter(Boolean)
            .join("; ")
        : "";
      if (typeof message === "string") return detail ? `${message} (${detail})` : message;
    }
  } catch {
    // body was not JSON
  }
  return `HTTP ${res.status}`;
}

async function send(
  path: string,
  payload: unknown,
  accessToken: string,
  opts: LineClientOptions,
  extraHeaders: Record<string, string> = {},
): Promise<LineSendResult> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(`${LINE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const requestId = res.headers.get("x-line-request-id") ?? undefined;
    if (res.ok) return { ok: true, status: res.status, requestId };
    return { ok: false, status: res.status, error: await errorText(res), requestId };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: `network: ${reason}` };
  }
}

function invalid(error: string): LineSendResult {
  return { ok: false, status: 0, error };
}

/** Replies with up to 5 messages using a webhook reply token (free of charge). */
export async function replyMessage(
  replyToken: string,
  messages: readonly LineMessage[],
  accessToken: string,
  opts: LineClientOptions = {},
): Promise<LineSendResult> {
  if (!replyToken) return invalid("missing reply token");
  if (messages.length === 0) return invalid("no messages");
  if (!accessToken) return invalid("missing access token");
  return send("/message/reply", { replyToken, messages: messages.slice(0, MAX_MESSAGES_PER_REQUEST) }, accessToken, opts);
}

/**
 * Pushes up to 5 messages to a group/user ID. Counts toward the monthly message quota.
 * Retries once on a network error or 5xx with the same `X-Line-Retry-Key`, so a retry can never
 * deliver the message twice (LINE answers 409 when the first attempt had already been accepted).
 */
export async function pushMessage(
  to: string,
  messages: readonly LineMessage[],
  accessToken: string,
  opts: LineClientOptions = {},
): Promise<LineSendResult> {
  if (!to) return invalid("missing destination");
  if (messages.length === 0) return invalid("no messages");
  if (!accessToken) return invalid("missing access token");
  const payload = { to, messages: messages.slice(0, MAX_MESSAGES_PER_REQUEST) };
  const headers = { "X-Line-Retry-Key": globalThis.crypto.randomUUID() };
  const first = await send("/message/push", payload, accessToken, opts, headers);
  if (first.ok || (first.status !== 0 && first.status < 500)) return first;
  const retry = await send("/message/push", payload, accessToken, opts, headers);
  if (retry.status === 409) return { ok: true, status: 409, requestId: retry.requestId };
  return retry;
}

/**
 * Display name of a group member (works even when the user has not added the bot as a friend).
 * Used to greet staff who are not registered in the settings yet.
 */
export async function getGroupMemberProfile(
  groupId: string,
  userId: string,
  accessToken: string,
  opts: LineClientOptions = {},
): Promise<{ ok: boolean; status: number; displayName?: string; error?: string }> {
  if (!groupId || !userId || !accessToken) return { ok: false, status: 0, error: "missing parameter" };
  const doFetch = opts.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(
      `${LINE_API_BASE}/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return { ok: false, status: res.status, error: await errorText(res) };
    const data: unknown = await res.json();
    const displayName =
      data && typeof data === "object" && typeof (data as { displayName?: unknown }).displayName === "string"
        ? (data as { displayName: string }).displayName
        : undefined;
    return { ok: true, status: res.status, displayName };
  } catch (error) {
    return { ok: false, status: 0, error: `network: ${error instanceof Error ? error.message : String(error)}` };
  }
}
