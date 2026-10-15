import { describe, expect, it, vi } from "vitest";
import {
  alertFlexMessage,
  getGroupMemberProfile,
  LINE_API_BASE,
  pushMessage,
  replyMessage,
  textMessage,
  type FlexBox,
  type FlexText,
} from "../client";

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function fakeFetch(...responses: Array<Response | Error>) {
  const queue = [...responses];
  return vi.fn(async (...args: FetchArgs): Promise<Response> => {
    void args;
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  });
}

const okResponse = () => new Response("{}", { status: 200, headers: { "x-line-request-id": "req-1" } });
const errorResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function requestOf(fetchMock: ReturnType<typeof fakeFetch>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call];
  const headers = new Headers(init?.headers);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  return { url: String(url), init, headers, body };
}

describe("textMessage", () => {
  it("builds a text message and keeps the quote token", () => {
    expect(textMessage("お疲れ様でした！", { quoteToken: "qt-1" })).toEqual({
      type: "text",
      text: "お疲れ様でした！",
      quoteToken: "qt-1",
    });
    expect(textMessage("承知しました。")).toEqual({ type: "text", text: "承知しました。" });
  });

  it("cuts text at LINE's 5,000 character limit", () => {
    const message = textMessage("あ".repeat(6000));
    expect(Array.from(message.text)).toHaveLength(5000);
    expect(message.text.endsWith("…")).toBe(true);
  });
});

describe("alertFlexMessage", () => {
  const body = ["送信者：田中（清掃スタッフ）", "店舗：駅前店", "内容：洗濯機の下から水漏れしています"].join("\n");

  it("uses a red header for urgent alerts and the title as altText", () => {
    const message = alertFlexMessage({ urgency: "urgent", title: "🚨 緊急：駅前店 水漏れ", body });
    expect(message.type).toBe("flex");
    expect(message.altText).toBe("🚨 緊急：駅前店 水漏れ");
    expect(message.contents.header?.backgroundColor).toBe("#DC2626");
    const headerTexts = (message.contents.header?.contents ?? []) as FlexText[];
    expect(headerTexts.map((t) => t.text)).toEqual(["緊急トラブルの通知", "🚨 緊急：駅前店 水漏れ"]);
    expect(message.contents.footer).toBeUndefined();
  });

  it("uses an amber header for attention alerts", () => {
    const message = alertFlexMessage({ urgency: "attention", title: "⚠️ 要対応：緑ヶ丘店 乾燥機3番（E21）", body });
    expect(message.contents.header?.backgroundColor).toBe("#B45309");
  });

  it("renders 'label：value' lines as label/value rows", () => {
    const message = alertFlexMessage({ urgency: "urgent", title: "t", body });
    const rows = message.contents.body?.contents as FlexBox[];
    expect(rows).toHaveLength(3);
    expect(rows[0].layout).toBe("baseline");
    expect((rows[0].contents as FlexText[]).map((t) => t.text)).toEqual(["送信者", "田中（清掃スタッフ）"]);
  });

  it("adds a 詳細を確認する button only for https links", () => {
    const withLink = alertFlexMessage({ urgency: "urgent", title: "t", body, url: "https://example.com/admin/logs" });
    expect(JSON.stringify(withLink.contents.footer)).toContain("https://example.com/admin/logs");
    expect(alertFlexMessage({ urgency: "urgent", title: "t", body, url: "http://insecure.example" }).contents.footer).toBeUndefined();
  });
});

