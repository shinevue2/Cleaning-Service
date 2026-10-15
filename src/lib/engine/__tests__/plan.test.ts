import { describe, expect, it } from "vitest";
import { analyze, choosePattern, composeTarget, plan, renderTemplate, routeTargets, run } from "@/lib/engine";
import type { Category } from "@/lib/types";
import { DAY, NIGHT, first, input, settings } from "./helpers";

describe("renderTemplate", () => {
  it("replaces placeholders", () => {
    expect(renderTemplate("{name}さん、{store}の清掃お疲れ様でした", { name: "田中", store: "駅前店" })).toBe(
      "田中さん、駅前店の清掃お疲れ様でした",
    );
  });

  it("renders unknown keys as empty", () => {
    expect(renderTemplate("{unknown}確認します", {})).toBe("確認します");
  });

  it("drops 「の件、」 when the target is empty", () => {
    expect(renderTemplate("ご報告ありがとうございます。{target}の件、担当者に共有しました。", { target: "" })).toBe(
      "ご報告ありがとうございます。担当者に共有しました。",
    );
  });

  it("drops 「さん、」 and a dangling 「の」 when a name or store is empty", () => {
    expect(renderTemplate("{name}さん、お疲れ様でした！", { name: "" })).toBe("お疲れ様でした！");
    expect(renderTemplate("{name}さん、{store}の清掃ありがとうございました！", { name: "田中", store: "" })).toBe(
      "田中さん、清掃ありがとうございました！",
    );
    expect(renderTemplate("駅前店の{machine}の件、確認します", { machine: " " })).toBe("駅前店の件、確認します");
  });

  it("collapses duplicated spaces left by empty values", () => {
    expect(renderTemplate("{a}  {b}　　{c}", { a: "A", b: "", c: "C" })).toBe("A C");
    expect(renderTemplate("  {a}  ", { a: "" })).toBe("");
  });

  it("does not re-expand placeholders inside values", () => {
    expect(renderTemplate("{answer}", { answer: "{name}は表示されません" })).toBe("{name}は表示されません");
  });
});

describe("composeTarget", () => {
  const s = settings();
  const target = (text: string, sender = "m_tanaka", photos = 0) => composeTarget(analyze(input(s, text, { sender, photos }), s), s);

  it("store + machine + error code", () => {
    expect(target("緑ヶ丘店の乾燥機3番がE21エラーで止まっています", "m_suzuki")).toBe("緑ヶ丘店の乾燥機3番（E21）");
  });

  it("falls back gracefully when parts are missing", () => {
    expect(target("北口店で洗濯物が放置されています")).toBe("北口店の残っている洗濯物");
    expect(target("北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", "m_sato")).toBe("北口店の洗濯機4番に3日間残っている洗濯物");
    expect(target("駅前店の乾燥機5番、昨日から洗濯物が置きっぱなしになってます")).toBe("駅前店の乾燥機5番に昨日から残っている洗濯物");
    expect(target("北口店に忘れ物があります")).toBe("北口店の忘れ物");
    expect(target("乾燥機が止まりました")).toBe("乾燥機");
    expect(target("エラーが出ました")).toBe("不具合");
    expect(target("今日はいい天気ですね")).toBe("ご報告");
    expect(target("駅前店、水漏れです")).toBe("駅前店の水漏れ");
  });
});

