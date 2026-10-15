/**
 * Turns an Analysis into concrete actions: the reply text, a forward to the managers,
 * an entry in the 要対応リスト and a store cleaning-status update.
 */
import type {
  ActionPlan,
  Analysis,
  Category,
  EngineInput,
  Member,
  MemberRole,
  NotifyTarget,
  ReplyPattern,
  Settings,
  Store,
  StoreCleaningStatus,
  Urgency,
} from "../types";
import { CATEGORY_LABELS, CLEANING_STATUS_LABELS, ROLE_LABELS, URGENCY_LABELS } from "../types";
import { maxUrgency } from "./analyze";
import { describeEmergency } from "./extract";
import { formatTokyoTime, isNight } from "./time";

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Private-use marker (U+E000) for "a placeholder that rendered empty", removed after tidying. */
const EMPTY = "\uE000";
const RE_EMPTY_BRACKETS = /「\uE000」|『\uE000』|（\uE000）|\(\uE000\)|【\uE000】/g;
const RE_EMPTY_BETWEEN_NO = /の\uE000の/g; // "駅前店の{machine}の件" → "駅前店の件"
const RE_EMPTY_TOPIC = /\uE000の件[、,]?/g;
const RE_EMPTY_NAME = /\uE000(?:さん|様|さま)[、,]?/g;
const RE_EMPTY_LEADING_NO = /(^|[。、！!？?\s「『（(])\uE000の/gm; // "{store}の清掃" at a phrase start → "清掃"
const RE_EMPTY_TRAILING_NO = /の\uE000/g;
const RE_EMPTY_ANY = /\uE000/g;

/**
 * Replaces {key} placeholders. Unknown or empty values render as "" and the grammar around them is
 * tidied: 「{target}の件、」, 「{name}さん、」, 「{store}の清掃」 and duplicated spaces/commas disappear.
 */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_whole, key: string) => {
    const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : undefined;
    const text = value == null ? "" : String(value);
    return text.trim() === "" ? EMPTY : text;
  });
  if (out.includes(EMPTY)) {
    out = out
      .replace(RE_EMPTY_BRACKETS, EMPTY)
      .replace(RE_EMPTY_BETWEEN_NO, "の")
      .replace(RE_EMPTY_TOPIC, "")
      .replace(RE_EMPTY_NAME, "")
      .replace(RE_EMPTY_LEADING_NO, "$1")
      .replace(RE_EMPTY_TRAILING_NO, "")
      .replace(RE_EMPTY_ANY, "");
  }
  return out
    .replace(/([ \t　])[ \t　]+/g, "$1")
    .replace(/、{2,}/g, "、")
    .replace(/、(?=[。！!？?])/g, "")
    .replace(/^[ \t　、,]+/gm, "")
    .replace(/[ \t　]+$/gm, "")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Subjects ({target} and forward titles)                              */
/* ------------------------------------------------------------------ */

function joinNo(...parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join("の");
}

function storeOf(analysis: Analysis, settings: Settings): Store | undefined {
  const id = analysis.extracted.storeId;
  return id ? settings.stores.find((s) => s.id === id) : undefined;
}

const isForgotten = (analysis: Analysis): boolean => analysis.extracted.keywords.some((k) => /忘れ/.test(k));
const mentionsRefund = (analysis: Analysis): boolean => analysis.extracted.keywords.some((k) => k.includes("返金"));

/** "3日間" / "昨日から" for leftover reports ("" when unknown). */
function leftoverSince(days: number | undefined): string {
  if (days === undefined) return "";
  return days === 1 ? "昨日から" : `${days}日間`;
}

/** The "what" without the store, e.g. "乾燥機3番（E21）", "洗濯機4番に3日間残っている洗濯物", "水漏れ". */
function topicOf(analysis: Analysis): string {
  const { machine, errorCode, days, keywords } = analysis.extracted;
  switch (analysis.category) {
    case "emergency":
      return describeEmergency(keywords).noun;
    case "machine_error": {
      const base = machine ?? (errorCode ? "エラー" : "不具合");
      return errorCode ? `${base}（${errorCode}）` : base;
    }
    case "leftover":
      if (isForgotten(analysis)) return joinNo(machine, "忘れ物");
      return `${machine ? `${machine}に` : ""}${leftoverSince(days)}残っている洗濯物`;
    case "question":
      return machine ? `${machine}についてのご質問` : "ご質問";
    case "cleaning_start":
    case "cleaning_done":
      return "清掃";
    default:
      return "";
  }
}

