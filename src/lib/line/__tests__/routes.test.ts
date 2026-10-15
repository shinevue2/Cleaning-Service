/**
 * Route-level tests: env gating, signature check and the full webhook → LINE API path with
 * `after()` captured and `fetch` stubbed (no network).
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyzePOST } from "@/app/api/analyze/route";
import { GET as statusGET } from "@/app/api/status/route";
import { POST as webhookPOST } from "@/app/api/line/webhook/route";
import { GROUP_ALERTS, GROUP_CALL, textEvent, USER_STRANGER, webhookBody } from "./fixtures";

const hoisted = vi.hoisted(() => ({ afterCallbacks: [] as Array<() => unknown> }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    hoisted.afterCallbacks.push(callback);
  },
  connection: async () => undefined,
}));

const SECRET = "channel-secret";
const TOKEN = "channel-access-token";

function signedRequest(body: string, secret = SECRET): Request {
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return new Request("https://example.com/api/line/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}

beforeEach(() => {
  hoisted.afterCallbacks.length = 0;
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANALYZE_API_TOKEN", "");
  vi.stubEnv("APP_SETTINGS_JSON", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/line/webhook", () => {
  it("answers 503 while LINE is not configured", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    const res = await webhookPOST(signedRequest(JSON.stringify(webhookBody())));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "LINE未接続（環境変数が未設定）" });
  });

  it("answers 401 when the signature does not match", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", SECRET);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", TOKEN);
    const res = await webhookPOST(signedRequest(JSON.stringify(webhookBody()), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(hoisted.afterCallbacks).toHaveLength(0);
  });

  it("answers 401 when the signature header is missing", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", SECRET);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", TOKEN);
    const req = new Request("https://example.com/api/line/webhook", { method: "POST", body: "{}" });
    expect((await webhookPOST(req)).status).toBe(401);
  });

  it("answers 200 at once and replies through the LINE API afterwards", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", SECRET);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", TOKEN);
    vi.stubEnv("LINE_GROUP_CALLCENTER", GROUP_CALL);
    vi.stubEnv("LINE_GROUP_ALERTS", GROUP_ALERTS);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      void _init;
      const url = String(input);
      if (url.includes("/member/")) return new Response(JSON.stringify({ displayName: "オペレーター" }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify(
      webhookBody(textEvent("南町店のお客様から、乾燥機が回らないので返金してほしいと入電がありました。", { group: GROUP_CALL, user: USER_STRANGER })),
    );
    const res = await webhookPOST(signedRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled(); // nothing happens before the response

    expect(hoisted.afterCallbacks).toHaveLength(1);
    await hoisted.afterCallbacks[0]();

    const calls = fetchMock.mock.calls.map(([input, init]) => ({ url: String(input), init: init as RequestInit | undefined }));
    const replyCall = calls.find((c) => c.url.endsWith("/message/reply"));
    const pushCall = calls.find((c) => c.url.endsWith("/message/push"));
    expect(replyCall).toBeDefined();
    expect(new Headers(replyCall?.init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(replyCall?.init?.body)).messages[0].text).toContain("担当者に連絡しました");
    // 返金の申し出 = machine error → 要対応 card in the alerts group
    expect(JSON.parse(String(pushCall?.init?.body))).toMatchObject({ to: GROUP_ALERTS, messages: [{ type: "flex" }] });
  });
});

describe("GET /api/status", () => {
  it("reports the sample AI and an unconnected LINE channel by default", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    const res = await statusGET();
    expect(await res.json()).toMatchObject({
      line: { connected: false },
      ai: { id: "mock", label: "サンプルAI（デモ）", sample: true },
      storage: "browser",
    });
  });

  it("reports Claude when an API key is set (without exposing it)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    const res = await statusGET();
    const json = await res.json();
    expect(json.ai).toEqual({ id: "claude", label: "Claude（本番）", sample: false, model: "claude-opus-5-5" });
    expect(JSON.stringify(json)).not.toContain("sk-ant");
  });
});

describe("POST /api/analyze", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    analyzePOST(
      new Request("https://example.com/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  it("returns the analysis and plan for a valid message", async () => {
    const res = await post({ text: "駅前店、洗濯機の下から水漏れしていて床が水浸しです！", photoCount: 0, senderId: "m_tanaka", groupId: "g_cleaning" });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ai-classifier")).toBe("mock");
    const json = await res.json();
    expect(json.analysis).toMatchObject({ category: "emergency", urgency: "urgent" });
    expect(json.plan.forward).toMatchObject({ urgency: "urgent" });
  });

  it("rejects unknown ids and empty messages with 400 and readable reasons", async () => {
    const res = await post({ text: "", senderId: "m_nobody", groupId: "g_cleaning" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.issues.join()).toContain("m_nobody");
  });

  it("rejects a body that is not JSON", async () => {
    expect((await post("{not json")).status).toBe(400);
  });

  it("is closed while Claude is active and no ANALYZE_API_TOKEN is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    const res = await post({ text: "こんにちは", senderId: "m_tanaka", groupId: "g_cleaning" });
    expect(res.status).toBe(403);
  });

  it("rejects a wrong bearer token while Claude is active", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    vi.stubEnv("ANALYZE_API_TOKEN", "right-token");
    const res = await post({ text: "こんにちは", senderId: "m_tanaka", groupId: "g_cleaning" }, { authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
  });
});
