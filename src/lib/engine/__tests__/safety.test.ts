/**
 * Regression tests for the engine-accuracy review: every message here was mis-handled by an earlier
 * version (silently thanked, never forwarded, or a false alarm that would ring the owner at night).
 */
import { describe, expect, it } from "vitest";
import { analyze, detectStore, findFaq, matchText, run } from "@/lib/engine";
import type { Category, LearnedExample, Urgency } from "@/lib/types";
import { DAY, NIGHT, first, input, member, settings } from "./helpers";

const s = settings();
const go = (text: string, opts: Parameters<typeof input>[2] = {}) => run(input(s, text, opts), s, first);
const cat = (text: string, opts: Parameters<typeof input>[2] = {}) => analyze(input(s, text, opts), s);

describe("photo + unrecognised text is not thanked as 清掃完了", () => {
  it.each([
    "乾燥機の中に衣類残ってます",
    "乾燥機3番 E21",
    "北口店の乾燥機1番ガタンガタン音がしてます",
    "駅前店 乾燥機の中にタオルが残されてました",
  ])("%s (+写真)", (text) => {
    const r = go(text, { sender: "m_suzuki", photos: 1 });
    expect(r.analysis.category).not.toBe("cleaning_done");
    expect(r.plan.forward).not.toBeNull();
    expect(r.plan.reply ?? "").not.toContain("お疲れ様でした");
  });

  it("photo with nothing, a greeting or a completion word is still a completion report", () => {
    for (const text of ["", "お疲れ様です", "終わりました〜", "完了📸", "清掃完量しました"]) {
      expect(cat(text, { sender: "m_suzuki", photos: 1 }).category).toBe("cleaning_done");
    }
  });
});

describe("call-center trouble is never closed with 「承知しました」", () => {
  const cc = { sender: "m_yamamoto" };
  it.each([
    "緑ヶ丘店の店内に不審な人がいるとお客様から連絡ありました",
    "お客様から、店内の自動ドアに挟まれて指を切ったと連絡がありました",
    "【至急】北口店で乾燥機のドアが開かず中の服が取り出せないと入電がありました。お客様は店内でお待ちです",
    "両替機でお札が戻ってこないとの連絡",
    "洗濯物を忘れたので保管してほしいとの入電",
    "深夜ですが南町店の乾燥機が止まらないとの入電です",
    "お客様が怒っています。至急連絡ください",
    "北口店のお客様から、駐車場に不審な車が停まっていると連絡がありました",
    "駅前店のお客様から、洗剤が出ないと連絡がありました",
    "中央通り店のお客様から、店内が暑すぎると苦情の連絡がありました。対応お願いします",
    "お疲れ様です。南町店のお客様より、乾燥機に100円入れたけどスタートしないとのお問い合わせです",
  ])("%s", (text) => {
    const r = go(text, cc);
    expect(["info", "chat"]).not.toContain(r.analysis.category);
    expect(r.plan.forward).not.toBeNull();
    expect(r.plan.reply ?? "").not.toBe("承知しました。共有ありがとうございます。");
  });

  it("routine call-center notes are still 連絡事項", () => {
    expect(cat("【連絡】明日10時から中央通り店で業者の定期点検が入ります。", cc).category).toBe("info");
    expect(cat("本日の入電は以上です。ありがとうございました。", cc).category).toBe("info");
    expect(cat("北口店の件、お客様に返金対応済みです", cc).category).toBe("info");
    expect(cat("本日は特に入電ありませんでした", cc).category).toBe("info");
  });

  it("「至急」 raises the request to 緊急 (email, and a phone call at night)", () => {
    const r = go("お客様が怒っています。至急連絡ください", { ...cc, now: NIGHT });
    expect(r.analysis.urgency).toBe("urgent");
    expect(r.plan.forward?.urgency).toBe("urgent");
  });
});

describe("greetings and acknowledgements", () => {
  it.each(["はーい", "👍", "りょ", "かしこまりました", "OKです！", "了解です", "🙆‍♀️"])("「%s」 is chat (no reply, no forward)", (text) => {
    const r = go(text);
    expect(r.analysis.category).toBe("chat");
    expect(r.plan.forward).toBeNull();
    expect(r.plan.createIssue).toBe(false);
  });

  it("a greeting followed by a real report is not chat", () => {
    const r = go("お疲れ様です。南町店のお客様より、乾燥機に100円入れたけどスタートしないとのお問い合わせです", { sender: "m_yamamoto" });
    expect(r.analysis.category).not.toBe("chat");
    expect(r.plan.forward).not.toBeNull();
  });

  it("acknowledgement words inside other text are not chat by themselves", () => {
    expect(cat("はい、乾燥機3番が止まっています").category).toBe("machine_error");
  });
});