/**
 * {target}: the composed subject used in replies — 「緑ヶ丘店の乾燥機3番（E21）」,
 * 「北口店の洗濯機4番に3日間残っている洗濯物」, 「駅前店の水漏れ」 — falling back to 「ご報告」.
 */
export function composeTarget(analysis: Analysis, settings: Settings): string {
  const store = storeOf(analysis, settings)?.name;
  const topic = topicOf(analysis);
  if (topic) return joinNo(store, topic);
  return store ? `${store}のご報告` : "ご報告";
}

const TITLE_PREFIX: Record<Urgency, string> = {
  urgent: "🚨 緊急：",
  attention: "⚠️ 要対応：",
  normal: "ℹ️ 共有：",
};

function titleTopic(analysis: Analysis, sender: Member): string {
  const { machine, errorCode, days, keywords } = analysis.extracted;
  switch (analysis.category) {
    case "leftover": {
      if (isForgotten(analysis)) return joinNo(machine, "忘れ物");
      const since = leftoverSince(days);
      return `${machine ? `${machine} ` : ""}洗濯物の放置${since ? `（${since}）` : ""}`;
    }
    case "machine_error": {
      const base = machine
        ? errorCode
          ? `${machine}（${errorCode}）`
          : `${machine}の不具合`
        : errorCode
          ? `エラー（${errorCode}）`
          : "設備の不具合";
      return mentionsRefund(analysis) ? `${base}・返金の申し出` : base;
    }
    case "question":
      return machine
        ? `${machine}についての質問`
        : sender.role === "callcenter"
          ? "コールセンターからの確認依頼"
          : "スタッフからの質問";
    case "unknown": {
      if (analysis.urgency !== "urgent") return "内容の確認が必要なメッセージ";
      const { kind, noun } = describeEmergency(keywords);
      return kind === "generic" ? "危険の可能性がある連絡（要確認）" : `${noun}（要確認）`;
    }
    default:
      return topicOf(analysis) || CATEGORY_LABELS[analysis.category];
  }
}

/** Categories that each need a human: a second one in the same message is named in the alert and reply. */
const TROUBLES: readonly Category[] = ["emergency", "machine_error", "leftover"];

/** Other troubles reported in the same message ("…E21で止まっています。あと洗濯機2番に洗濯物が入ったまま"). */
export function otherTroubles(analysis: Analysis): Category[] {
  if (!TROUBLES.includes(analysis.category)) return [];
  return analysis.secondary.filter((c) => TROUBLES.includes(c) && c !== analysis.category);
}

/** 「🚨 緊急：駅前店 水漏れ」 / 「⚠️ 要対応：南町店 乾燥機3番（E21） ほか1件（放置・忘れ物）」 */
export function composeForwardTitle(analysis: Analysis, urgency: Urgency, settings: Settings, sender: Member): string {
  const store = storeOf(analysis, settings)?.name;
  const others = otherTroubles(analysis);
  const more = others.length > 0 ? ` ほか${others.length}件（${others.map((c) => CATEGORY_LABELS[c]).join("、")}）` : "";
  return `${TITLE_PREFIX[urgency]}${[store, titleTopic(analysis, sender)].filter(Boolean).join(" ")}${more}`;
}

/** Removes the alert prefix ("🚨 緊急：") of a forward title, e.g. for lists that show urgency as a badge. */
export function cleanAlertTitle(title: string): string {
  return title.replace(/^\s*(?:🚨|⚠️|⚠|ℹ️|ℹ)?\s*(?:緊急|要対応|共有)\s*[：:]\s*/u, "").trim() || title.trim();
}

