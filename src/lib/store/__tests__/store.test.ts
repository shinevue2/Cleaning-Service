import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokyoDateKey } from "@/lib/engine";
import { getSamplePhoto, SAMPLE_PHOTOS, SAMPLE_SCENARIOS, scenarioPhotos } from "@/lib/samples";
import { BOT_ID, defaultSettings } from "@/lib/seed";
import type { AnalysisRecord, ChatMessage } from "@/lib/types";
import { cancelAllTimers, timerCounts } from "../aggregator";
import { buildSeedHistory } from "../seedHistory";
import { selectOpenIssues, selectRecordActions, selectStoreBoard, selectTodayStats } from "../selectors";
import { createSafeStorage, mergePersisted, PHOTO_PLACEHOLDER_SRC, type PersistedDemoState } from "../storage";
import { STORE_KEY, useDemoStore } from "../store";

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/** Minimal in-memory Web Storage for the node test environment. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const memory = new MemoryStorage();
vi.stubGlobal("localStorage", memory);

/** Epoch ms for a wall-clock time in Japan (UTC+9, no DST). */
function jst(month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, month - 1, day, hour - 9, minute);
}

const DAYTIME = jst(10, 14, 14, 0); // Wed 14:00
const NIGHT = jst(10, 14, 23, 30); // Wed 23:30

const store = () => useDemoStore.getState();
const replyDelay = () => store().settings.behavior.replyDelayMs;
const waitSeconds = () => store().settings.behavior.aggregateSeconds;

/** Records / messages added after the seeded history. */
function snapshot() {
  const { records, messages, issues, deliveries } = store();
  return { records: records.length, messages: messages.length, issues: issues.length, deliveries: deliveries.length };
}
function newRecords(since: ReturnType<typeof snapshot>): AnalysisRecord[] {
  return store().records.slice(since.records);
}
function newMessages(since: ReturnType<typeof snapshot>): ChatMessage[] {
  return store().messages.slice(since.messages);
}

/** Sends a scenario and lets the bot answer. */
function runScenario(id: string) {
  const scenario = SAMPLE_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`unknown scenario ${id}`);
  store().sendMessage(scenario.groupId, scenario.senderId, scenario.text, scenarioPhotos(scenario));
  store().flushPending();
  vi.advanceTimersByTime(replyDelay() + 10);
  return scenario;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(DAYTIME);
  memory.clear();
  await useDemoStore.persist.rehydrate();
  store().resetDemo();
  useDemoStore.setState({ hydrated: true });
});

