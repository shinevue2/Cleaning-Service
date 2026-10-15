import { describe, expect, it } from "vitest";
import { run } from "@/lib/engine";
import { SAMPLE_SCENARIO_IDS } from "@/lib/samples";
import { BOT_ID, defaultSettings } from "@/lib/seed";
import type { RecordActions } from "@/lib/store/selectors";
import type { AnalysisRecord, ChatMessage, Group, Settings } from "@/lib/types";
import {
  buildTimeline,
  dateLabel,
  defaultRecordId,
  defaultSenderId,
  describeActions,
  extraNotes,
  fitWithin,
  groupMemberCount,
  isDraftEmpty,
  messagePreview,
  parseAlertBody,
  planScenario,
  recordMembership,
  recordTagIndex,
  resolveSenderId,
  senderOptions,
  waitProgress,
  waitingLabel,
} from "../chatModel";

// 2026-10-14 10:00 JST
const NOW = Date.UTC(2026, 9, 14, 1, 0, 0);
const HOUR = 3_600_000;

function msg(partial: Partial<ChatMessage> & { id: string }): ChatMessage {
  return { groupId: "g_cleaning", senderId: "m_tanaka", text: "", photos: [], createdAt: NOW, ...partial };
}

function group(settings: Settings, id: string): Group {
  const g = settings.groups.find((x) => x.id === id);
  if (!g) throw new Error(`missing group ${id}`);
  return g;
}

function record(settings: Settings, text: string, opts: { id?: string; groupId?: string; senderId?: string; photoCount?: number; messageIds?: string[] } = {}): AnalysisRecord {
  const g = group(settings, opts.groupId ?? "g_cleaning");
  const sender = settings.members.find((m) => m.id === (opts.senderId ?? "m_tanaka"));
  if (!sender) throw new Error("missing sender");
  const result = run({ text, photoCount: opts.photoCount ?? 0, sender, group: g, now: NOW }, settings, () => 0);
  return {
    id: opts.id ?? "rec_1",
    groupId: g.id,
    senderId: sender.id,
    messageIds: opts.messageIds ?? ["msg_1"],
    combinedText: text,
    photoCount: opts.photoCount ?? 0,
    analysis: result.analysis,
    plan: result.plan,
    createdAt: NOW,
  };
}

describe("dateLabel / buildTimeline", () => {
  it("labels today and yesterday in Asia/Tokyo", () => {
    expect(dateLabel(NOW - HOUR, NOW)).toBe("今日");
    expect(dateLabel(NOW - 24 * HOUR, NOW)).toBe("昨日");
    expect(dateLabel(NOW - 3 * 24 * HOUR, NOW)).toBe("10月11日（日）");
  });

  it("uses the Tokyo calendar day, not UTC", () => {
    // 2026-10-13 23:30 JST = 14:30 UTC on the 13th; 2026-10-14 00:30 JST = 15:30 UTC on the 13th
    const lateYesterday = Date.UTC(2026, 9, 13, 14, 30);
    const earlyToday = Date.UTC(2026, 9, 13, 15, 30);
    expect(dateLabel(lateYesterday, NOW)).toBe("昨日");
    expect(dateLabel(earlyToday, NOW)).toBe("今日");
  });

  it("inserts one separator per day and groups consecutive messages of a sender", () => {
    const items = buildTimeline(
      [
        msg({ id: "a", createdAt: NOW - 25 * HOUR }),
        msg({ id: "b", createdAt: NOW - 2 * HOUR }),
        msg({ id: "c", createdAt: NOW - 2 * HOUR + 30_000 }),
        msg({ id: "d", createdAt: NOW - HOUR, senderId: BOT_ID }),
        msg({ id: "e", createdAt: NOW - HOUR + 1000, senderId: BOT_ID, alert: { urgency: "urgent", title: "t", sourceGroupId: "g", sourceMessageIds: [] } }),
      ],
      NOW,
    );
    expect(items.map((i) => (i.kind === "date" ? i.label : i.key))).toEqual(["昨日", "a", "今日", "b", "c", "d", "e"]);
    const flags = items.flatMap((i) => (i.kind === "message" ? [[i.key, i.continued]] : []));
    expect(flags).toEqual([
      ["a", false],
      ["b", false], // first message after a date separator
      ["c", true],
      ["d", false],
      ["e", false], // alert cards always show the sender
    ]);
  });
});