describe("replyMessage", () => {
  it("POSTs to the reply endpoint with the bearer token", async () => {
    const fetchMock = fakeFetch(okResponse());
    const result = await replyMessage("rt-1", [textMessage("お疲れ様でした！")], "token-123", { fetch: fetchMock });
    expect(result).toEqual({ ok: true, status: 200, requestId: "req-1" });
    const req = requestOf(fetchMock);
    expect(req.url).toBe(`${LINE_API_BASE}/message/reply`);
    expect(req.init?.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe("Bearer token-123");
    expect(req.body).toEqual({ replyToken: "rt-1", messages: [{ type: "text", text: "お疲れ様でした！" }] });
  });

  it("returns LINE's error message instead of throwing", async () => {
    const fetchMock = fakeFetch(errorResponse(400, { message: "Invalid reply token" }));
    const result = await replyMessage("rt-old", [textMessage("x")], "token", { fetch: fetchMock });
    expect(result).toMatchObject({ ok: false, status: 400, error: "Invalid reply token" });
  });

  it("reports network failures as status 0", async () => {
    const fetchMock = fakeFetch(new TypeError("fetch failed"));
    const result = await replyMessage("rt-1", [textMessage("x")], "token", { fetch: fetchMock });
    expect(result).toMatchObject({ ok: false, status: 0 });
    expect(result.error).toContain("fetch failed");
  });

  it("refuses obviously invalid calls without touching the network", async () => {
    const fetchMock = fakeFetch();
    expect((await replyMessage("", [textMessage("x")], "token", { fetch: fetchMock })).ok).toBe(false);
    expect((await replyMessage("rt", [], "token", { fetch: fetchMock })).ok).toBe(false);
    expect((await replyMessage("rt", [textMessage("x")], "", { fetch: fetchMock })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends at most 5 messages per request", async () => {
    const fetchMock = fakeFetch(okResponse());
    const messages = Array.from({ length: 7 }, (_, i) => textMessage(`m${i}`));
    await replyMessage("rt", messages, "token", { fetch: fetchMock });
    expect((requestOf(fetchMock).body.messages as unknown[]).length).toBe(5);
  });
});

describe("pushMessage", () => {
  it("POSTs to the push endpoint with a retry key", async () => {
    const fetchMock = fakeFetch(okResponse());
    const flex = alertFlexMessage({ urgency: "urgent", title: "🚨 緊急：駅前店 水漏れ", body: "店舗：駅前店" });
    const result = await pushMessage("C123", [flex], "token", { fetch: fetchMock });
    expect(result.ok).toBe(true);
    const req = requestOf(fetchMock);
    expect(req.url).toBe(`${LINE_API_BASE}/message/push`);
    expect(req.body).toMatchObject({ to: "C123" });
    expect(req.headers.get("x-line-retry-key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("retries once on a server error with the same retry key", async () => {
    const fetchMock = fakeFetch(errorResponse(500, { message: "oops" }), okResponse());
    const result = await pushMessage("C123", [textMessage("x")], "token", { fetch: fetchMock });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestOf(fetchMock, 0).headers.get("x-line-retry-key")).toBe(requestOf(fetchMock, 1).headers.get("x-line-retry-key"));
  });

  it("treats 409 on the retry as already delivered", async () => {
    const fetchMock = fakeFetch(new TypeError("socket hang up"), errorResponse(409, { message: "already accepted" }));
    const result = await pushMessage("C123", [textMessage("x")], "token", { fetch: fetchMock });
    expect(result).toMatchObject({ ok: true, status: 409 });
  });

  it("does not retry client errors such as an exhausted quota", async () => {
    const fetchMock = fakeFetch(errorResponse(429, { message: "You have reached your monthly limit." }));
    const result = await pushMessage("C123", [textMessage("x")], "token", { fetch: fetchMock });
    expect(result).toMatchObject({ ok: false, status: 429, error: "You have reached your monthly limit." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getGroupMemberProfile", () => {
  it("returns the display name", async () => {
    const fetchMock = fakeFetch(new Response(JSON.stringify({ displayName: "高橋", userId: "U1" }), { status: 200 }));
    const result = await getGroupMemberProfile("C1", "U1", "token", { fetch: fetchMock });
    expect(result).toMatchObject({ ok: true, displayName: "高橋" });
    expect(requestOf(fetchMock).url).toBe(`${LINE_API_BASE}/group/C1/member/U1`);
  });

  it("reports failures without throwing", async () => {
    const fetchMock = fakeFetch(errorResponse(404, { message: "Not found" }));
    expect(await getGroupMemberProfile("C1", "U1", "token", { fetch: fetchMock })).toMatchObject({ ok: false, status: 404 });
  });
});