const BODY_TEXT_LIMIT = 200;

function trimText(text: string, limit = BODY_TEXT_LIMIT): string {
  const chars = Array.from(text.trim());
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : chars.join("");
}

function senderLabel(sender: Member): string {
  const role = ROLE_LABELS[sender.role];
  return sender.name.includes(role) ? sender.name : `${sender.name}（${role}）`;
}

function judgementLabel(analysis: Analysis): string {
  switch (analysis.source) {
    case "learned":
      return "判定（過去の修正例）";
    case "faq":
      return "判定（よくある質問）";
    case "fallback":
      return "判定（保留）";
    case "rule":
      return "判定（キーワード）";
    default:
      return analysis.sample ? "AI判定（サンプル）" : "AI判定";
  }
}

function composeForwardBody(input: EngineInput, analysis: Analysis, settings: Settings): string {
  const store = storeOf(analysis, settings);
  const lines = [
    `送信者：${senderLabel(input.sender)}`,
    `グループ：${input.group.name}`,
    `店舗：${store ? store.name : "（特定できませんでした）"}`,
    `内容：${trimText(input.text) || "（本文なし）"}`,
  ];
  if (input.photoCount > 0) lines.push(`写真：${input.photoCount}枚`);
  lines.push(
    `${judgementLabel(analysis)}：${CATEGORY_LABELS[analysis.category]}・${URGENCY_LABELS[analysis.urgency]}（確信度${Math.round(analysis.confidence * 100)}%）`,
    `判断理由：${analysis.reasoning}`,
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

/** Enabled targets for this urgency; night-only targets only during the night window (Asia/Tokyo). */
export function routeTargets(urgency: Urgency, now: number, settings: Settings): NotifyTarget[] {
  const night = isNight(now, settings.behavior);
  return settings.notifyTargets.filter((t) => t.enabled && t.urgencies.includes(urgency) && (!t.nightOnly || night));
}

/* ------------------------------------------------------------------ */
/* Pattern selection                                                   */
/* ------------------------------------------------------------------ */

type PhotoPreference = "with" | "without" | "ignore";

const usable = (p: ReplyPattern): boolean => p.enabled && p.texts.some((t) => t.trim() !== "");
const isFaqPattern = (p: ReplyPattern): boolean => p.texts.some((t) => t.includes("{answer}"));

const isRoleSpecific = (p: ReplyPattern): boolean => (p.roles?.length ?? 0) > 0;

/**
 * Priority: "night" (at night) > "with_photo"/"without_photo" > "any".
 * Within one condition, a pattern limited to the sender's role beats a pattern for everyone;
 * patterns limited to other roles are never used.
 */
export function choosePattern(
  patterns: readonly ReplyPattern[],
  category: Category,
  opts: { night: boolean; photo: PhotoPreference; faq?: boolean; role?: MemberRole },
): ReplyPattern | undefined {
  const pool = patterns.filter(
    (p) =>
      p.category === category &&
      usable(p) &&
      (opts.faq === undefined || isFaqPattern(p) === opts.faq) &&
      (!isRoleSpecific(p) || (opts.role !== undefined && p.roles!.includes(opts.role))),
  );
  const find = (when: ReplyPattern["when"]) => {
    const matches = pool.filter((p) => (when === "any" ? p.when === undefined || p.when === "any" : p.when === when));
    return matches.find(isRoleSpecific) ?? matches[0];
  };
  if (opts.night) {
    const night = find("night");
    if (night) return night;
  }
  if (opts.photo === "with") {
    const p = find("with_photo");
    if (p) return p;
  } else if (opts.photo === "without") {
    const p = find("without_photo");
    if (p) return p;
  }
  return find("any");
}

const defaultPick = (n: number): number => Math.floor(Math.random() * n);

function safeIndex(i: number, n: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor(i)));
}

/* ------------------------------------------------------------------ */
/* plan()                                                              */
/* ------------------------------------------------------------------ */

/** Reply when a completion report has no photo, photo requests are off and no neutral pattern exists. */
const DONE_FALLBACK_TEXT = "{name}さん、お疲れ様でした！";