describe("senders", () => {
  const settings = defaultSettings();

  it("offers staff + managers in the cleaning group and managers only in the alerts group", () => {
    expect(senderOptions(settings, group(settings, "g_cleaning")).map((m) => m.id)).toEqual([
      "m_tanaka",
      "m_sato",
      "m_suzuki",
      "m_owner",
    ]);
    expect(senderOptions(settings, group(settings, "g_call")).map((m) => m.id)).toEqual(["m_yamamoto", "m_owner"]);
    expect(senderOptions(settings, group(settings, "g_alerts")).map((m) => m.id)).toEqual(["m_owner"]);
  });

  it("defaults to a non-manager and falls back when the chosen sender is gone", () => {
    expect(defaultSenderId(settings, group(settings, "g_cleaning"))).toBe("m_tanaka");
    expect(defaultSenderId(settings, group(settings, "g_call"))).toBe("m_yamamoto");
    expect(defaultSenderId(settings, group(settings, "g_alerts"))).toBe("m_owner");
    expect(resolveSenderId(settings, group(settings, "g_cleaning"), "m_sato")).toBe("m_sato");
    expect(resolveSenderId(settings, group(settings, "g_cleaning"), "m_deleted")).toBe("m_tanaka");
    expect(resolveSenderId(settings, group(settings, "g_alerts"), "m_tanaka")).toBe("m_owner");
  });

  it("counts the members of a group plus the assistant", () => {
    expect(groupMemberCount(settings, group(settings, "g_cleaning"))).toBe(5);
    expect(groupMemberCount(settings, group(settings, "g_alerts"))).toBe(2);
  });
});

describe("previews and waiting labels", () => {
  it("previews text, photos and alerts", () => {
    expect(messagePreview(msg({ id: "1", text: "  駅前店\n完了  " }))).toBe("駅前店 完了");
    expect(messagePreview(msg({ id: "2", photos: [{ id: "p", src: "x", alt: "" }] }))).toBe("写真を1枚送信しました");
    expect(
      messagePreview(msg({ id: "3", text: "body", alert: { urgency: "urgent", title: "🚨 緊急：駅前店 水漏れ", sourceGroupId: "g", sourceMessageIds: [] } })),
    ).toBe("🚨 緊急：駅前店 水漏れ");
  });

  it("waits for a photo after a text and for a comment after a photo", () => {
    expect(waitingLabel([msg({ id: "1", text: "清掃終わりました" })])).toBe("写真の追加を待っています");
    expect(waitingLabel([msg({ id: "1", photos: [{ id: "p", src: "x", alt: "" }] })])).toBe("コメントの追加を待っています");
  });

  it("computes the remaining share of the wait", () => {
    expect(waitProgress(NOW + 3000, NOW, 6000)).toBeCloseTo(0.5);
    expect(waitProgress(NOW - 10, NOW, 6000)).toBe(0);
    expect(waitProgress(NOW + 9000, NOW, 6000)).toBe(1);
    expect(waitProgress(NOW, NOW, 0)).toBe(0);
  });

  it("knows an empty draft", () => {
    expect(isDraftEmpty({ text: "  ", photos: [] })).toBe(true);
    expect(isDraftEmpty({ text: "", photos: [{ id: "p", src: "x", alt: "" }] })).toBe(false);
  });
});

