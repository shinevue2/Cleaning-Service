/**
 * LINE Messaging API webhook — set `https://<your-domain>/api/line/webhook` as the Webhook URL.
 *
 * 1. 503 until LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN are set (the demo runs without LINE).
 * 2. 401 unless `x-line-signature` matches the raw body (HMAC-SHA256 with the channel secret).
 * 3. 200 immediately — LINE asks bots to answer fast and process asynchronously. The events are
 *    processed in `after()`, which on Vercel keeps the function alive (waitUntil) until the work,
 *    including the short photo/comment aggregation wait, has finished. `maxDuration` bounds it.
 */
import { after } from "next/server";
import { getServerClassifier } from "@/lib/ai";
import { getGroupMemberProfile, pushMessage, replyMessage } from "@/lib/line/client";
import { loadServerSettings, readAlertLinkUrl, readLineCredentials } from "@/lib/line/config";
import { verifySignature } from "@/lib/line/signature";
import { handleWebhook, type WebhookDeps } from "@/lib/line/webhook";

/** Seconds. Covers aggregation (≤30 s) + one AI call + LINE API calls; the AI call is cut to fit. */
export const maxDuration = 60;
/** Safety margin before Vercel stops the function. */
const DEADLINE_MARGIN_MS = 3_000;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const credentials = readLineCredentials();
  if (!credentials) {
    return json(503, { ok: false, reason: "LINE未接続（環境変数が未設定）" });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-line-signature"), credentials.channelSecret)) {
    return json(401, { ok: false, reason: "署名が一致しません" });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, reason: "JSONとして読み取れません" });
  }

  const { settings, warnings } = loadServerSettings();
  for (const warning of warnings) console.warn(`[line-webhook] ${warning}`);

  const deps: WebhookDeps = {
    settings,
    classifier: getServerClassifier(),
    reply: (replyToken, messages) => replyMessage(replyToken, messages, credentials.accessToken),
    push: (to, messages) => pushMessage(to, messages, credentials.accessToken),
    getDisplayName: async (groupId, userId) =>
      (await getGroupMemberProfile(groupId, userId, credentials.accessToken)).displayName ?? null,
    alertUrl: readAlertLinkUrl(),
    deadline: startedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS,
  };

  after(async () => {
    try {
      const summaries = await handleWebhook(body, deps);
      // Structured log for Vercel → Logs. Contains categories and ids only, never message text.
      if (summaries.length > 0) console.info(JSON.stringify({ tag: "line-webhook", summaries }));
    } catch (error) {
      console.error("[line-webhook] processing failed", error);
    }
  });

  return json(200, { ok: true });
}