afterEach(() => {
  cancelAllTimers();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

describe("sendMessage pipeline", () => {
  it("merges a photo and a following text within the window into ONE record", () => {
    const before = snapshot();
    const floor = getSamplePhoto("ph_floor_clean");
    expect(floor).toBeDefined();

    store().sendMessage("g_cleaning", "m_tanaka", "", [floor!]);
    expect(Object.keys(store().pending)).toEqual(["g_cleaning:m_tanaka"]);
    expect(store().pending["g_cleaning:m_tanaka"].dueAt).toBe(DAYTIME + waitSeconds() * 1000);

    vi.advanceTimersByTime(2_000);
    expect(newRecords(before)).toHaveLength(0);

    store().sendMessage("g_cleaning", "m_tanaka", "駅前店の清掃完了しました！");
    // text + photo → analysed immediately, the bot is "typing"
    expect(store().pending).toEqual({});
    expect(store().typing.g_cleaning).toBe(true);

    vi.advanceTimersByTime(replyDelay());
    const records = newRecords(before);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.messageIds).toHaveLength(2);
    expect(record.photoCount).toBe(1);
    expect(record.combinedText).toBe("駅前店の清掃完了しました！");
    expect(record.analysis.category).toBe("cleaning_done");
    expect(record.analysis.sample).toBe(true);

    const added = newMessages(before);
    const sources = added.filter((m) => record.messageIds.includes(m.id));
    expect(sources.every((m) => m.analysisId === record.id)).toBe(true);
    const reply = added.find((m) => m.senderId === BOT_ID);
    expect(reply?.replyTo).toEqual(record.messageIds);
    expect(reply?.text).toContain("お疲れ様でした");
    expect(store().typing.g_cleaning).toBeUndefined();
    expect(store().storeStatus.s_ekimae).toMatchObject({ status: "done", memberId: "m_tanaka" });
  });

  it("waits aggregateSeconds for a text-only report, then analyses it", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_sato", "南町店、清掃終わりました");
    expect(timerCounts().flush).toBe(1);

    vi.advanceTimersByTime(waitSeconds() * 1000 - 1);
    expect(newRecords(before)).toHaveLength(0);
    expect(store().pending["g_cleaning:m_sato"]).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(store().pending).toEqual({});
    vi.advanceTimersByTime(replyDelay());
    const [record] = newRecords(before);
    expect(record.analysis.category).toBe("cleaning_done");
    expect(store().storeStatus.s_minami.status).toBe("awaiting_photo");
    expect(newMessages(before).at(-1)?.text).toContain("完了写真");
  });

  it("flushPending() analyses a buffer right away (「すぐ判定」)", () => {
    const before = snapshot();
    store().sendMessage("g_call", "m_yamamoto", "【連絡】明日10時から中央通り店で業者の定期点検が入ります。");
    store().flushPending("g_call:m_yamamoto");
    expect(timerCounts().flush).toBe(0);
    vi.advanceTimersByTime(replyDelay());
    expect(newRecords(before)[0].analysis.category).toBe("info");
  });

  it("flushes an emergency immediately and notifies the managers", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    expect(store().pending).toEqual({});
    expect(timerCounts().flush).toBe(0);
    expect(store().typing.g_cleaning).toBe(true);

    vi.advanceTimersByTime(replyDelay());
    const [record] = newRecords(before);
    expect(record.analysis.category).toBe("emergency");
    expect(record.analysis.urgency).toBe("urgent");

    const alert = newMessages(before).find((m) => m.alert);
    expect(alert?.groupId).toBe("g_alerts");
    expect(alert?.alert?.urgency).toBe("urgent");
    expect(alert?.alert?.title).toContain("緊急");
    expect(store().unread.g_alerts).toBe(1);

    const issue = store().issues.at(-1);
    expect(issue).toMatchObject({ analysisId: record.id, urgency: "urgent", status: "open", storeId: "s_ekimae" });
    expect(issue?.title.startsWith("🚨")).toBe(false);
  });

  it("does not process messages from managers", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_owner", "皆さん、今日もよろしくお願いします。水漏れに気をつけてください！");
    expect(store().pending).toEqual({});
    expect(timerCounts()).toEqual({ flush: 0, reply: 0 });
    vi.advanceTimersByTime(30_000);
    expect(newRecords(before)).toHaveLength(0);
    const added = newMessages(before);
    expect(added).toHaveLength(1);
    expect(added[0].analysisId).toBeUndefined();
  });

  it("does not classify posts in the alerts group", () => {
    const before = snapshot();
    store().sendMessage("g_alerts", "m_tanaka", "乾燥機3番がエラーです");
    vi.advanceTimersByTime(30_000);
    expect(newRecords(before)).toHaveLength(0);
  });

  it("ignores empty messages", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_tanaka", "   ");
    expect(snapshot()).toEqual(before);
  });

  it("posts alerts to g_alerts and counts them as unread", () => {
    const before = snapshot();
    runScenario("sc_leftover");
    const alerts = newMessages(before).filter((m) => m.alert);
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert.groupId).toBe("g_alerts");
    expect(alert.senderId).toBe(BOT_ID);
    expect(alert.alert).toMatchObject({ urgency: "attention", sourceGroupId: "g_cleaning" });
    expect(alert.alert?.title).toContain("北口店");
    expect(alert.text).toContain("送信者：佐藤");
    const [record] = newRecords(before);
    expect(alert.alert?.sourceMessageIds).toEqual(record.messageIds);
    expect(store().unread.g_alerts).toBe(1);

    runScenario("sc_machine");
    expect(store().unread.g_alerts).toBe(2);
    store().markRead("g_alerts");
    expect(store().unread.g_alerts).toBe(0);

    const actions = selectRecordActions(store(), record);
    expect(actions.reply?.groupId).toBe("g_cleaning");
    expect(actions.alerts).toHaveLength(1);
    expect(actions.issue?.status).toBe("open");
  });

  it("records email deliveries in the daytime and email + phone at night", () => {
    let before = snapshot();
    runScenario("sc_emergency");
    let deliveries = store().deliveries.slice(before.deliveries);
    expect(deliveries.map((d) => d.channel)).toEqual(["email"]);
    expect(deliveries[0]).toMatchObject({ targetId: "t_owner_mail", urgency: "urgent", recordId: newRecords(before)[0].id });

    vi.setSystemTime(NIGHT);
    before = snapshot();
    runScenario("cc_emergency_smell");
    deliveries = store().deliveries.slice(before.deliveries);
    expect(deliveries.map((d) => d.channel).sort()).toEqual(["email", "phone"]);
    const reply = newMessages(before).find((m) => m.senderId === BOT_ID && m.groupId === "g_call");
    expect(reply?.text).toContain("夜間");
    expect(newRecords(before)[0].plan.notes).toContain("夜間のため電話通知も実行");
  });

  it("sends attention-level forwards to Chatwork only when that target is enabled", () => {
    let before = snapshot();
    runScenario("sc_machine");
    expect(store().deliveries.slice(before.deliveries)).toHaveLength(0);

    const chatwork = store().settings.notifyTargets.find((t) => t.id === "t_chatwork");
    store().upsertNotifyTarget({ ...chatwork!, enabled: true });
    before = snapshot();
    runScenario("sc_machine");
    const deliveries = store().deliveries.slice(before.deliveries);
    expect(deliveries.map((d) => d.channel)).toEqual(["chatwork"]);
  });

  it("matches a late completion photo to the store waiting for it", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_sato", "北口店、清掃終わりました");
    vi.advanceTimersByTime(waitSeconds() * 1000 + replyDelay());
    expect(store().storeStatus.s_kita.status).toBe("awaiting_photo");

    vi.advanceTimersByTime(60_000);
    store().sendMessage("g_cleaning", "m_sato", "", [getSamplePhoto("ph_floor_clean")!]);
    vi.advanceTimersByTime(waitSeconds() * 1000 + replyDelay());
    const records = newRecords(before);
    expect(records).toHaveLength(2);
    expect(records[1].analysis.extracted.storeId).toBe("s_kita");
    expect(records[1].plan.notes[0]).toContain("写真待ちだった北口店");
    expect(store().storeStatus.s_kita.status).toBe("done");
  });

  it("keeps the typing indicator while several answers are in flight", () => {
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店、洗濯機の下から水漏れしています！");
    vi.advanceTimersByTime(replyDelay() / 2);
    store().sendMessage("g_cleaning", "m_sato", "北口店で煙が出ています！");
    vi.advanceTimersByTime(replyDelay() / 2 + 1);
    expect(store().typing.g_cleaning).toBe(true);
    vi.advanceTimersByTime(replyDelay());
    expect(store().typing.g_cleaning).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

describe("sample scenarios", () => {
  it("references existing groups, members and photos", () => {
    const settings = defaultSettings();
    for (const s of SAMPLE_SCENARIOS) {
      expect(settings.groups.some((g) => g.id === s.groupId)).toBe(true);
      expect(settings.members.some((m) => m.id === s.senderId)).toBe(true);
      expect(scenarioPhotos(s)).toHaveLength(s.photoIds.length);
    }
    expect(SAMPLE_PHOTOS.length).toBeGreaterThanOrEqual(4);
    for (const p of SAMPLE_PHOTOS) expect(p.src.startsWith("data:image/svg+xml")).toBe(true);
  });

  it.each(SAMPLE_SCENARIOS.map((s) => [s.id, s] as const))("%s is judged as expected", (_id, scenario) => {
    const before = snapshot();
    runScenario(scenario.id);
    const [record] = newRecords(before);
    expect(record.analysis.category).toBe(scenario.expect);
    expect(record.analysis.urgency).toBe(scenario.expectUrgency);
    if (scenario.id === "sc_faq") {
      expect(record.analysis.faqId).toBe("f_detergent");
      expect(record.plan.forward).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Corrections, FAQ, issues, report                                     */
/* ------------------------------------------------------------------ */

describe("review actions", () => {
  it("correctRecord adds a learned example that a later similar message uses", () => {
    let before = snapshot();
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店の入口にチラシが貼られていました");
    store().flushPending();
    vi.advanceTimersByTime(replyDelay());
    const [first] = newRecords(before);
    expect(first.analysis.category).toBe("unknown");
    const issue = store().issues.find((i) => i.analysisId === first.id);
    expect(issue?.status).toBe("open");

    store().correctRecord(first.id, "info", "normal");
    const corrected = store().records.find((r) => r.id === first.id);
    expect(corrected?.correctedCategory).toBe("info");
    expect(corrected?.correctedUrgency).toBe("normal");
    expect(corrected?.correctedAt).toBe(Date.now());
    expect(store().settings.learned).toHaveLength(1);
    expect(store().settings.learned[0]).toMatchObject({ text: first.combinedText, category: "info", urgency: "normal" });
    // A routine judgement needs nobody: the issue leaves the 要対応リスト with an automatic memo
    // and the generic 判定保留 title is replaced.
    expect(store().issues.find((i) => i.analysisId === first.id)).toMatchObject({
      category: "info",
      urgency: "normal",
      status: "resolved",
      note: "判定の修正により、対応不要としました。",
      title: "駅前店 連絡事項の報告",
    });
    expect(selectOpenIssues(store().issues).some((i) => i.analysisId === first.id)).toBe(false);

    // changing it back to something that needs a person reopens it
    store().correctRecord(first.id, "machine_error", "attention");
    expect(store().issues.find((i) => i.analysisId === first.id)).toMatchObject({ status: "open", urgency: "attention" });
    expect(store().issues.find((i) => i.analysisId === first.id)?.note).toBeUndefined();
    store().correctRecord(first.id, "info", "normal");

    // correcting the same record again replaces the example instead of duplicating it
    store().correctRecord(first.id, "chat", "normal");
    expect(store().settings.learned).toHaveLength(1);
    store().correctRecord(first.id, "info", "normal");

    before = snapshot();
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店の入口にチラシが貼られていました。");
    store().flushPending();
    vi.advanceTimersByTime(replyDelay());
    const [second] = newRecords(before);
    expect(second.analysis.source).toBe("learned");
    expect(second.analysis.category).toBe("info");
    expect(second.analysis.exampleId).toBe(store().settings.learned[0].id);
    expect(second.plan.forward).toBeNull();
  });

  it("addFaqFromRecord registers the FAQ, answers the waiting staff member and resolves the issue", () => {
    let before = snapshot();
    runScenario("sc_question");
    const [record] = newRecords(before);
    expect(record.plan.forward).not.toBeNull();

    before = snapshot();
    store().addFaqFromRecord(
      record.id,
      "自販機の釣り銭切れはどうすればいいですか？",
      "【自動回答】自販機の釣り銭は事務所の金庫にあります。補充したらこのグループでお知らせください。",
      [["自販機", "釣り銭"], [" "]],
    );
    const faq = store().settings.faqs.at(-1);
    expect(faq).toMatchObject({ patterns: [["自販機", "釣り銭"]], enabled: true });
    const answer = newMessages(before)[0];
    expect(answer).toMatchObject({ groupId: "g_cleaning", senderId: BOT_ID, replyTo: record.messageIds });
    expect(answer.text).toBe("田中さん、お待たせしました。\n自販機の釣り銭は事務所の金庫にあります。補充したらこのグループでお知らせください。");
    expect(store().issues.find((i) => i.analysisId === record.id)?.status).toBe("resolved");

    // the same question is now answered automatically
    before = snapshot();
    runScenario("sc_question");
    const [again] = newRecords(before);
    expect(again.analysis.source).toBe("faq");
    expect(again.analysis.faqId).toBe(faq?.id);
    expect(again.plan.forward).toBeNull();
  });

  it("setIssueStatus updates status and memo", () => {
    const open = selectOpenIssues(store().issues);
    expect(open.length).toBeGreaterThan(0);
    const target = open[0];
    // Changing the status never moves a row (the next click must not land on another issue).
    const order = open.map((i) => i.id);
    store().setIssueStatus(target.id, "in_progress");
    expect(selectOpenIssues(store().issues).map((i) => i.id)).toEqual(order);
    vi.setSystemTime(DAYTIME + 60_000);
    store().setIssueStatus(target.id, "in_progress", "  業者に連絡しました  ");
    expect(store().issues.find((i) => i.id === target.id)).toMatchObject({
      status: "in_progress",
      note: "業者に連絡しました",
      updatedAt: DAYTIME + 60_000,
    });
    store().setIssueStatus(target.id, "resolved", "");
    const resolved = store().issues.find((i) => i.id === target.id);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.note).toBeUndefined();
  });

  it("postDailyReport posts the report into the alerts group", () => {
    const before = snapshot();
    store().postDailyReport();
    const [report] = newMessages(before);
    expect(report).toMatchObject({ groupId: "g_alerts", senderId: BOT_ID });
    expect(report.text.startsWith("📋 日次レポート")).toBe(true);
    expect(report.text).toContain("中央通り店");
    expect(store().unread.g_alerts).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

describe("settings", () => {
  it("updateBehavior clamps values", () => {
    store().updateBehavior({ aggregateSeconds: 999, confidenceThreshold: 1.7, replyDelayMs: -5, botName: "  " });
    const b = store().settings.behavior;
    expect(b.aggregateSeconds).toBe(60);
    expect(b.confidenceThreshold).toBe(1);
    expect(b.replyDelayMs).toBe(0);
    expect(b.botName).toBe(defaultSettings().behavior.botName);
  });

  it("deleteStore also removes its status and staff assignments", () => {
    store().deleteStore("s_ekimae");
    expect(store().settings.stores.some((s) => s.id === "s_ekimae")).toBe(false);
    expect(store().storeStatus.s_ekimae).toBeUndefined();
    expect(store().settings.members.find((m) => m.id === "m_tanaka")?.storeIds).toEqual(["s_chuo"]);
  });

  it("upserts keep ids and fill in missing ones", () => {
    store().upsertFaq({ id: "", patterns: [["駐車場"]], question: "駐車場は？", answer: "店舗前に2台です。", enabled: true });
    const added = store().settings.faqs.at(-1);
    expect(added?.id.startsWith("faq_")).toBe(true);
    store().upsertFaq({ ...added!, answer: "店舗前に3台です。" });
    expect(store().settings.faqs.filter((f) => f.id === added?.id)).toHaveLength(1);
    expect(store().settings.faqs.at(-1)?.answer).toBe("店舗前に3台です。");
  });

  it("exports and re-imports settings", () => {
    store().updateBehavior({ aggregateSeconds: 9 });
    const json = store().exportSettings();
    store().resetDemo();
    expect(store().importSettings(json)).toEqual({ ok: true });
    expect(store().settings.behavior.aggregateSeconds).toBe(9);
  });

  it("imports only the sections a file contains", () => {
    const result = store().importSettings(JSON.stringify({ faqs: [] }));
    expect(result.ok).toBe(true);
    expect(store().settings.faqs).toEqual([]);
    expect(store().settings.keywordRules).toEqual(defaultSettings().keywordRules);
  });

  it("rejects broken or invalid settings with a Japanese explanation", () => {
    const broken = store().importSettings("{ not json");
    expect(broken.ok).toBe(false);
    expect(broken.error).toContain("JSON");

    const settings = defaultSettings();
    const invalid = JSON.parse(JSON.stringify(settings));
    invalid.members[1].role = "boss";
    const result = store().importSettings(JSON.stringify(invalid));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("「スタッフ」の2件目の「役割」");

    const dup = JSON.parse(JSON.stringify(settings));
    dup.stores.push({ ...dup.stores[0] });
    expect(store().importSettings(JSON.stringify(dup)).error).toContain("重複");

    expect(store().importSettings(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(store().settings).toEqual(defaultSettings());
  });
});

/* ------------------------------------------------------------------ */
/* Lifecycle & persistence                                              */
/* ------------------------------------------------------------------ */

describe("lifecycle", () => {
  it("resetDemo restores the defaults and cancels everything in flight", () => {
    store().updateBehavior({ aggregateSeconds: 20 });
    store().deleteFaq("f_detergent");
    store().upsertStore({ id: "s_new", name: "新店", aliases: [] });
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店、清掃完了しました");
    store().sendMessage("g_cleaning", "m_sato", "北口店で煙が出ています");
    expect(timerCounts().flush + timerCounts().reply).toBeGreaterThan(0);

    vi.setSystemTime(DAYTIME + 5_000);
    store().resetDemo();
    const s = store();
    expect(s.settings).toEqual(defaultSettings());
    expect(s.pending).toEqual({});
    expect(s.typing).toEqual({});
    expect(s.unread).toEqual({});
    expect(timerCounts()).toEqual({ flush: 0, reply: 0 });
    expect(s.seededAt).toBe(DAYTIME + 5_000);
    expect(s.lastActivityAt).toBeNull();
    expect(s.messages.every((m) => m.createdAt < DAYTIME + 5_000)).toBe(true);
    expect(s.messages.some((m) => m.text.includes("煙が出ています"))).toBe(false);

    vi.advanceTimersByTime(60_000);
    expect(store().records).toHaveLength(s.records.length);
  });

  it("persists only durable data and restores it on rehydrate", async () => {
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店、これから清掃に入ります");
    const raw = memory.getItem(STORE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!) as { state: Record<string, unknown>; version: number };
    expect(saved.version).toBe(1);
    expect(Object.keys(saved.state).sort()).toEqual(
      ["deliveries", "issues", "lastActivityAt", "messages", "records", "seededAt", "settings", "storeStatus"].sort(),
    );

    const messageCount = store().messages.length;
    useDemoStore.setState({ messages: [], records: [] });
    // put the saved copy back (setState above overwrote it) and restore
    memory.setItem(STORE_KEY, raw!);
    await useDemoStore.persist.rehydrate();
    expect(store().messages).toHaveLength(messageCount);
    expect(store().hydrated).toBe(true);
  });

  it("survives corrupted stored data", () => {
    const current = store();
    const merged = mergePersisted(
      { settings: { members: "nope" }, messages: [{ id: 1 }, null, "x"], records: {}, storeStatus: [] },
      current,
    );
    expect(merged.settings).toBe(current.settings);
    expect(merged.messages).toEqual([]);
    expect(merged.records).toEqual([]);
    expect(merged.storeStatus).toEqual({});
    expect(mergePersisted(null, current)).toBe(current);
  });

  it("resumes messages whose analysis was interrupted by a reload", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_suzuki", "緑ヶ丘店、清掃終わりました");
    // simulate a reload: timers and the transient buffer are gone
    cancelAllTimers();
    useDemoStore.setState({ pending: {} });
    expect(newRecords(before)).toHaveLength(0);

    // Just sent: another open tab may still be waiting on it, so it is only picked up after the
    // aggregation wait + reply delay (+ a margin) have passed without anyone processing it.
    expect(store().resumeInterrupted()).toBe(0);
    vi.advanceTimersByTime(waitSeconds() * 1000 + replyDelay() + 1_000);
    expect(newRecords(before)).toHaveLength(0);
    vi.advanceTimersByTime(2_000 + replyDelay());
    expect(newRecords(before)).toHaveLength(1);
    expect(store().resumeInterrupted()).toBe(0);
  });

  it("picks up an old interrupted message right away", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_suzuki", "緑ヶ丘店、清掃終わりました");
    cancelAllTimers();
    useDemoStore.setState({ pending: {} });
    vi.setSystemTime(Date.now() + 60_000);
    expect(store().resumeInterrupted()).toBe(1);
    vi.advanceTimersByTime(replyDelay());
    expect(newRecords(before)).toHaveLength(1);
  });

  it("does not thank twice when the comment comes after the photo's wait", () => {
    const before = snapshot();
    store().sendMessage("g_cleaning", "m_tanaka", "", [SAMPLE_PHOTOS[0]]);
    vi.advanceTimersByTime(waitSeconds() * 1000 + replyDelay() + 100);
    const firstReplies = newMessages(before).filter((m) => m.senderId === BOT_ID);
    expect(firstReplies).toHaveLength(1);
    expect(firstReplies[0].text).toContain("お疲れ様でした");

    vi.advanceTimersByTime(8_000); // typing the comment took a while
    store().sendMessage("g_cleaning", "m_tanaka", "駅前店の清掃完了しました");
    vi.advanceTimersByTime(waitSeconds() * 1000 + replyDelay() + 100);

    const replies = newMessages(before).filter((m) => m.senderId === BOT_ID);
    expect(replies).toHaveLength(1);
    expect(replies.some((m) => m.text.includes("写真の送付"))).toBe(false);
    expect(store().storeStatus.s_ekimae?.status).toBe("done");
    const last = newRecords(before).at(-1);
    expect(last?.plan.reply).toBeNull();
    expect(last?.plan.notes.join("")).toContain("重ねての返信は省略");
  });

  it("refreshes an untouched history on a new day but keeps a visitor's own data", () => {
    vi.setSystemTime(jst(10, 15, 10, 0));
    store().seedIfEmpty();
    expect(tokyoDateKey(store().seededAt!)).toBe("2026-10-15");
    expect(store().messages.every((m) => tokyoDateKey(m.createdAt) === "2026-10-15")).toBe(true);

    store().sendMessage("g_cleaning", "m_tanaka", "駅前店、これから清掃に入ります");
    vi.setSystemTime(jst(10, 16, 10, 0));
    const seededAt = store().seededAt;
    store().seedIfEmpty();
    expect(store().seededAt).toBe(seededAt);
  });
});

/* ------------------------------------------------------------------ */
/* Seed history                                                        */
/* ------------------------------------------------------------------ */

describe("buildSeedHistory", () => {
  const moments: Array<[string, number]> = [
    ["00:10", jst(10, 14, 0, 10)],
    ["03:00", jst(10, 14, 3, 0)],
    ["06:30", jst(10, 14, 6, 30)],
    ["09:00", jst(10, 14, 9, 0)],
    ["10:45", jst(10, 14, 10, 45)],
    ["14:00", DAYTIME],
    ["23:30", NIGHT],
  ];

  it.each(moments)("is consistent when opened at %s", (_label, now) => {
    const settings = defaultSettings();
    const seed = buildSeedHistory(settings, now);
    const kindOf = new Map(settings.groups.map((g) => [g.id, g.kind]));
    const roleOf = new Map(settings.members.map((m) => [m.id, m.role]));
    const recordIds = new Set(seed.records.map((r) => r.id));
    const messageById = new Map(seed.messages.map((m) => [m.id, m]));

    // everything happened before now, in order
    const times = [
      ...seed.messages.map((m) => m.createdAt),
      ...seed.records.map((r) => r.createdAt),
      ...seed.issues.flatMap((i) => [i.createdAt, i.updatedAt]),
      ...seed.deliveries.map((d) => d.createdAt),
      ...Object.values(seed.storeStatus).map((e) => e.updatedAt),
    ];
    expect(times.every((t) => t < now)).toBe(true);
    const messageTimes = seed.messages.map((m) => m.createdAt);
    expect(messageTimes).toEqual([...messageTimes].sort((a, b) => a - b));

    // every human message in the cleaning / call-center groups was analysed
    for (const m of seed.messages) {
      if (m.senderId === BOT_ID) continue;
      const kind = kindOf.get(m.groupId);
      if (kind === "cleaning" || kind === "callcenter") {
        expect(roleOf.get(m.senderId)).not.toBe("manager");
        expect(m.analysisId && recordIds.has(m.analysisId)).toBeTruthy();
      }
    }
    for (const r of seed.records) {
      for (const id of r.messageIds) expect(messageById.get(id)?.analysisId).toBe(r.id);
      if (r.plan.reply) {
        expect(seed.messages.some((m) => m.senderId === BOT_ID && m.replyTo?.includes(r.messageIds[0]))).toBe(true);
      }
    }
    for (const i of seed.issues) expect(recordIds.has(i.analysisId)).toBe(true);

    // the story: cleaning reports, one open leftover, one machine error in progress, one resolved escalation
    const cleaning = seed.records.filter((r) => r.analysis.category === "cleaning_start" || r.analysis.category === "cleaning_done");
    expect(cleaning.length).toBeGreaterThanOrEqual(6);
    expect(seed.records.some((r) => r.messageIds.length === 2 && r.photoCount === 1)).toBe(true);
    const byStatus = (status: string) => seed.issues.filter((i) => i.status === status).map((i) => i.category);
    expect(byStatus("open")).toEqual(["leftover"]);
    expect(byStatus("in_progress")).toEqual(["machine_error"]);
    expect(byStatus("resolved")).toEqual(["machine_error"]);
    expect(seed.issues.find((i) => i.status === "resolved")?.storeId).toBe("s_minami");
    expect(seed.messages.filter((m) => m.alert)).toHaveLength(3);
    expect(seed.messages.some((m) => m.groupId === "g_alerts" && roleOf.get(m.senderId) === "manager")).toBe(true);

    expect(seed.storeStatus.s_ekimae?.status).toBe("done");
    expect(seed.storeStatus.s_minami?.status).toBe("done");
    expect(seed.storeStatus.s_midori?.status).toBe("done");
    expect(seed.storeStatus.s_kita?.status).toBe("done");
    expect(seed.storeStatus.s_chuo?.status).toBe("cleaning");
  });

  it("lies within today once the morning is over", () => {
    for (const now of [jst(10, 14, 9, 0), jst(10, 14, 12, 0), DAYTIME, NIGHT]) {
      const seed = buildSeedHistory(defaultSettings(), now);
      expect(seed.messages.every((m) => tokyoDateKey(m.createdAt) === "2026-10-14")).toBe(true);
    }
  });

  it("feeds the dashboard selectors", () => {
    const s = store();
    const stats = selectTodayStats(s.records, s.issues, s.messages, DAYTIME, s.settings);
    expect(stats.received).toBe(s.records.length);
    expect(stats.forwarded).toBe(3);
    expect(stats.openIssues).toBe(2);
    expect(stats.autoRate).toBeGreaterThan(0.8);
    const board = selectStoreBoard(s.settings, s.storeStatus, DAYTIME);
    expect(board.map((b) => b.status)).toEqual(["done", "cleaning", "done", "done", "done"]);
  });

  it("skips steps whose members or groups were removed", () => {
    const settings = defaultSettings();
    settings.members = settings.members.filter((m) => m.id !== "m_yamamoto");
    settings.groups = settings.groups.filter((g) => g.kind !== "alerts");
    const seed = buildSeedHistory(settings, DAYTIME);
    expect(seed.messages.some((m) => m.senderId === "m_yamamoto")).toBe(false);
    expect(seed.messages.some((m) => m.alert)).toBe(false);
    expect(seed.records.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Storage adapter                                                     */
/* ------------------------------------------------------------------ */

describe("createSafeStorage", () => {
  const persisted = (): PersistedDemoState => {
    const { settings, messages, records, issues, deliveries, storeStatus, seededAt, lastActivityAt } = store();
    return { settings, messages, records, issues, deliveries, storeStatus, seededAt, lastActivityAt };
  };

  it("never writes before the saved data was read once", () => {
    const storage = createSafeStorage();
    memory.setItem("probe", "saved by an earlier visit");
    storage.setItem("probe", { state: persisted(), version: 1 });
    expect(memory.getItem("probe")).toBe("saved by an earlier visit");
    storage.getItem("probe");
    storage.setItem("probe", { state: persisted(), version: 1 });
    expect(memory.getItem("probe")).toContain("\"settings\"");
  });

  it("skips unchanged state and never throws when the quota is exceeded", () => {
    const storage = createSafeStorage();
    storage.getItem("probe");
    const writes = vi.spyOn(memory, "setItem");
    const state = persisted();
    storage.setItem("probe", { state, version: 1 });
    storage.setItem("probe", { state: { ...state }, version: 1 });
    expect(writes).toHaveBeenCalledTimes(1);

    // a big uploaded photo that does not fit: the adapter retries with a placeholder
    const big: ChatMessage = {
      id: "msg_big",
      groupId: "g_cleaning",
      senderId: "m_tanaka",
      text: "",
      photos: [{ id: "pho_big", src: `data:image/jpeg;base64,${"A".repeat(60_000)}`, alt: "写真" }],
      createdAt: DAYTIME,
    };
    const heavy = { ...state, messages: [big, ...state.messages] };
    const limit = JSON.stringify({ state, version: 1 }).length + 20_000;
    writes.mockImplementation((key: string, value: string) => {
      if (value.length > limit) throw new DOMException("quota", "QuotaExceededError");
      MemoryStorage.prototype.setItem.call(memory, key, value);
    });
    expect(() => storage.setItem("probe", { state: heavy, version: 1 })).not.toThrow();
    const saved = JSON.parse(memory.getItem("probe")!) as { state: PersistedDemoState };
    expect(saved.state.messages[0].id).toBe("msg_big");
    expect(saved.state.messages[0].photos[0].src).toBe(PHOTO_PLACEHOLDER_SRC);
    // the recent sample photos are small and untouched
    expect(saved.state.messages.slice(1).flatMap((m) => m.photos).every((p) => p.src.startsWith("data:image/svg+xml"))).toBe(true);
    writes.mockRestore();
  });
});
