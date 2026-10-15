/**
 * "Today so far" history shown on first visit: a realistic morning of cleaning reports, two problems
 * that still need attention, and a call-center escalation that was already resolved.
 *
 * Every staff / call-center post goes through the real pipeline (engine + routing), so the seeded chat,
 * analysis log, issues and store board are exactly what the live system would have produced.
 */
import { samplePhotos, type SamplePhotoId } from "@/lib/samples";
import type { ChatMessage, Group, GroupKind, IssueStatus, Member, Photo, Settings } from "@/lib/types";
import { newId as defaultNewId, type IdKind } from "./ids";
import { applyOutcome, processBatch, stampOutcome, type HistoryState, type IdFactory } from "./pipeline";

export type SeedHistory = HistoryState;

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

interface SeedPart {
  text?: string;
  photos?: SamplePhotoId[];
  /** seconds after the previous part (photo first, comment a few seconds later) */
  afterSec?: number;
}

type SeedStep =
  | { kind: "post"; key: string; at: string; group: GroupKind; sender: string; parts: SeedPart[] }
  | { kind: "manager"; at: string; group: GroupKind; text: string }
  | { kind: "issue"; at: string; ref: string; status: IssueStatus; note: string };

/** Times are Asia/Tokyo wall-clock times of a typical day; see `timeline()` for early-morning visits. */
const SCRIPT: readonly SeedStep[] = [
  { kind: "post", key: "start_ekimae", at: "08:31", group: "cleaning", sender: "m_tanaka", parts: [{ text: "おはようございます。駅前店、これから清掃に入ります" }] },
  { kind: "post", key: "start_minami", at: "08:46", group: "cleaning", sender: "m_sato", parts: [{ text: "南町店に到着しました。清掃に入ります" }] },
  { kind: "post", key: "start_midori", at: "09:04", group: "cleaning", sender: "m_suzuki", parts: [{ text: "緑ヶ丘店、清掃開始します" }] },
  { kind: "post", key: "cc_open", at: "09:18", group: "callcenter", sender: "m_yamamoto", parts: [{ text: "【連絡】本日のコールセンター受付を開始しました。よろしくお願いします。" }] },
  {
    // Photo first, comment 4 seconds later → aggregated into ONE report.
    kind: "post",
    key: "done_ekimae",
    at: "09:33",
    group: "cleaning",
    sender: "m_tanaka",
    parts: [{ photos: ["ph_floor_clean"] }, { text: "駅前店、清掃完了しました！", afterSec: 4 }],
  },
  { kind: "post", key: "done_minami", at: "09:51", group: "cleaning", sender: "m_sato", parts: [{ text: "南町店の清掃完了しました", photos: ["ph_floor_clean", "ph_filter"] }] },
  { kind: "post", key: "done_midori", at: "10:07", group: "cleaning", sender: "m_suzuki", parts: [{ text: "緑ヶ丘店、清掃終わりました。乾燥機のフィルターも掃除済みです", photos: ["ph_filter"] }] },
  { kind: "post", key: "cc_changer", at: "10:24", group: "callcenter", sender: "m_yamamoto", parts: [{ text: "南町店のお客様から、両替機に千円札が詰まって戻ってこないと入電がありました。" }] },
  { kind: "manager", at: "10:28", group: "alerts", text: "南町店の両替機の件、近くにいるので今から向かいます。" },
  { kind: "issue", at: "10:28", ref: "cc_changer", status: "in_progress", note: "管理者が現地へ向かっています。" },
  { kind: "post", key: "start_kita", at: "10:42", group: "cleaning", sender: "m_sato", parts: [{ text: "北口店、清掃に入ります" }] },
  { kind: "issue", at: "10:54", ref: "cc_changer", status: "resolved", note: "詰まっていた千円札を取り出し、お客様にお返ししました。" },
  { kind: "post", key: "cc_changer_done", at: "10:58", group: "callcenter", sender: "m_yamamoto", parts: [{ text: "先ほどの南町店の両替機の件、管理者が現地で対応済みです。お客様にもご連絡しました。" }] },
  // Completion without a photo → the bot asks for one → the photo arrives a few minutes later.
  { kind: "post", key: "done_kita", at: "11:16", group: "cleaning", sender: "m_sato", parts: [{ text: "北口店、清掃終わりました" }] },
  { kind: "post", key: "photo_kita", at: "11:21", group: "cleaning", sender: "m_sato", parts: [{ photos: ["ph_floor_clean"] }] },
  { kind: "post", key: "machine_midori", at: "11:47", group: "cleaning", sender: "m_suzuki", parts: [{ text: "緑ヶ丘店の洗濯機1番が途中で止まってしまいました。エラーU13が表示されています" }] },
  { kind: "manager", at: "11:53", group: "alerts", text: "緑ヶ丘店の洗濯機1番、メーカーに修理を依頼しました。明日の午前中に来てもらえるそうです。" },
  { kind: "issue", at: "11:53", ref: "machine_midori", status: "in_progress", note: "メーカーに修理を依頼済み。明日の午前中に訪問予定です。" },
  { kind: "post", key: "start_chuo", at: "12:09", group: "cleaning", sender: "m_tanaka", parts: [{ text: "中央通り店、これから清掃に入ります" }] },
  {
    kind: "post",
    key: "leftover_chuo",
    at: "12:31",
    group: "cleaning",
    sender: "m_tanaka",
    parts: [{ text: "中央通り店、洗濯機4番に洗濯物が入ったままです。昨日の夜からのようです", photos: ["ph_leftover"] }],
  },
  { kind: "post", key: "cc_construction", at: "13:12", group: "callcenter", sender: "m_yamamoto", parts: [{ text: "【連絡】明後日、北口店前の道路で水道工事があります。駐車場が一部使えなくなります。" }] },
  { kind: "post", key: "faq_garbage", at: "14:06", group: "cleaning", sender: "m_suzuki", parts: [{ text: "ゴミ出しは何曜日でしたっけ？" }] },
  { kind: "post", key: "cc_guide", at: "14:41", group: "callcenter", sender: "m_yamamoto", parts: [{ text: "駅前店のお客様から乾燥機の使い方について問い合わせがあり、ご案内しました。念のため共有します。" }] },
];

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Japan has no daylight saving time: Asia/Tokyo is always UTC+9. */
const JST_OFFSET = 9 * HOUR;