describe("denials are not alarms (negation)", () => {
  const night = (text: string, sender = "m_suzuki", photos = 1) => go(text, { sender, photos, now: NIGHT });

  it.each([
    ["中央通り店の清掃終わりました。水漏れはありませんでした", "m_tanaka"],
    ["清掃完了しました。破損などもありませんでした", "m_tanaka"],
    ["南町店 清掃完了しました！異臭もなく快適です", "m_sato"],
    ["中央通り店 終わりました。けが人なし、トラブルなしです", "m_tanaka"],
    ["清掃完了しました。水漏れ等の異常はありません", "m_suzuki"],
    ["駅前店清掃完了しました。エラーなく全台正常に動いてます", "m_tanaka"],
  ])("%s", (text, sender) => {
    const r = night(text, sender);
    expect(r.analysis.category).toBe("cleaning_done");
    expect(r.analysis.urgency).toBe("normal");
    expect(r.plan.forward).toBeNull();
    expect(r.plan.notes).not.toContain("夜間のため電話通知も実行");
  });

  it.each([
    ["停電の影響はなさそうです", "m_tanaka"],
    ["けが人はいません。大丈夫です", "m_tanaka"],
    ["停電はしていません", "m_tanaka"],
    ["エラーは出ていません", "m_tanaka"],
    ["停電の予定はありません", "m_yamamoto"],
    ["お客様にけがはありませんでした", "m_yamamoto"],
    ["北口店の駐車場で車同士の接触事故があったそうです。けが人はいないとのことです", "m_yamamoto"],
  ])("%s → no emergency", (text, sender) => {
    const a = cat(text, { sender });
    expect(a.category).not.toBe("emergency");
    expect(a.urgency).not.toBe("urgent");
  });

  it("explains the denial like an AI would", () => {
    const a = cat("停電はしていません");
    expect(a.category).toBe("info");
    expect(a.reasoning).toContain("“停電”");
    expect(a.reasoning).toContain("打ち消し");
  });

  it("keeps real alarms that only look like denials", () => {
    expect(cat("水漏れが止まらないです").category).toBe("emergency");
    expect(cat("エラーがなくならないです").category).toBe("machine_error");
    expect(cat("けが人はいませんが、ガラスが割れて危ないです").category).toBe("emergency");
    expect(cat("停電はしていませんが、乾燥機だけ電源が入りません").category).toBe("machine_error");
    // asking someone to check is not an all-clear report
    expect(cat("水漏れしてないか確認お願いします").category).not.toBe("info");
  });

  it("a manager correction can now teach a denied message (no emergency keyword left)", () => {
    const ex: LearnedExample = { id: "l1", text: "水漏れはありませんでした", category: "info", urgency: "normal", createdAt: DAY - 1 };
    const s2 = settings((x) => x.learned.push(ex));
    const a = analyze(input(s2, "水漏れはありませんでした"), s2);
    expect(a.category).toBe("info");
    expect(a.urgency).toBe("normal");
  });
});

describe("emergency recall: everyday wording is urgent", () => {
  it.each([
    "床が水だらけです",
    "乾燥機から煙でてます！！",
    "ボヤ騒ぎがありました",
    "排水溝から水が逆流しています",
    "ガスくさいです",
    "ガスのにおいがします",
    "衣類が焦げている",
    "乾燥機が異常に熱くなって火が出そう",
    "コンセントから火花出てる",
    "店内に不審な人がいます",
    "両替機がこじ開けられてます",
    "お客様が大変お怒りで、責任者に代われと言っています",
    "お客様が指を切ったそうです",
    "声をかけても起きません",
    "ミズモレしてます",
    "煙みたいなのが出てます",
    "北口店ブレーカー落ちて真っ暗です",
    "南町店の天井から水がポタポタ落ちてきています",
  ])("%s", (text) => {
    const r = go(text, { now: NIGHT });
    expect(r.analysis.urgency).toBe("urgent");
    expect(r.plan.forward?.urgency).toBe("urgent");
    expect(r.plan.notes).toContain("夜間のため電話通知も実行");
  });

  it("bare けが / 訴え no longer raise false alarms", () => {
    expect(cat("わけがわからないです").category).not.toBe("emergency");
    expect(cat("お客様が不調を訴えています", { sender: "m_yamamoto" }).category).not.toBe("emergency");
  });

  it("katakana words never match unrelated hiragana", () => {
    expect(cat("写真がぼやけてすみません、撮り直します").category).not.toBe("emergency");
    expect(cat("鍵をさがすのに時間がかかりました").urgency).not.toBe("urgent");
  });

  it("「緊急ではない」 and 「緊急連絡先」 are not urgent", () => {
    expect(cat("緊急ではないのですが、北口店の照明が1本切れているそうです", { sender: "m_yamamoto" }).urgency).not.toBe("urgent");
    expect(cat("緊急連絡先を教えてください").urgency).not.toBe("urgent");
  });

  it("the danger safety net forwards unknown wording as urgent with an explanation", () => {
    const r = go("店の前で酔っ払いが騒いでて怖いです", { sender: "m_suzuki" });
    expect(r.analysis.urgency).toBe("urgent");
    expect(r.plan.reply ?? "").not.toContain("少々お待ちください");
    expect(r.plan.forward?.title).toMatch(/^🚨 緊急：/);
  });
});