describe("planScenario", () => {
  const settings = defaultSettings();

  it("resolves every fixed scenario id", () => {
    for (const id of SAMPLE_SCENARIO_IDS) {
      const plan = planScenario(id, settings);
      expect(plan, id).not.toBeNull();
      expect(plan?.draft.text.length).toBeGreaterThan(0);
    }
  });

  it("prefills group, sender, text and photos", () => {
    const plan = planScenario("sc_leftover", settings);
    expect(plan?.groupId).toBe("g_cleaning");
    expect(plan?.senderId).toBe("m_sato");
    expect(plan?.draft.text).toContain("出しっぱなし");
    expect(plan?.draft.photos.map((p) => p.id)).toEqual(["ph_leftover"]);
    expect(plan?.draft.photos[0].src.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("ignores unknown ids and replaces a deleted sender", () => {
    expect(planScenario("nope", settings)).toBeNull();
    expect(planScenario(null, settings)).toBeNull();
    const withoutSato = { ...settings, members: settings.members.filter((m) => m.id !== "m_sato") };
    expect(planScenario("sc_leftover", withoutSato)?.senderId).toBe("m_tanaka");
  });
});

describe("records", () => {
  const settings = defaultSettings();

  it("tags only the last message of a merged record", () => {
    const r = record(settings, "駅前店の清掃完了しました！", { photoCount: 1, messageIds: ["photo", "text"] });
    const tags = recordTagIndex([r]);
    expect(tags.has("photo")).toBe(false);
    expect(tags.get("text")?.id).toBe(r.id);
    expect(recordMembership([r]).get("photo")).toBe(r.id);
  });

  it("picks the latest record of a group, or the record behind the latest alert", () => {
    const a = record(settings, "駅前店、これから清掃に入ります", { id: "rec_a", messageIds: ["m1"] });
    const b = record(settings, "北口店で焦げ臭いにおいがします", { id: "rec_b", messageIds: ["m2"] });
    const c = record(settings, "【連絡】点検が入ります", { id: "rec_c", groupId: "g_call", senderId: "m_yamamoto", messageIds: ["m3"] });
    const alert = msg({
      id: "alert",
      groupId: "g_alerts",
      senderId: BOT_ID,
      alert: { urgency: "urgent", title: "🚨", sourceGroupId: "g_cleaning", sourceMessageIds: ["m2"] },
    });
    expect(defaultRecordId(group(settings, "g_cleaning"), [a, b, c], [])).toBe("rec_b");
    expect(defaultRecordId(group(settings, "g_call"), [a, b, c], [])).toBe("rec_c");
    expect(defaultRecordId(group(settings, "g_alerts"), [a, b, c], [alert])).toBe("rec_b");
    expect(defaultRecordId(group(settings, "g_alerts"), [a, b, c], [])).toBeUndefined();
  });
});

describe("parseAlertBody", () => {
  it("splits the forward body into labelled rows and keeps multi-line content together", () => {
    const fields = parseAlertBody(
      [
        "送信者：田中（清掃スタッフ）",
        "グループ：【清掃】スタッフ連絡",
        "店舗：駅前店",
        "内容：写真を送ります",
        "駅前店：清掃完了しました",
        "写真：1枚",
        "AI判定（サンプル）：清掃完了・通常（確信度90%）",
        "判断理由：「完了しました」という表現から…",
      ].join("\n"),
    );
    expect(fields.map((f) => f.label)).toEqual(["送信者", "グループ", "店舗", "内容", "写真", "AI判定（サンプル）", "判断理由"]);
    expect(fields[3].value).toBe("写真を送ります\n駅前店：清掃完了しました");
  });

  it("works with the real engine output", () => {
    const r = record(settings(), "緑ヶ丘店の乾燥機3番がE21エラーで止まっています", { senderId: "m_suzuki", photoCount: 1 });
    const body = r.plan.forward?.body ?? "";
    const labels = parseAlertBody(body).map((f) => f.label);
    expect(labels).toContain("送信者");
    expect(labels).toContain("内容");
    expect(labels).toContain("判断理由");
    expect(labels.some((l) => l.includes("判定"))).toBe(true);
  });

  function settings(): Settings {
    return defaultSettings();
  }
});

describe("describeActions", () => {
  const settings = defaultSettings();

  function actionsFor(r: AnalysisRecord, extra: Partial<RecordActions> = {}): RecordActions {
    return { record: r, alerts: [], deliveries: [], ...extra };
  }

  it("lists the reply, forward, issue, notifications and store update of an emergency", () => {
    const r = record(settings, "駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    const alert = msg({ id: "al", groupId: "g_alerts", senderId: BOT_ID, alert: { urgency: "urgent", title: "x", sourceGroupId: "g_cleaning", sourceMessageIds: ["msg_1"] } });
    const items = describeActions(
      actionsFor(r, {
        alerts: [alert],
        deliveries: [
          { id: "d1", targetId: "t_owner_mail", channel: "email", urgency: "urgent", title: "x", body: "y", recordId: r.id, createdAt: NOW },
          { id: "d2", targetId: "t_night_phone", channel: "phone", urgency: "urgent", title: "x", body: "y", recordId: r.id, createdAt: NOW },
        ],
        issue: { id: "i", analysisId: r.id, category: "emergency", urgency: "urgent", title: "t", detail: "d", status: "open", createdAt: NOW, updatedAt: NOW },
      }),
      settings,
    );
    expect(items.map((i) => [i.kind, i.done])).toEqual([
      ["reply", true],
      ["forward", true],
      ["issue", true],
      ["email", true],
      ["phone", true],
    ]);
    expect(items[1].detail).toContain("【管理者】緊急・要対応通知");
    expect(items[1].detail).toContain("緊急");
    expect(items[2].detail).toBe("現在の状況：未対応");
    expect(items[3].detail).toContain("owner@example.com");
  });

  it("shows a routine report as replied, not forwarded, with a store update", () => {
    const r = record(settings, "駅前店、これから清掃に入ります");
    const items = describeActions(actionsFor(r), settings);
    expect(items.map((i) => [i.kind, i.done])).toEqual([
      ["reply", true],
      ["forward", false],
      ["issue", false],
      ["store", true],
    ]);
    expect(items[3].detail).toBe("駅前店を「清掃中」にしました");
    // the store update is not repeated in the notes
    expect(extraNotes(r).some((n) => n.includes("清掃状況"))).toBe(false);
  });

  it("explains why a manager's post got no reply", () => {
    const r = record(settings, "了解です。向かいます", { senderId: "m_owner" });
    const reply = describeActions(actionsFor(r), settings)[0];
    expect(reply.done).toBe(false);
    expect(reply.detail).toContain("管理者の投稿");
  });
});

describe("fitWithin", () => {
  it("downscales the long side to the limit and never enlarges", () => {
    expect(fitWithin(4032, 3024, 800)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1080, 1920, 800)).toEqual({ width: 450, height: 800 });
    expect(fitWithin(400, 300, 800)).toEqual({ width: 400, height: 300 });
    expect(fitWithin(0, 300, 800)).toEqual({ width: 0, height: 0 });
  });
});