/** "山本（コールセンター）" → "山本" so that "{name}さん" reads naturally. */
export function shortName(name: string): string {
  return name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim() || name;
}

function displayName(sender: Member): string {
  return shortName(sender.name);
}

/** Follow-up sentences for the other things a trouble report also mentioned. */
const EXTRA_REPLY: Partial<Record<Category, string>> = {
  leftover: "洗濯物の放置の件も、あわせて担当者に共有しました。",
  machine_error: "機械の不具合の件も、あわせて担当者に伝えました。",
};
const QUESTION_FOLLOW_UP = "ご質問の件も、担当者から折り返しご連絡します。";

export function plan(
  input: EngineInput,
  analysis: Analysis,
  settings: Settings,
  pick: (n: number) => number = defaultPick,
): ActionPlan {
  const notes: string[] = [];

  // Managers talk freely in the groups — the bot never answers or escalates them.
  if (input.sender.role === "manager") {
    return { reply: null, forward: null, createIssue: false, notes: ["管理者の投稿のため、自動返信・転送は行いません"] };
  }

  const { behavior } = settings;
  const night = isNight(input.now, behavior);
  // The night emergency text says 「電話でも呼び出しています」, so it is used only when a phone target is
  // really called for this alert (enabled, for urgent alerts, and night-only targets at night).
  const callsAtNight = night && routeTargets("urgent", input.now, settings).some((t) => t.channel === "phone");
  const hasPhoto = input.photoCount > 0 || analysis.extracted.hasPhoto;
  const store = storeOf(analysis, settings);
  const faq = analysis.category === "question" && analysis.faqId ? settings.faqs.find((f) => f.id === analysis.faqId) : undefined;

  const vars: Record<string, string> = {
    name: displayName(input.sender),
    // Unknown store → "" (renderTemplate then drops 「{store}の」: 「清掃ありがとうございました」).
    store: store?.name ?? "",
    target: composeTarget(analysis, settings),
    time: formatTokyoTime(input.now),
    answer: faq?.answer ?? "",
    machine: analysis.extracted.machine ?? "",
    code: analysis.extracted.errorCode ?? "",
    bot: behavior.botName,
  };

  const render = (pattern: ReplyPattern | undefined): string | null => {
    if (!pattern) return null;
    const texts = pattern.texts.filter((t) => t.trim() !== "");
    if (texts.length === 0) return null;
    const text = renderTemplate(texts[safeIndex(pick(texts.length), texts.length)], vars);
    return text || null;
  };
  const role = input.sender.role;
  const replyFor = (category: Category, photo: PhotoPreference = "ignore", faqPattern?: boolean) =>
    render(choosePattern(settings.replyPatterns, category, { night, photo, faq: faqPattern, role }));

  let reply: string | null = null;
  let forwardUrgency: Urgency | null = null;
  let createIssue = false;
  let storeStatus: ActionPlan["storeStatus"];
  const setStatus = (status: StoreCleaningStatus) => {
    if (store) storeStatus = { storeId: store.id, status };
  };

  switch (analysis.category) {
    case "cleaning_start":
      reply = replyFor("cleaning_start");
      setStatus("cleaning");
      break;

    case "cleaning_done":
      if (hasPhoto) {
        reply = replyFor("cleaning_done", "with");
        setStatus("done");
      } else if (behavior.askPhotoWhenMissing) {
        reply = replyFor("cleaning_done", "without");
        setStatus("awaiting_photo");
        notes.push("完了写真が届いていないため、送付をお願いしました");
      } else {
        const neutral = choosePattern(settings.replyPatterns, "cleaning_done", { night, photo: "ignore", role });
        const wantsReplies = settings.replyPatterns.some((p) => p.category === "cleaning_done" && usable(p));
        reply = neutral ? render(neutral) : wantsReplies ? renderTemplate(DONE_FALLBACK_TEXT, vars) : null;
        setStatus("done");
      }
      break;

    case "leftover":
    case "machine_error":
      reply = replyFor(analysis.category);
      forwardUrgency = analysis.urgency;
      createIssue = true;
      break;

    case "question":
      if (faq) {
        reply = replyFor("question", "ignore", true) ?? (faq.answer.trim() || null);
        notes.push(`よくある質問「${faq.question}」の回答で自動返信`);
      } else {
        reply = replyFor("question", "ignore", false);
        forwardUrgency = maxUrgency(analysis.urgency, "attention");
        createIssue = true;
      }
      break;

    case "info":
      reply = replyFor("info");
      break;

    case "emergency":
      reply = render(choosePattern(settings.replyPatterns, "emergency", { night: callsAtNight, photo: "ignore", role }));
      forwardUrgency = "urgent";
      createIssue = true;
      break;

    case "chat":
      reply = replyFor("chat");
      if (!reply) notes.push("あいさつ・お礼のため、返信は行いません");
      break;

    case "unknown":
    default:
      if (analysis.urgency === "urgent") {
        // Uncertain, but with words that hint at danger: answer like an emergency (no 「少々お待ちください」).
        reply =
          render(choosePattern(settings.replyPatterns, "emergency", { night: callsAtNight, photo: "ignore", role })) ??
          replyFor("unknown");
        notes.push("危険につながる言葉を含むため、緊急として担当者へ知らせました");
      } else {
        reply = replyFor("unknown");
      }
      forwardUrgency = maxUrgency(analysis.urgency, "attention");
      createIssue = true;
      break;
  }

  // A trouble report that also mentions another trouble or asks something: say so in the same reply.
  if (reply && (analysis.category === "leftover" || analysis.category === "machine_error")) {
    const extras = otherTroubles(analysis)
      .map((c) => EXTRA_REPLY[c])
      .filter((t): t is string => Boolean(t));
    if (analysis.secondary.includes("question") && !analysis.faqId) extras.push(QUESTION_FOLLOW_UP);
    if (extras.length > 0) reply = `${reply}\n${extras.join("")}`;
  }

  // A report that also says "清掃完了" / "清掃に入ります": record the store status and greet in the same message.
  // Skipped for 判定保留 (the guess is not trusted) and for emergencies (no "お疲れ様でした" on top of an alarm).
  const primaryIsCleaning = analysis.category === "cleaning_done" || analysis.category === "cleaning_start";
  if (!primaryIsCleaning && analysis.category !== "unknown") {
    let greeting: string | null = null;
    if (analysis.secondary.includes("cleaning_done")) {
      const status: StoreCleaningStatus = hasPhoto || !behavior.askPhotoWhenMissing ? "done" : "awaiting_photo";
      setStatus(status);
      greeting =
        status === "awaiting_photo"
          ? "{name}さん、清掃お疲れ様でした（完了写真もあとで送ってください📷）。"
          : "{name}さん、清掃お疲れ様でした。";
    } else if (analysis.secondary.includes("cleaning_start")) {
      setStatus("cleaning");
      greeting = "{name}さん、お疲れ様です。";
    }
    if (greeting && analysis.category !== "emergency") {
      const prefix = renderTemplate(greeting, vars);
      reply = reply ? `${prefix}\n${reply}` : prefix;
    }
  }

  if (reply === null && analysis.category !== "chat") {
    notes.push("返信パターンが無効のため、自動返信は行いません");
  }

  if (storeStatus && store) {
    notes.push(`${store.name}の清掃状況を「${CLEANING_STATUS_LABELS[storeStatus.status]}」に更新`);
  }

  let forward: ActionPlan["forward"] = null;
  if (forwardUrgency) {
    forward = {
      urgency: forwardUrgency,
      title: composeForwardTitle(analysis, forwardUrgency, settings, input.sender),
      body: composeForwardBody(input, analysis, settings),
    };
    if (routeTargets(forwardUrgency, input.now, settings).some((t) => t.channel === "phone")) {
      notes.push(night ? "夜間のため電話通知も実行" : "電話通知も実行");
    }
  }

  const result: ActionPlan = { reply, forward, createIssue, notes };
  if (storeStatus) result.storeStatus = storeStatus;
  return result;
}
