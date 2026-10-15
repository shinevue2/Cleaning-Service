import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/seed";
import type { Member, NotifyTarget, Store } from "@/lib/types";
import {
  canDeleteMember,
  canDeleteStore,
  estimateHeld,
  finalizeMember,
  finalizeStore,
  finalizeTarget,
  hasErrors,
  nextAvatarColor,
  nightRangeLabel,
  sameBehavior,
  settingsFileName,
  targetWarning,
  toTimeInput,
  validateBehavior,
  validateMember,
  validateStore,
  validateTarget,
} from "../validation";
import { addWords, cleanWords, commonWords, matchesQuery, splitWords } from "../shared/words";

const s = defaultSettings();

describe("word helpers", () => {
  it("splits on Japanese and ASCII commas and line breaks", () => {
    expect(splitWords("水漏れ、漏水,浸水，\n 水浸し ")).toEqual(["水漏れ", "漏水", "浸水", "水浸し"]);
    expect(splitWords("、、")).toEqual([]);
  });

  it("detects duplicates like the engine (width, case, spaces)", () => {
    expect(cleanWords(["エラー", "ｴﾗｰ", " エラー ", "ERROR", "error", ""])).toEqual(["エラー", "ERROR"]);
    const result = addWords(["E21"], ["ｅ２１", "E22", "E22"]);
    expect(result.next).toEqual(["E21", "E22"]);
    expect(result.added).toEqual(["E22"]);
    expect(result.duplicates).toEqual(["ｅ２１", "E22"]);
    expect(commonWords(["故障", "停止"], ["故 障"])).toEqual(["故障"]);
  });

  it("searches every term across fields but not across field boundaries", () => {
    expect(matchesQuery("洗剤 どこ", ["洗剤の補充はどこ？", "回答"])).toBe(true);
    expect(matchesQuery("", ["x"])).toBe(true);
    expect(matchesQuery("剤回", ["洗剤", "回答"])).toBe(false);
  });
});

describe("staff", () => {
  const draft = (patch: Partial<Member> = {}): Member => ({
    id: "m_new",
    name: "高橋",
    role: "staff",
    storeIds: [],
    avatarColor: "#ef4444",
    ...patch,
  });

  it("requires a unique name and a valid LINE user id", () => {
    expect(hasErrors(validateMember(draft(), s.members))).toBe(false);
    expect(validateMember(draft({ name: "  " }), s.members).name).toBeDefined();
    expect(validateMember(draft({ name: "田中" }), s.members).name).toContain("同じ名前");
    expect(validateMember(draft({ lineUserId: "abc" }), s.members).lineUserId).toBeDefined();
    expect(validateMember(draft({ lineUserId: `U${"a".repeat(32)}` }), s.members).lineUserId).toBeUndefined();
    expect(validateMember(draft({ avatarColor: "red" }), s.members).avatarColor).toBeDefined();
  });

  it("keeps at least one cleaning staff member", () => {
    const one = s.members.filter((m) => m.role !== "staff" || m.id === "m_tanaka");
    expect(canDeleteMember("m_tanaka", one).ok).toBe(false);
    expect(canDeleteMember("m_yamamoto", one).ok).toBe(true);
    expect(validateMember({ ...one.find((m) => m.id === "m_tanaka")!, role: "manager" }, one).role).toBeDefined();
    expect(canDeleteMember("m_tanaka", s.members).ok).toBe(true);
    expect(canDeleteMember("m_only", [draft({ id: "m_only", role: "manager" })]).ok).toBe(false);
  });

  it("finalizes: trims, drops unknown stores and empty LINE ids", () => {
    const m = finalizeMember(draft({ name: " 高橋 ", storeIds: ["s_ekimae", "s_gone", "s_ekimae"], lineUserId: " " }), s.stores);
    expect(m.name).toBe("高橋");
    expect(m.storeIds).toEqual(["s_ekimae"]);
    expect("lineUserId" in m).toBe(false);
  });

  it("suggests an unused colour", () => {
    expect(s.members.map((m) => m.avatarColor)).not.toContain(nextAvatarColor(s.members));
  });
});

describe("stores", () => {
  const draft = (patch: Partial<Store> = {}): Store => ({ id: "s_new", name: "東口店", aliases: ["東口"], ...patch });

  it("rejects empty and duplicate names and aliases used by another store", () => {
    expect(hasErrors(validateStore(draft(), s.stores))).toBe(false);
    expect(validateStore(draft({ name: "" }), s.stores).name).toBeDefined();
    expect(validateStore(draft({ name: "駅前店" }), s.stores).name).toContain("同じ名前");
    expect(validateStore(draft({ name: "駅前" }), s.stores).name).toContain("駅前店");
    expect(validateStore(draft({ aliases: ["きたぐち"] }), s.stores).aliases).toContain("北口店");
    // editing a store against itself is fine
    const ekimae = s.stores.find((x) => x.id === "s_ekimae")!;
    expect(hasErrors(validateStore(ekimae, s.stores))).toBe(false);
  });

  it("keeps at least one store", () => {
    expect(canDeleteStore("s_ekimae", s.stores).ok).toBe(true);
    expect(canDeleteStore("s_ekimae", s.stores.slice(0, 1)).ok).toBe(false);
  });

  it("drops aliases equal to the name", () => {
    expect(finalizeStore(draft({ name: " 東口店 ", aliases: ["東口店", "東口", "ひがしぐち", "東口"] }))).toEqual({
      id: "s_new",
      name: "東口店",
      aliases: ["東口", "ひがしぐち"],
    });
  });
});