describe("conjugation and kana variants", () => {
  it.each<[string, Category, string?]>([
    ["乾燥機4番 回ってないです", "machine_error"],
    ["ドアが開かなくなってます", "machine_error"],
    ["動かなくなりました", "machine_error"],
    ["反応ないです", "machine_error"],
    ["排水されません", "machine_error"],
    ["お札が戻ってこない", "machine_error"],
    ["両替機お札入らない", "machine_error"],
    ["ドアロックが解除されない", "machine_error"],
    ["中央通り店おわりました！", "cleaning_done", "m_tanaka"],
    ["緑が丘はいりまーす", "cleaning_start", "m_suzuki"],
    ["清掃スタートします", "cleaning_start"],
    ["掃除はじめます", "cleaning_start"],
    ["洗濯物とりにこないです", "leftover"],
    ["明日のシフト何時からでしたっけ", "question"],
  ])("%s → %s", (text, category, sender) => {
    expect(cat(text, { sender: sender ?? "m_tanaka" }).category).toBe(category);
  });

  it("half-width katakana store names are recognised", () => {
    const a = cat("ｷﾀｸﾞﾁ店 清掃開始", { sender: "m_sato" });
    expect(a.category).toBe("cleaning_start");
    expect(a.extracted.storeId).toBe("s_kita");
  });

  it("FAQ words match casual spellings", () => {
    expect(findFaq(matchText("ゴミ出しの曜日おしえてください🙏"), s.faqs)?.faq.id).toBe("f_garbage");
    const a = cat("ゴミ出しの曜日おしえてください🙏");
    expect(a).toMatchObject({ category: "question", faqId: "f_garbage" });
    expect(cat("洗剤の場所ってどこでしたっけ").faqId).toBe("f_detergent");
    expect(cat("フィルター掃除のやり方わからないです").faqId).toBe("f_filter");
  });
});

describe("error codes, resolved faults and refunds", () => {
  it("an error code alone is a machine error, explained without repeating the code", () => {
    for (const text of ["乾燥機3番 E21 です", "E21"]) {
      expect(cat(text).category).toBe("machine_error");
    }
    const a = cat("乾燥機3番 E21 です");
    expect(a.reasoning).toContain("“E21”");
    expect(a.reasoning).not.toContain("“E21”“E21”");
  });

  it.each<[string, string]>([
    ["乾燥機3番のエラー、リセットしたら直りました", "m_tanaka"],
    ["北口店の両替機の千円札が詰まってたので取り除きました。今は正常です", "m_sato"],
    ["エラーは解消したとお客様から再度連絡がありました", "m_yamamoto"],
    ["北口店の件、お客様に返金対応済みです", "m_yamamoto"],
    ["返金は不要とのことです", "m_yamamoto"],
  ])("%s → 連絡事項, no 「使用中止」 request", (text, sender) => {
    const r = go(text, { sender });
    expect(r.analysis.category).toBe("info");
    expect(r.plan.reply ?? "").not.toContain("使用中止");
    expect(r.plan.forward).toBeNull();
  });

  it("a fault that came back after being fixed is still a fault", () => {
    expect(cat("リセットしたら直りましたが、また止まりました").category).toBe("machine_error");
  });

  it("「引き取りに来ます」 (a supplier picking up a machine) is not a leftover", () => {
    expect(cat("業者が古い洗濯機を引き取りに来ます").category).not.toBe("leftover");
  });

  it("a payment question without a machine is a question, not a fault", () => {
    const a = cat("クレジットカードは使えないですか？ってお客さんに聞かれました");
    expect(a.category).toBe("question");
  });
});

