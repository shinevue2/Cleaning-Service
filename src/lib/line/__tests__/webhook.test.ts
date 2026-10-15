import { describe, expect, it, vi } from "vitest";
import type { AIClassifier } from "@/lib/ai/types";
import type { Analysis } from "@/lib/types";
import type { LineFlexMessage } from "../client";
import { AggregationBuffer, handleWebhook, resolveMember } from "../webhook";
import {
  DAY,
  GROUP_ALERTS,
  GROUP_CALL,
  GROUP_CLEANING,
  GROUP_UNKNOWN,
  imageEvent,
  lineSettings,
  makeDeps,
  NIGHT,
  sentText,
  textEvent,
  USER_OWNER,
  USER_STRANGER,
  USER_TANAKA,
  USER_YAMAMOTO,
  webhookBody,
} from "./fixtures";

describe("handleWebhook — text messages", () => {
  it("replies to a cleaning-start report, quoting the original message", async () => {
    const { deps, reply, push } = makeDeps();
    const event = textEvent("駅前店、これから清掃に入ります", { id: "m-start", replyToken: "rt-start" });

    const summaries = await handleWebhook(webhookBody(event), deps);

    expect(reply).toHaveBeenCalledTimes(1);
    const [token, messages] = reply.mock.calls[0];
    expect(token).toBe("rt-start");
    expect(messages[0]).toMatchObject({ type: "text", quoteToken: "qt-m-start" });
    expect(sentText(reply)).toContain("田中さん、駅前店の清掃よろしくお願いします");
    expect(push).not.toHaveBeenCalled();
    expect(summaries.at(-1)).toMatchObject({
      outcome: "processed",
      category: "cleaning_start",
      urgency: "normal",
      replied: "reply",
      classifier: "mock",
      messageIds: ["m-start"],
      groupId: GROUP_CLEANING,
      userId: USER_TANAKA,
    });
  });

  it("holds a staff text briefly for a follow-up photo, then answers once", async () => {
    const { deps, reply, sleep } = makeDeps();
    const summaries = await handleWebhook(webhookBody(textEvent("南町店、清掃終わりました", { user: USER_TANAKA })), deps);

    expect(summaries.map((s) => s.outcome)).toEqual(["held", "processed"]);
    expect(sleep).toHaveBeenCalledWith(6000);
    expect(reply).toHaveBeenCalledTimes(1);
    // No photo arrived → the bot asks for one.
    expect(sentText(reply)).toContain("完了写真の送付もお願いします");
  });

  it("answers call-center messages immediately with 「承知しました」", async () => {
    const { deps, reply, sleep } = makeDeps();
    const event = textEvent("【連絡】明日10時から中央通り店で業者の定期点検が入ります。", { group: GROUP_CALL, user: USER_YAMAMOTO });

    const summaries = await handleWebhook(webhookBody(event), deps);

    expect(sleep).not.toHaveBeenCalled();
    expect(summaries).toEqual([expect.objectContaining({ outcome: "processed", category: "info" })]);
    expect(sentText(reply)).toContain("承知しました");
  });

  it("answers registered FAQs without forwarding", async () => {
    const { deps, reply, push } = makeDeps();
    await handleWebhook(webhookBody(textEvent("洗剤の補充はどこにありますか？")), deps);
    expect(sentText(reply)).toContain("洗剤の在庫は各店舗バックヤード");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("handleWebhook — photos and aggregation", () => {
  it("merges a photo and a comment from the same body into one report", async () => {
    const { deps, reply } = makeDeps();
    const body = webhookBody(
      imageEvent({ id: "img-1" }),
      imageEvent({ id: "img-2" }),
      textEvent("駅前店の清掃完了しました！", { id: "m-done", replyToken: "rt-latest" }),
    );

    const summaries = await handleWebhook(body, deps);
    const processed = summaries.filter((s) => s.outcome === "processed");

    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatchObject({ category: "cleaning_done", messageIds: ["img-1", "img-2", "m-done"] });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0]).toBe("rt-latest");
    expect(sentText(reply)).toContain("写真も確認しました");
  });

  it("merges a photo and a comment that arrive in separate webhook calls", async () => {
    let release: () => void = () => undefined;
    const buffer = new AggregationBuffer();
    const sleep = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const { deps, reply } = makeDeps({ buffer, sleep });

    const first = handleWebhook(webhookBody(imageEvent({ id: "img-a" })), deps);
    await vi.waitFor(() => expect(sleep).toHaveBeenCalled());

    const second = await handleWebhook(webhookBody(textEvent("駅前店の清掃完了しました！", { id: "m-b" })), deps);
    expect(second).toEqual([expect.objectContaining({ outcome: "processed", category: "cleaning_done", messageIds: ["img-a", "m-b"] })]);

    release();
    expect((await first).map((s) => s.outcome)).toEqual(["held"]);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(sentText(reply)).toContain("写真も確認しました");
    expect(buffer.size).toBe(0);
  });

  it("does not lose a message when two calls for a new sender overlap", async () => {
    let releaseName: (name: string) => void = () => undefined;
    const name = new Promise<string>((resolve) => (releaseName = resolve));
    const getDisplayName = vi.fn(() => name);
    let releaseSleep: () => void = () => undefined;
    const sleep = vi.fn(() => new Promise<void>((resolve) => (releaseSleep = resolve)));
    const { deps, reply } = makeDeps({ getDisplayName, sleep });

    const a = handleWebhook(webhookBody(imageEvent({ user: USER_STRANGER, id: "img-x" })), deps);
    const b = handleWebhook(webhookBody(textEvent("北口店の清掃完了しました", { user: USER_STRANGER, id: "m-y" })), deps);
    await vi.waitFor(() => expect(getDisplayName).toHaveBeenCalledTimes(2));
    releaseName("高橋");
    const resultB = await b;
    releaseSleep();
    const resultA = await a;

    const processed = [...resultA, ...resultB].filter((s) => s.outcome === "processed");
    expect(processed).toHaveLength(1);
    expect([...processed[0].messageIds].sort()).toEqual(["img-x", "m-y"]);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(sentText(reply)).toContain("高橋さん");
  });

  it("treats a photo with no comment as a completion report after the wait", async () => {
    const { deps, reply } = makeDeps();
    const summaries = await handleWebhook(webhookBody(imageEvent()), deps);
    expect(summaries.map((s) => s.outcome)).toEqual(["held", "processed"]);
    expect(summaries[1]).toMatchObject({ category: "cleaning_done" });
    expect(sentText(reply)).toContain("写真も確認しました");
  });

  it("does not thank twice when the comment arrives after the window closed", async () => {
    const { deps, reply, advance } = makeDeps();
    await handleWebhook(webhookBody(imageEvent()), deps);
    expect(reply).toHaveBeenCalledTimes(1);

    advance(60_000);
    const later = await handleWebhook(webhookBody(textEvent("駅前店の清掃完了しました")), deps);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(later.at(-1)).toMatchObject({ outcome: "processed", category: "cleaning_done", replied: false });
    expect(later.at(-1)?.notes?.join()).toContain("重ねての返信は省略");
  });

  it("quotes the photo when a report has no comment", async () => {
    const { deps, reply } = makeDeps();
    await handleWebhook(webhookBody(imageEvent({ id: "img-q" })), deps);
    expect(reply.mock.calls[0][1][0]).toMatchObject({ type: "text", quoteToken: "qt-img-q" });
  });

  it("keeps remembering the thanked report across an unrelated message", async () => {
    const { deps, reply, advance } = makeDeps();
    await handleWebhook(webhookBody(imageEvent()), deps);
    advance(30_000);
    await handleWebhook(webhookBody(textEvent("中央通り店の自販機の釣り銭切れ、どうすればいいですか？")), deps);
    advance(30_000);
    const later = await handleWebhook(webhookBody(textEvent("駅前店の清掃完了しました")), deps);
    expect(reply).toHaveBeenCalledTimes(2); // photo thanks + question answer, no second thanks
    expect(later.at(-1)).toMatchObject({ category: "cleaning_done", replied: false });
  });

  it("does not wait when the text is an emergency", async () => {
    const { deps, sleep } = makeDeps();
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店、洗濯機の下から水漏れしていて床が水浸しです！")), deps);
    expect(sleep).not.toHaveBeenCalled();
    expect(summaries).toEqual([expect.objectContaining({ outcome: "processed", category: "emergency" })]);
  });

  it("processes immediately when aggregation is turned off", async () => {
    const { deps, sleep } = makeDeps({ settings: lineSettings((s) => (s.behavior.aggregateSeconds = 0)) });
    const summaries = await handleWebhook(webhookBody(imageEvent()), deps);
    expect(sleep).not.toHaveBeenCalled();
    expect(summaries.map((s) => s.outcome)).toEqual(["processed"]);
  });
});

describe("handleWebhook — forwarding to the managers", () => {
  it("pushes a red alert card to the alerts group for an emergency", async () => {
    const { deps, reply, push } = makeDeps({ alertUrl: "https://example.com/admin" });
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店、洗濯機の下から水漏れしていて床が水浸しです！")), deps);

    expect(sentText(reply)).toContain("緊急のトラブルとして、担当者へすぐに連絡しました");
    expect(push).toHaveBeenCalledTimes(1);
    const [to, messages] = push.mock.calls[0];
    expect(to).toBe(GROUP_ALERTS);
    const card = messages[0] as LineFlexMessage;
    expect(card.type).toBe("flex");
    expect(card.altText).toContain("🚨 緊急：駅前店");
    expect(card.contents.header?.backgroundColor).toBe("#DC2626");
    expect(JSON.stringify(card.contents.footer)).toContain("https://example.com/admin");
    expect(summaries.at(-1)).toMatchObject({
      category: "emergency",
      urgency: "urgent",
      forwardedTo: [GROUP_ALERTS],
      pendingChannels: ["email"],
    });
  });

  it("adds the night phone call to the pending channels at night", async () => {
    const { deps } = makeDeps({ now: () => NIGHT });
    const summaries = await handleWebhook(webhookBody(textEvent("北口店で焦げ臭いにおいがします")), deps);
    expect(summaries.at(-1)?.pendingChannels).toEqual(["email", "phone"]);
  });

  it("never tells staff 「電話でも呼び出しています」, because this server places no calls", async () => {
    const { deps, reply } = makeDeps({ now: () => NIGHT });
    const summaries = await handleWebhook(webhookBody(textEvent("北口店で焦げ臭いにおいがします")), deps);
    expect(sentText(reply)).toContain("担当者へすぐに連絡しました");
    expect(sentText(reply)).not.toContain("電話");
    expect(summaries.at(-1)?.notes ?? []).not.toContain("夜間のため電話通知も実行");
  });

  it("forwards a machine error as 要対応 (amber) after the aggregation wait", async () => {
    const { deps, push } = makeDeps();
    const summaries = await handleWebhook(
      webhookBody(imageEvent(), textEvent("緑ヶ丘店の乾燥機3番がE21エラーで止まっています")),
      deps,
    );
    expect(summaries.at(-1)).toMatchObject({ category: "machine_error", urgency: "attention", forwardedTo: [GROUP_ALERTS] });
    const card = push.mock.calls[0][1][0] as LineFlexMessage;
    expect(card.contents.header?.backgroundColor).toBe("#B45309");
    expect(card.altText).toContain("乾燥機3番（E21）");
  });

  it("reports a missing alerts group id instead of pushing", async () => {
    const settings = lineSettings((s) => {
      s.groups = s.groups.map((g) => (g.kind === "alerts" ? { ...g, lineGroupId: undefined } : g));
    });
    const { deps, push } = makeDeps({ settings });
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店で水漏れです")), deps);
    expect(push).not.toHaveBeenCalled();
    expect(summaries.at(-1)?.forwardedTo).toEqual([]);
    expect(summaries.at(-1)?.errors?.join()).toContain("LINEグループIDが未設定");
  });

  it("falls back to a push into the same group when the reply token has expired", async () => {
    const { deps, reply, push } = makeDeps({ settings: lineSettings((s) => (s.behavior.aggregateSeconds = 0)) });
    reply.mockResolvedValueOnce({ ok: false, status: 400, error: "Invalid reply token" });
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店、これから清掃に入ります")), deps);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe(GROUP_CLEANING);
    expect(summaries.at(-1)).toMatchObject({ replied: "push" });
    expect(summaries.at(-1)?.errors?.[0]).toContain("Invalid reply token");
  });
});

describe("handleWebhook — who and where", () => {
  it("ignores one-to-one chats and multi-person rooms", async () => {
    const { deps, reply } = makeDeps();
    const direct = { ...textEvent("こんにちは"), source: { type: "user", userId: USER_TANAKA } };
    const room = { ...textEvent("こんにちは"), source: { type: "room", roomId: `R${"5".repeat(32)}`, userId: USER_TANAKA } };
    const summaries = await handleWebhook(webhookBody(direct, room), deps);
    expect(summaries.map((s) => s.outcome)).toEqual(["ignored", "ignored"]);
    expect(reply).not.toHaveBeenCalled();
  });

  it("never replies to or forwards a manager's message", async () => {
    const { deps, reply, push, sleep } = makeDeps();
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店の水漏れ、業者に連絡済みです", { user: USER_OWNER })), deps);
    expect(sleep).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(summaries[0]).toMatchObject({ outcome: "processed", replied: false });
  });

  it("does not react to posts in the managers' alert group", async () => {
    const { deps, reply } = makeDeps();
    const summaries = await handleWebhook(webhookBody(textEvent("対応します", { group: GROUP_ALERTS, user: USER_STRANGER })), deps);
    expect(summaries[0]).toMatchObject({ outcome: "ignored" });
    expect(reply).not.toHaveBeenCalled();
  });

  it("treats an unknown group as the cleaning group and greets unknown staff by LINE name", async () => {
    const getDisplayName = vi.fn(async () => "高橋");
    const { deps, reply } = makeDeps({ getDisplayName });
    await handleWebhook(webhookBody(textEvent("北口店、これから清掃に入ります", { group: GROUP_UNKNOWN, user: USER_STRANGER })), deps);
    expect(getDisplayName).toHaveBeenCalledWith(GROUP_UNKNOWN, USER_STRANGER);
    expect(sentText(reply)).toContain("高橋さん、北口店の清掃よろしくお願いします");
  });

  it("caches display names between messages", async () => {
    const getDisplayName = vi.fn(async () => "高橋");
    const { deps } = makeDeps({ getDisplayName, settings: lineSettings((s) => (s.behavior.aggregateSeconds = 0)) });
    await handleWebhook(webhookBody(textEvent("北口店、これから清掃に入ります", { user: USER_STRANGER })), deps);
    await handleWebhook(webhookBody(textEvent("北口店、清掃終わりました", { user: USER_STRANGER })), deps);
    expect(getDisplayName).toHaveBeenCalledTimes(1);
  });

  it("still answers when the sender has no user id (e.g. LINE for PC) or no profile", async () => {
    const { deps, reply } = makeDeps({ settings: lineSettings((s) => (s.behavior.aggregateSeconds = 0)) });
    await handleWebhook(webhookBody(textEvent("駅前店、これから清掃に入ります", { user: null })), deps);
    expect(sentText(reply)).toMatch(/^駅前店の清掃よろしくお願いします/);
  });

  it("maps unknown members of the call-center group to the call-center role", () => {
    const settings = lineSettings();
    const callGroup = settings.groups.find((g) => g.kind === "callcenter");
    if (!callGroup) throw new Error("fixture");
    expect(resolveMember(USER_STRANGER, callGroup, settings, "オペレーター").role).toBe("callcenter");
    expect(resolveMember(USER_YAMAMOTO, callGroup, settings).id).toBe("m_yamamoto");
  });
});

describe("handleWebhook — AI classifier", () => {
  it("passes the rule-based guess to the classifier and acts on its answer", async () => {
    const classify = vi.fn(
      async (_input: unknown, _settings: unknown, rule: Analysis): Promise<Analysis> => ({
        ...rule,
        category: "emergency",
        urgency: "urgent",
        source: "ai",
        sample: false,
        reasoning: "“びちゃびちゃ”という表現から、床が濡れて水漏れしている可能性が高いと判断しました。",
      }),
    );
    const classifier: AIClassifier = { id: "claude", label: "Claude（本番）", sample: false, classify };
    const { deps, push } = makeDeps({ classifier });

    const summaries = await handleWebhook(webhookBody(textEvent("駅前店の床がなんかびちゃびちゃです")), deps);

    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][2]).toMatchObject({ category: "unknown" });
    expect(summaries.at(-1)).toMatchObject({ category: "emergency", classifier: "claude", forwardedTo: [GROUP_ALERTS] });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("falls back to the rule result if a classifier throws anyway", async () => {
    const classifier: AIClassifier = {
      id: "claude",
      label: "Claude（本番）",
      sample: false,
      classify: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const { deps, reply } = makeDeps({ classifier });
    const summaries = await handleWebhook(webhookBody(textEvent("駅前店、これから清掃に入ります")), deps);
    expect(summaries.at(-1)).toMatchObject({ category: "cleaning_start" });
    expect(reply).toHaveBeenCalledTimes(1);
  });
});

describe("handleWebhook — setup helpers and robustness", () => {
  it("introduces itself with the group id when invited to a new group", async () => {
    const { deps, reply } = makeDeps();
    const join = { type: "join", mode: "active", timestamp: DAY, webhookEventId: "ev-join", replyToken: "rt-join", source: { type: "group", groupId: GROUP_UNKNOWN } };
    const summaries = await handleWebhook(webhookBody(join), deps);
    expect(summaries[0]).toMatchObject({ outcome: "setup", groupId: GROUP_UNKNOWN });
    expect(sentText(reply)).toContain(GROUP_UNKNOWN);
  });

  it("replies with the group and user ids to 「#ID」 from an unregistered member", async () => {
    const { deps, reply, sleep } = makeDeps();
    await handleWebhook(webhookBody(textEvent("＃ＩＤ", { user: USER_STRANGER })), deps);
    expect(sleep).not.toHaveBeenCalled();
    expect(sentText(reply)).toContain(GROUP_CLEANING);
    expect(sentText(reply)).toContain(USER_STRANGER);
  });

  it("does not post ids for a registered staff member in a registered group (managers still can)", async () => {
    const { deps, reply } = makeDeps();
    const summaries = await handleWebhook(webhookBody(textEvent("#id", { user: USER_TANAKA })), deps);
    expect(summaries[0]).toMatchObject({ outcome: "ignored" });
    expect(reply).not.toHaveBeenCalled();
    await handleWebhook(webhookBody(textEvent("#id", { user: USER_OWNER })), deps);
    expect(sentText(reply)).toContain(USER_OWNER);
  });

  it("skips a redelivered event it has already handled", async () => {
    const { deps, reply } = makeDeps({ settings: lineSettings((s) => (s.behavior.aggregateSeconds = 0)) });
    const event = textEvent("駅前店、これから清掃に入ります", { eventId: "ev-same" });
    await handleWebhook(webhookBody(event), deps);
    const again = await handleWebhook(webhookBody({ ...event, deliveryContext: { isRedelivery: true } }), deps);
    expect(again[0].outcome).toBe("duplicate");
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("ignores stickers, standby-mode events, non-message events and malformed input", async () => {
    const { deps, reply } = makeDeps();
    const sticker = { ...textEvent("x"), message: { id: "s1", type: "sticker", packageId: "1", stickerId: "1" } };
    const standby = { ...textEvent("駅前店、これから清掃に入ります"), mode: "standby" };
    const leave = { type: "leave", timestamp: DAY, source: { type: "group", groupId: GROUP_CLEANING } };
    const summaries = await handleWebhook(webhookBody(sticker, standby, leave, { nonsense: true }), deps);
    expect(summaries.map((s) => s.outcome)).toEqual(["ignored", "ignored", "ignored", "ignored"]);
    expect(await handleWebhook("not json", deps)).toEqual([expect.objectContaining({ outcome: "ignored", eventType: "invalid" })]);
    expect(reply).not.toHaveBeenCalled();
  });

  it("returns an empty list for LINE's 'Verify' request (no events)", async () => {
    const { deps } = makeDeps();
    expect(await handleWebhook(webhookBody(), deps)).toEqual([]);
  });
});