describe("notification targets", () => {
  const draft = (patch: Partial<NotifyTarget> = {}): NotifyTarget => ({
    id: "t_new",
    name: "店長のメール",
    channel: "email",
    address: "tencho@example.com",
    urgencies: ["urgent"],
    nightOnly: false,
    enabled: true,
    ...patch,
  });

  it("validates the address per channel", () => {
    expect(hasErrors(validateTarget(draft(), s.groups))).toBe(false);
    expect(validateTarget(draft({ address: "tencho" }), s.groups).address).toBeDefined();
    expect(validateTarget(draft({ channel: "phone", address: "090-1234-5678" }), s.groups).address).toBeUndefined();
    expect(validateTarget(draft({ channel: "phone", address: "０９０−****−１２３４" }), s.groups).address).toBeUndefined();
    expect(validateTarget(draft({ channel: "phone", address: "でんわ" }), s.groups).address).toBeDefined();
    expect(validateTarget(draft({ channel: "chatwork", address: "rid:000000" }), s.groups).address).toBeUndefined();
    expect(validateTarget(draft({ channel: "chatwork", address: "room" }), s.groups).address).toBeDefined();
    expect(validateTarget(draft({ channel: "line_group", address: "g_alerts" }), s.groups).address).toBeUndefined();
    expect(validateTarget(draft({ channel: "line_group", address: `C${"0".repeat(32)}` }), s.groups).address).toBeUndefined();
    expect(validateTarget(draft({ channel: "line_group", address: "abc" }), s.groups).address).toBeDefined();
    expect(validateTarget(draft({ urgencies: [] }), s.groups).urgencies).toBeDefined();
    expect(validateTarget(draft({ name: " " }), s.groups).name).toBeDefined();
  });

  it("warns when alerts would go to a staff group", () => {
    expect(targetWarning(draft({ channel: "line_group", address: "g_cleaning" }), s.groups)).toContain("スタッフ");
    expect(targetWarning(draft({ channel: "line_group", address: "g_alerts" }), s.groups)).toBeNull();
  });

  it("orders urgencies and normalises phone numbers", () => {
    const t = finalizeTarget(draft({ channel: "phone", address: " ０９０-1234-5678 ", urgencies: ["attention", "urgent"] }));
    expect(t.address).toBe("090-1234-5678");
    expect(t.urgencies).toEqual(["urgent", "attention"]);
  });
});

describe("behaviour", () => {
  it("accepts the defaults and rejects broken values", () => {
    expect(hasErrors(validateBehavior(s.behavior))).toBe(false);
    const bad = validateBehavior({
      ...s.behavior,
      botName: "",
      aggregateSeconds: 999,
      confidenceThreshold: 2,
      nightStart: "25:00",
      replyDelayMs: -1,
      dailyReportTime: "x",
    });
    expect(Object.keys(bad).sort()).toEqual(
      ["aggregateSeconds", "botName", "confidenceThreshold", "dailyReportTime", "nightStart", "replyDelayMs"].sort(),
    );
  });

  it("formats times for inputs and labels the night window", () => {
    expect(toTimeInput("8:00")).toBe("08:00");
    expect(toTimeInput("22時")).toBe("22:00");
    expect(toTimeInput("x")).toBe("");
    expect(nightRangeLabel(s.behavior)).toBe("22:00〜翌8:00");
    expect(nightRangeLabel({ nightStart: "12:00", nightEnd: "16:30" })).toBe("12:00〜16:30");
    expect(nightRangeLabel({ nightStart: "22:00", nightEnd: "22:00" })).toBeNull();
    expect(sameBehavior(s.behavior, { ...s.behavior })).toBe(true);
    expect(sameBehavior(s.behavior, { ...s.behavior, replyDelayMs: 1 })).toBe(false);
  });

  it("estimates how many past judgements a threshold would hold back", () => {
    const rec = (category: string, source: string, confidence: number, secondary: string[] = []) =>
      ({ analysis: { category, source, confidence, secondary } }) as unknown as Parameters<typeof estimateHeld>[0][number];
    const records = [
      rec("cleaning_done", "ai", 0.9),
      rec("cleaning_done", "ai", 0.6),
      rec("emergency", "ai", 0.5),
      rec("unknown", "fallback", 0.3),
      rec("unknown", "fallback", 0.5, ["leftover"]),
    ];
    expect(estimateHeld(records, 0.55)).toEqual({ total: 3, held: 1, unclear: 1 });
    expect(estimateHeld(records, 0.7)).toEqual({ total: 3, held: 2, unclear: 1 });
    expect(estimateHeld([], 0.7)).toEqual({ total: 0, held: 0, unclear: 0 });
  });

  it("names exported files by the Tokyo date", () => {
    const at = Date.UTC(2026, 9, 14, 6, 30); // 15:30 in Tokyo
    expect(settingsFileName(at)).toBe("laundry-settings-20261014-1530.json");
  });
});