/** Nothing is seeded in the last minutes before `now`, so live test messages stand out as 「たった今」. */
const QUIET_BEFORE_NOW = 5 * MINUTE;
/** Room for bot replies after the last scripted step. */
const TAIL = 2 * MINUTE;
/** Minimum window to spread the script over before falling back to "the last hours before now". */
const MIN_WINDOW = 90 * MINUTE;

function clockMinutes(at: string): number {
  const [h, m] = at.split(":").map(Number);
  return h * 60 + m;
}

/** Midnight (Asia/Tokyo) of the day containing `now`, as epoch ms. */
export function tokyoMidnight(now: number): number {
  return Math.floor((now + JST_OFFSET) / DAY) * DAY - JST_OFFSET;
}

/**
 * Maps the scripted wall-clock times onto real instants before `now`:
 *  - later in the day: the script's own times (08:31 – 14:41);
 *  - earlier: the script is compressed into the morning so far (from 08:31, or from 05:00);
 *  - very early (before ~6:30): the script is spread over the last hours before now, which may begin
 *    the previous evening.
 */
function timeline(now: number): (at: string) => number {
  const first = clockMinutes(SCRIPT[0].at);
  const last = Math.max(...SCRIPT.map((s) => clockMinutes(s.at)));
  const span = (last - first) * MINUTE;
  const dayStart = tokyoMidnight(now);
  const end = now - QUIET_BEFORE_NOW - TAIL;

  let from: number;
  let scale: number;
  if (dayStart + last * MINUTE <= end) {
    from = dayStart + first * MINUTE;
    scale = 1;
  } else {
    const morning = [dayStart + first * MINUTE, dayStart + 5 * HOUR].find((t) => end - t >= MIN_WINDOW);
    from = morning ?? end - Math.min(span, 6 * HOUR);
    scale = Math.min(1, (end - from) / span);
  }
  return (at: string) => Math.round(from + (clockMinutes(at) - first) * MINUTE * scale);
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

const PREFERRED_GROUP_IDS: Record<GroupKind, string> = {
  cleaning: "g_cleaning",
  callcenter: "g_call",
  alerts: "g_alerts",
};

function groupOf(settings: Settings, kind: GroupKind): Group | undefined {
  return settings.groups.find((g) => g.id === PREFERRED_GROUP_IDS[kind]) ?? settings.groups.find((g) => g.kind === kind);
}

function managerOf(settings: Settings): Member | undefined {
  return settings.members.find((m) => m.id === "m_owner") ?? settings.members.find((m) => m.role === "manager");
}

export interface SeedOptions {
  newId?: IdFactory;
}

/**
 * Builds today's history (Asia/Tokyo) for the given settings. Call only from store actions or tests
 * (it creates ids). Steps whose group or member no longer exists in `settings` are skipped.
 */
export function buildSeedHistory(settings: Settings, now: number, options: SeedOptions = {}): SeedHistory {
  const newId: IdFactory = options.newId ?? ((kind: IdKind) => defaultNewId(kind));
  const timeOf = timeline(now);
  // Deterministic reply variants: cycle through them instead of picking at random.
  let turn = 0;
  const pick = (n: number): number => turn++ % Math.max(1, n);

  let state: SeedHistory = { messages: [], records: [], issues: [], deliveries: [], storeStatus: {} };
  const recordByKey = new Map<string, string>();

  const photos = (ids: readonly SamplePhotoId[] | undefined): Photo[] =>
    samplePhotos(ids ?? []).map((p) => ({ id: newId("pho"), src: p.src, alt: p.alt }));

  SCRIPT.forEach((step, index) => {
    const at = timeOf(step.at);

    if (step.kind === "manager") {
      const group = groupOf(settings, step.group);
      const manager = managerOf(settings);
      if (!group || !manager) return;
      state = {
        ...state,
        messages: [
          ...state.messages,
          { id: newId("msg"), groupId: group.id, senderId: manager.id, text: step.text, photos: [], createdAt: at },
        ],
      };
      return;
    }

    if (step.kind === "issue") {
      const recordId = recordByKey.get(step.ref);
      if (!recordId) return;
      state = {
        ...state,
        issues: state.issues.map((issue) =>
          issue.analysisId === recordId ? { ...issue, status: step.status, note: step.note, updatedAt: at } : issue,
        ),
      };
      return;
    }

    const group = groupOf(settings, step.group);
    const sender = settings.members.find((m) => m.id === step.sender);
    if (!group || !sender) return;

    let t = at;
    const batch: ChatMessage[] = step.parts.map((part, i) => {
      if (i > 0) t += (part.afterSec ?? 3) * SECOND;
      return {
        id: newId("msg"),
        groupId: group.id,
        senderId: sender.id,
        text: part.text ?? "",
        photos: photos(part.photos),
        createdAt: t,
      };
    });
    state = { ...state, messages: [...state.messages, ...batch] };

    if (sender.role === "manager" || group.kind === "alerts") return;

    const analysedAt = t + SECOND;
    const outcome = processBatch({
      settings,
      group,
      sender,
      messages: batch,
      now: analysedAt,
      storeStatus: state.storeStatus,
      newId,
      pick,
    });
    // The bot answers a few seconds later, like the live simulator.
    state = applyOutcome(state, stampOutcome(outcome, analysedAt + (3 + (index % 4)) * SECOND));
    recordByKey.set(step.key, outcome.record.id);
  });

  const byTime = <T extends { createdAt: number }>(items: T[]): T[] =>
    items.map((item, i) => ({ item, i })).sort((a, b) => a.item.createdAt - b.item.createdAt || a.i - b.i).map((x) => x.item);

  return {
    messages: byTime(state.messages),
    records: byTime(state.records),
    issues: byTime(state.issues),
    deliveries: byTime(state.deliveries),
    storeStatus: state.storeStatus,
  };
}