describe("store detection", () => {
  it("multi-store call-center summaries name the store of the trouble", () => {
    const text = "①駅前店：乾燥機の使い方の問い合わせ→説明済み ②南町店：洗濯機2番が回らないとの入電→返金対応お願いします ③北口店：特になし";
    const r = go(text, { sender: "m_yamamoto" });
    expect(r.analysis.category).toBe("machine_error");
    expect(r.analysis.extracted.storeId).toBe("s_minami");
    expect(r.plan.forward?.title).toContain("南町店");
    expect(r.plan.reply).toContain("南町店");
  });

  it("detectStore keeps the first store without an anchor", () => {
    expect(detectStore(matchText("南町店のあと北口店に向かいます"), s.stores, member(s, "m_sato"))?.store.id).toBe("s_minami");
  });
});

describe("replies", () => {
  it("an unknown store is left out instead of 「店舗の」", () => {
    expect(go("清掃終わりました", { photos: 1 }, ).plan.reply).not.toContain("店舗");
    expect(run(input(s, "そうじ終わりました〜", { photos: 1 }), s, () => 1).plan.reply).toBe(
      "田中さん、清掃ありがとうございました！写真確認しました。お疲れ様でした。",
    );
  });

  it("leftover replies talk about the laundry, not 「放置物」", () => {
    const r = go("駅前店の乾燥機5番、昨日から洗濯物が置きっぱなしになってます", { photos: 1 });
    expect(r.plan.reply).toBe(
      "ご報告ありがとうございます。駅前店の乾燥機5番に昨日から残っている洗濯物の件、担当者に共有しました。対応方法が決まり次第お知らせします。",
    );
    expect(r.plan.forward?.title).toBe("⚠️ 要対応：駅前店 乾燥機5番 洗濯物の放置（昨日から）");
    expect(r.plan.reply).not.toContain("放置物");
  });

  it("a question inside a trouble report is acknowledged", () => {
    const r = go("南町店 洗濯物放置3日目です。どうしますか？", { sender: "m_sato" });
    expect(r.analysis.category).toBe("leftover");
    expect(r.plan.reply).toContain("ご質問の件も、担当者から折り返しご連絡します。");
  });

  it("a second trouble in the same message is named in the alert and the reply", () => {
    const r = go(
      "おはようございます。駅前店の清掃完了しました。乾燥機3番がまたE21で止まってたので電源入れ直しましたが直りません。あと洗濯機2番に洗濯物が入ったままでした",
      { photos: 1 },
    );
    expect(r.analysis.category).toBe("machine_error");
    expect(r.plan.forward?.title).toBe("⚠️ 要対応：駅前店 乾燥機3番（E21） ほか1件（放置・忘れ物）");
    expect(r.plan.reply).toContain("洗濯物の放置の件も、あわせて担当者に共有しました。");
    expect(r.plan.storeStatus).toEqual({ storeId: "s_ekimae", status: "done" });
  });

  it("emergency replies address the staff member by name; the call center gets its own text", () => {
    expect(go("駅前店で水漏れしています").plan.reply).toMatch(/^田中さん、ご連絡ありがとうございます。/);
    const cc = go("北口店で焦げ臭いにおいがするとお客様から連絡がありました", { sender: "m_yamamoto" }).plan.reply ?? "";
    expect(cc).toContain("お客様には、安全を最優先にしていただくようご案内をお願いします。");
    expect(cc).not.toContain("無理のない範囲");
  });

  it("uncertain-but-dangerous messages get a safety reply, not 「少々お待ちください」", () => {
    const r = go("店の前で酔っ払いが騒いでて怖いです", { sender: "m_suzuki" });
    expect(r.plan.reply).toContain("担当者へすぐに連絡しました");
  });
});

describe("staff all-clear reports are not forwarded", () => {
  it.each<[string, Urgency]>([
    ["異常なし", "normal"],
    ["問題ありません", "normal"],
    ["漏れなく確認しました", "normal"],
    ["明日10時に業者さんが点検に来るそうです", "normal"],
  ])("%s", (text, urgency) => {
    const r = go(text);
    expect(r.analysis.urgency).toBe(urgency);
    expect(r.plan.forward).toBeNull();
    expect(r.plan.createIssue).toBe(false);
  });
});