describe("plan by category", () => {
  const s = settings();
  const go = (text: string, opts: Parameters<typeof input>[2] = {}) => run(input(s, text, opts), s, first).plan;

  it("cleaning_start → greeting reply + store status 清掃中", () => {
    const p = go("駅前店、これから清掃に入ります");
    expect(p.reply).toBe("田中さん、駅前店の清掃よろしくお願いします！お気をつけて🙏");
    expect(p.storeStatus).toEqual({ storeId: "s_ekimae", status: "cleaning" });
    expect(p.forward).toBeNull();
    expect(p.createIssue).toBe(false);
  });

  it("cleaning_start without a store → reply but no status", () => {
    const p = go("これから清掃に入ります");
    // An unknown store is left out instead of reading 「店舗の清掃」.
    expect(p.reply).toBe("田中さん、清掃よろしくお願いします！お気をつけて🙏");
    expect(p.reply).not.toContain("店舗");
    expect(p.storeStatus).toBeUndefined();
  });

  it("cleaning_done with photo → thanks + status 完了", () => {
    const p = go("駅前店の清掃完了しました！", { photos: 1 });
    expect(p.reply).toBe("田中さん、お疲れ様でした！写真も確認しました✨");
    expect(p.storeStatus).toEqual({ storeId: "s_ekimae", status: "done" });
  });

  it("cleaning_done without photo → asks for a photo + status 写真待ち", () => {
    const p = go("南町店、清掃終わりました", { sender: "m_sato" });
    expect(p.reply).toContain("完了写真の送付もお願いします");
    expect(p.storeStatus).toEqual({ storeId: "s_minami", status: "awaiting_photo" });
  });

  it("cleaning_done without photo and photo requests off → plain thanks + 完了", () => {
    const s2 = settings((x) => (x.behavior.askPhotoWhenMissing = false));
    const p = run(input(s2, "南町店、清掃終わりました", { sender: "m_sato" }), s2, first).plan;
    expect(p.reply).toBe("佐藤さん、お疲れ様でした！");
    expect(p.reply).not.toContain("写真");
    expect(p.storeStatus).toEqual({ storeId: "s_minami", status: "done" });
  });

  it("photo-only report → completion reply", () => {
    const p = go("", { sender: "m_suzuki", photos: 3 });
    expect(p.reply).toContain("鈴木さん、お疲れ様でした");
    expect(p.storeStatus).toEqual({ storeId: "s_midori", status: "done" });
  });

  it("leftover → reply with target + forward (attention) + issue", () => {
    const p = go("北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです", { sender: "m_sato", photos: 1 });
    expect(p.reply).toBe(
      "ご報告ありがとうございます。北口店の洗濯機4番に3日間残っている洗濯物の件、担当者に共有しました。対応方法が決まり次第お知らせします。",
    );
    expect(p.forward?.urgency).toBe("attention");
    expect(p.forward?.title).toBe("⚠️ 要対応：北口店 洗濯機4番 洗濯物の放置（3日間）");
    expect(p.createIssue).toBe(true);
  });

  it("machine_error → forward title with store, machine and code", () => {
    const p = go("南町店の乾燥機3番がE21エラーで止まっています", { sender: "m_sato" });
    expect(p.forward?.title).toBe("⚠️ 要対応：南町店 乾燥機3番（E21）");
    expect(p.reply).toContain("南町店の乾燥機3番（E21）の件");
    expect(p.createIssue).toBe(true);
  });

  it("forward body has sender, group, store, text and reasoning", () => {
    const p = go("駅前店、洗濯機の下から水漏れしていて床が水浸しです！", { photos: 2 });
    const body = p.forward?.body ?? "";
    expect(body).toContain("送信者：田中（清掃スタッフ）");
    expect(body).toContain("グループ：【清掃】スタッフ連絡");
    expect(body).toContain("店舗：駅前店");
    expect(body).toContain("内容：駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    expect(body).toContain("写真：2枚");
    expect(body).toContain("判断理由：");
  });

  it("forward body trims long text to 200 characters", () => {
    const p = go(`駅前店で水漏れ${"あ".repeat(300)}`);
    const line = (p.forward?.body ?? "").split("\n").find((l) => l.startsWith("内容："));
    expect(line).toBeDefined();
    expect(Array.from(line ?? "").length).toBe("内容：".length + 200 + 1);
    expect(line?.endsWith("…")).toBe(true);
  });

  it("question + FAQ → the FAQ answer, no forward", () => {
    const p = go("洗剤の補充はどこにありますか？", { sender: "m_suzuki" });
    expect(p.reply).toContain("【自動回答】洗剤の在庫は");
    expect(p.forward).toBeNull();
    expect(p.createIssue).toBe(false);
  });

  it("question without FAQ → holding reply + forward (attention) + issue", () => {
    const p = go("中央通り店の自販機の釣り銭切れ、どうすればいいですか？");
    expect(p.reply).toBe("確認して折り返しご連絡します。少々お待ちください。");
    expect(p.forward?.urgency).toBe("attention");
    expect(p.forward?.title).toBe("⚠️ 要対応：中央通り店 自販機についての質問");
    expect(p.createIssue).toBe(true);
  });

  it("info → 承知しました, nothing else", () => {
    const p = go("【連絡】明日10時から中央通り店で業者の定期点検が入ります。", { sender: "m_yamamoto" });
    expect(p.reply).toBe("承知しました。共有ありがとうございます。");
    expect(p.forward).toBeNull();
    expect(p.createIssue).toBe(false);
  });

  it("emergency (day) → reply + urgent forward + issue, no phone", () => {
    const p = go("駅前店、洗濯機の下から水漏れしていて床が水浸しです！");
    expect(p.reply).toBe(
      "田中さん、ご連絡ありがとうございます。緊急のトラブルとして、担当者へすぐに連絡しました。安全を最優先に、無理のない範囲で対応をお願いします。",
    );
    expect(p.reply).not.toContain("夜間");
    expect(p.forward?.urgency).toBe("urgent");
    expect(p.forward?.title).toBe("🚨 緊急：駅前店 水漏れ");
    expect(p.createIssue).toBe(true);
    expect(p.notes).not.toContain("夜間のため電話通知も実行");
  });

  it("chat → no reply while its pattern is disabled", () => {
    const p = go("ありがとうございます！");
    expect(p.reply).toBeNull();
    expect(p.forward).toBeNull();
    expect(p.createIssue).toBe(false);
  });

  it("chat → replies once the pattern is enabled", () => {
    const s2 = settings((x) => x.replyPatterns.forEach((p) => p.category === "chat" && (p.enabled = true)));
    expect(run(input(s2, "ありがとうございます！"), s2, first).plan.reply).toBe("こちらこそありがとうございます！");
  });

  it("unknown → holding reply + forward (attention) + issue", () => {
    const p = go("今日はいい天気ですね");
    expect(p.reply).toBe("内容を確認します。少々お待ちください。");
    expect(p.forward?.urgency).toBe("attention");
    expect(p.forward?.title).toBe("⚠️ 要対応：内容の確認が必要なメッセージ");
    expect(p.createIssue).toBe(true);
  });

  it("cleaning_done + leftover → one combined reply + store status", () => {
    const p = go("駅前店の清掃完了しました。2番の乾燥機に洗濯物が置きっぱなしです", { photos: 1 });
    expect(p.reply?.startsWith("田中さん、清掃お疲れ様でした。\nご報告ありがとうございます。")).toBe(true);
    expect(p.storeStatus).toEqual({ storeId: "s_ekimae", status: "done" });
    expect(p.forward?.urgency).toBe("attention");
  });

  it("cleaning_done (no photo) + leftover → asks for the photo in the same message", () => {
    const p = go("駅前店の清掃完了しました。2番の乾燥機に洗濯物が置きっぱなしです");
    expect(p.reply).toContain("完了写真もあとで送ってください");
    expect(p.storeStatus).toEqual({ storeId: "s_ekimae", status: "awaiting_photo" });
  });

  it("emergency + cleaning_done → status recorded but no 'お疲れ様' on top of the alarm", () => {
    const p = go("駅前店の清掃完了しました。ただ洗濯機から水漏れしています");
    expect(p.forward?.urgency).toBe("urgent");
    expect(p.reply).not.toContain("お疲れ様");
    expect(p.storeStatus?.storeId).toBe("s_ekimae");
  });
});

describe("manager messages", () => {
  it("never get a reply or a forward", () => {
    const s = settings();
    for (const text of ["駅前店で水漏れ、今向かっています", "了解です", "鍵はどこですか？"]) {
      const p = run(input(s, text, { sender: "m_owner" }), s, first).plan;
      expect(p.reply).toBeNull();
      expect(p.forward).toBeNull();
      expect(p.createIssue).toBe(false);
    }
  });
});

describe("night mode", () => {
  const s = settings();

  it("emergency at night uses the night pattern and notes the phone call", () => {
    const p = run(input(s, "駅前店、洗濯機の下から水漏れしています", { now: NIGHT }), s, first).plan;
    expect(p.reply).toContain("夜間のため電話でも呼び出しています");
    expect(p.notes).toContain("夜間のため電話通知も実行");
  });

  it("no phone note — and no 「電話でも呼び出しています」 — when the phone target is disabled", () => {
    const s2 = settings((x) => x.notifyTargets.forEach((t) => t.channel === "phone" && (t.enabled = false)));
    const p = run(input(s2, "駅前店で水漏れしています", { now: NIGHT }), s2, first).plan;
    expect(p.notes).not.toContain("夜間のため電話通知も実行");
    expect(p.reply).not.toContain("電話");
    expect(p.reply).toContain("緊急のトラブルとして、担当者へすぐに連絡しました。");
  });

  it("call-center emergencies get the call-center night text", () => {
    const p = run(input(s, "北口店で焦げ臭いにおいがするとお客様から連絡がありました", { sender: "m_yamamoto", now: NIGHT }), s, first).plan;
    expect(p.reply).toContain("夜間のため電話でも呼び出しています");
    expect(p.reply).toContain("お客様には、安全を最優先にしていただくようご案内をお願いします。");
    expect(p.reply).not.toContain("無理のない範囲");
  });

  it("non-emergency replies are unchanged at night", () => {
    const p = run(input(s, "駅前店、これから清掃に入ります", { now: NIGHT }), s, first).plan;
    expect(p.reply).toBe("田中さん、駅前店の清掃よろしくお願いします！お気をつけて🙏");
  });
});

describe("reply pattern selection", () => {
  const s = settings();

  it("prefers night > photo-specific > any", () => {
    const patterns = [
      { id: "a", category: "cleaning_done" as Category, when: "any" as const, texts: ["any"], enabled: true },
      { id: "p", category: "cleaning_done" as Category, when: "with_photo" as const, texts: ["photo"], enabled: true },
      { id: "n", category: "cleaning_done" as Category, when: "night" as const, texts: ["night"], enabled: true },
    ];
    expect(choosePattern(patterns, "cleaning_done", { night: true, photo: "with" })?.id).toBe("n");
    expect(choosePattern(patterns, "cleaning_done", { night: false, photo: "with" })?.id).toBe("p");
    expect(choosePattern(patterns, "cleaning_done", { night: false, photo: "without" })?.id).toBe("a");
  });

  it("skips disabled and empty patterns", () => {
    const patterns = [
      { id: "off", category: "info" as Category, when: "any" as const, texts: ["x"], enabled: false },
      { id: "empty", category: "info" as Category, when: "any" as const, texts: [" "], enabled: true },
    ];
    expect(choosePattern(patterns, "info", { night: false, photo: "ignore" })).toBeUndefined();
  });

  it("pick(n) chooses the variant", () => {
    const a = run(input(s, "【連絡】明日業者が入ります", { sender: "m_yamamoto" }), s, () => 1);
    expect(a.plan.reply).toBe("承知しました。");
    const outOfRange = run(input(s, "【連絡】明日業者が入ります", { sender: "m_yamamoto" }), s, () => 99);
    expect(outOfRange.plan.reply).toBe("承知しました。");
  });

  it("every default pattern renders without leftover placeholders", () => {
    const texts = [
      "駅前店、これから清掃に入ります",
      "駅前店の清掃完了しました",
      "北口店に忘れ物があります",
      "乾燥機が止まりました",
      "鍵はどこですか？",
      "釣り銭切れはどうすればいいですか？",
      "水漏れしています",
      "今日はいい天気ですね",
    ];
    for (const text of texts) {
      for (const photos of [0, 1]) {
        for (let i = 0; i < 3; i++) {
          const reply = run(input(s, text, { photos }), s, () => i).plan.reply ?? "";
          expect(reply).not.toMatch(/[{}]/);
        }
      }
    }
  });
});

describe("routeTargets", () => {
  const s = settings();
  const ids = (urgency: Parameters<typeof routeTargets>[0], now: number) => routeTargets(urgency, now, s).map((t) => t.id);

  it("routes urgent alerts to the group and email by day, plus the phone at night", () => {
    expect(ids("urgent", DAY)).toEqual(["t_alerts_line", "t_owner_mail"]);
    expect(ids("urgent", NIGHT)).toEqual(["t_alerts_line", "t_owner_mail", "t_night_phone"]);
  });

  it("routes attention alerts only to enabled targets", () => {
    expect(ids("attention", DAY)).toEqual(["t_alerts_line"]);
  });

  it("routes nothing for normal urgency", () => {
    expect(ids("normal", DAY)).toEqual([]);
  });
});

describe("plan with a pre-computed analysis", () => {
  it("does not reply to a manager even if the analysis says emergency", () => {
    const s = settings();
    const inp = input(s, "水漏れ", { sender: "m_owner" });
    const p = plan(inp, analyze(inp, s), s, first);
    expect(p).toEqual({ reply: null, forward: null, createIssue: false, notes: ["管理者の投稿のため、自動返信・転送は行いません"] });
  });
});
