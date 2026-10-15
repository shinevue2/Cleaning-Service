/**
 * Validation for 管理画面 › 設定 (staff, stores, notification targets, behaviour).
 * Messages are plain Japanese for the owner. Pure functions, unit-tested.
 */
import { parseClock, tokyoParts } from "@/lib/engine";
import { MAX_AGGREGATE_SECONDS, MAX_REPLY_DELAY_MS } from "@/lib/store";
import type { AnalysisRecord, BehaviorSettings, Group, Member, NotifyChannel, NotifyTarget, Store } from "@/lib/types";
import { cleanWords, wordKey } from "./shared/words";

export const MAX_NAME_LENGTH = 20;

/** LINE ids as shown by the 「#ID」 command in production. */
export const LINE_USER_ID = /^U[0-9a-f]{32}$/;
export const LINE_GROUP_ID = /^C[0-9a-f]{32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** digits, hyphens, + and the demo's masking asterisks */
const PHONE = /^\+?[0-9*][0-9*\-\s()]{5,19}$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function hasErrors(errors: Partial<Record<string, string | undefined>>): boolean {
  return Object.values(errors).some(Boolean);
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export const AVATAR_COLORS: readonly { value: string; label: string }[] = [
  { value: "#f59e0b", label: "オレンジ" },
  { value: "#10b981", label: "グリーン" },
  { value: "#6366f1", label: "インディゴ" },
  { value: "#ec4899", label: "ピンク" },
  { value: "#0ea5e9", label: "スカイ" },
  { value: "#ef4444", label: "レッド" },
  { value: "#8b5cf6", label: "パープル" },
  { value: "#14b8a6", label: "ティール" },
  { value: "#84cc16", label: "ライム" },
  { value: "#64748b", label: "グレー" },
];

/** A colour that is not used yet (falls back to the first one). */
export function nextAvatarColor(members: readonly Pick<Member, "avatarColor">[]): string {
  const used = new Set(members.map((m) => m.avatarColor.toLowerCase()));
  return (AVATAR_COLORS.find((c) => !used.has(c.value)) ?? AVATAR_COLORS[members.length % AVATAR_COLORS.length]).value;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export type MemberField = "name" | "role" | "lineUserId" | "avatarColor";

/** `members` is the saved list (the draft may be new or an edit of one of them). */
export function validateMember(draft: Member, members: readonly Member[]): FieldErrors<MemberField> {
  const errors: FieldErrors<MemberField> = {};
  const name = draft.name.trim();
  if (!name) errors.name = "名前を入力してください。";
  else if (Array.from(name).length > MAX_NAME_LENGTH) errors.name = `名前は${MAX_NAME_LENGTH}文字以内にしてください。`;
  else if (members.some((m) => m.id !== draft.id && m.name.trim() === name)) {
    errors.name = "同じ名前のメンバーがすでに登録されています。";
  }

  const lineUserId = draft.lineUserId?.trim() ?? "";
  if (lineUserId && !LINE_USER_ID.test(lineUserId)) {
    errors.lineUserId = "LINEユーザーIDは「U」で始まる33文字の英数字です（例：U1234…）。わからない場合は空欄のままで大丈夫です。";
  } else if (lineUserId && members.some((m) => m.id !== draft.id && m.lineUserId?.trim() === lineUserId)) {
    errors.lineUserId = "このLINEユーザーIDは、別のメンバーに登録されています。";
  }

  const saved = members.find((m) => m.id === draft.id);
  if (saved?.role === "staff" && draft.role !== "staff" && countRole(members, "staff") <= 1) {
    errors.role = "清掃スタッフが1人もいなくなるため、役割を変更できません。先に別の清掃スタッフを追加してください。";
  }

  if (!isHexColor(draft.avatarColor)) errors.avatarColor = "アイコンの色を選んでください。";
  return errors;
}

/** Saved shape: trimmed name, valid store ids only, empty LINE id removed. */
export function finalizeMember(draft: Member, stores: readonly Store[]): Member {
  const storeIds = new Set(stores.map((s) => s.id));
  const member: Member = {
    ...draft,
    name: draft.name.trim(),
    storeIds: draft.storeIds.filter((id, i, all) => storeIds.has(id) && all.indexOf(id) === i),
  };
  const lineUserId = draft.lineUserId?.trim();
  if (lineUserId) member.lineUserId = lineUserId;
  else delete member.lineUserId;
  return member;
}

function countRole(members: readonly Member[], role: Member["role"]): number {
  return members.filter((m) => m.role === role).length;
}

export type DeleteCheck = { ok: true } | { ok: false; reason: string };

export function canDeleteMember(id: string, members: readonly Member[]): DeleteCheck {
  const member = members.find((m) => m.id === id);
  if (!member) return { ok: false, reason: "このメンバーは見つかりませんでした。" };
  if (members.length <= 1) return { ok: false, reason: "メンバーが1人もいなくなるため削除できません。" };
  if (member.role === "staff" && countRole(members, "staff") <= 1) {
    return { ok: false, reason: "清掃スタッフが1人もいなくなるため削除できません。先に別の清掃スタッフを追加してください。" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Stores                                                              */
/* ------------------------------------------------------------------ */

export type StoreField = "name" | "aliases";

export function validateStore(draft: Store, stores: readonly Store[]): FieldErrors<StoreField> {
  const errors: FieldErrors<StoreField> = {};
  const name = draft.name.trim();
  const others = stores.filter((s) => s.id !== draft.id);
  // A word used by two stores makes the store detection ambiguous.
  const owners = new Map<string, string>();
  for (const s of others) {
    for (const w of [s.name, ...s.aliases]) if (wordKey(w)) owners.set(wordKey(w), s.name);
  }
  const ownerOf = (w: string) => owners.get(wordKey(w));

  if (!name) errors.name = "店舗名を入力してください。";
  else if (Array.from(name).length > MAX_NAME_LENGTH) errors.name = `店舗名は${MAX_NAME_LENGTH}文字以内にしてください。`;
  else if (others.some((s) => wordKey(s.name) === wordKey(name))) errors.name = "同じ名前の店舗がすでに登録されています。";
  else if (ownerOf(name)) errors.name = `「${name}」は「${ownerOf(name)}」の呼び方として登録されています。`;

  const clash = cleanWords(draft.aliases).find((a) => ownerOf(a));
  if (clash) {
    errors.aliases = `「${clash}」は「${ownerOf(clash)}」の名前または呼び方として登録されています。店舗を見分けられなくなるため、別の言葉にしてください。`;
  }
  return errors;
}

export function finalizeStore(draft: Store): Store {
  const name = draft.name.trim();
  return { ...draft, name, aliases: cleanWords(draft.aliases).filter((a) => wordKey(a) !== wordKey(name)) };
}

export function canDeleteStore(id: string, stores: readonly Store[]): DeleteCheck {
  if (!stores.some((s) => s.id === id)) return { ok: false, reason: "この店舗は見つかりませんでした。" };
  if (stores.length <= 1) return { ok: false, reason: "店舗が1つもなくなるため削除できません。" };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Notification targets                                                */
/* ------------------------------------------------------------------ */

export const CHANNEL_ADDRESS: Record<NotifyChannel, { label: string; placeholder: string; hint: string }> = {
  line_group: {
    label: "通知するグループ",
    placeholder: "",
    hint: "管理者のみが参加しているグループを選んでください。",
  },
  email: {
    label: "メールアドレス",
    placeholder: "例：owner@example.com",
    hint: "デモでは実際には送信せず、送信記録だけを残します。",
  },
  chatwork: {
    label: "ChatworkのルームID",
    placeholder: "例：rid:123456789",
    hint: "通知を投稿するチャットのURLの「rid」以降の番号です。",
  },
  phone: {
    label: "電話番号",
    placeholder: "例：090-1234-5678",
    hint: "自動音声で呼び出します。デモでは実際には発信しません。",
  },
};

export type TargetField = "name" | "address" | "urgencies";

/** Full-width digits and the many dash look-alikes Japanese keyboards produce → "090-1234-5678". */
export function normalizePhone(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−ーｰ]/g, "-")
    .trim();
}

export function validateTarget(draft: NotifyTarget, groups: readonly Group[]): FieldErrors<TargetField> {
  const errors: FieldErrors<TargetField> = {};
  const name = draft.name.trim();
  if (!name) errors.name = "通知先の名前を入力してください。";
  else if (Array.from(name).length > 30) errors.name = "通知先の名前は30文字以内にしてください。";

  const address = draft.address.trim();
  switch (draft.channel) {
    case "line_group":
      if (!address) errors.address = "通知するグループを選んでください。";
      else if (!groups.some((g) => g.id === address || g.lineGroupId === address) && !LINE_GROUP_ID.test(address)) {
        errors.address = "LINEのグループIDは「C」で始まる33文字の英数字です。";
      }
      break;
    case "email":
      if (!address) errors.address = "メールアドレスを入力してください。";
      else if (!EMAIL.test(address)) errors.address = "メールアドレスの形式が正しくありません（例：owner@example.com）。";
      break;
    case "chatwork":
      if (!address) errors.address = "ChatworkのルームIDを入力してください。";
      else if (!/^(rid:?)?\d{1,15}$/i.test(address.replace(/\s/g, ""))) {
        errors.address = "ルームIDは数字で入力してください（例：rid:123456789）。";
      }
      break;
    case "phone": {
      const phone = normalizePhone(address);
      if (!phone) errors.address = "電話番号を入力してください。";
      else if (!PHONE.test(phone)) errors.address = "電話番号は数字とハイフンで入力してください（例：090-1234-5678）。";
      break;
    }
    default:
      break;
  }
  if (draft.urgencies.length === 0) errors.urgencies = "通知する緊急度を1つ以上選んでください。";
  return errors;
}

export function finalizeTarget(draft: NotifyTarget): NotifyTarget {
  const order = ["urgent", "attention", "normal"] as const;
  const address = draft.channel === "phone" ? normalizePhone(draft.address) : draft.address.trim();
  return {
    ...draft,
    name: draft.name.trim(),
    address,
    urgencies: order.filter((u) => draft.urgencies.includes(u)),
  };
}

/** Alerts posted into a staff group would be seen by everyone (and loop in production). */
export function targetWarning(draft: NotifyTarget, groups: readonly Group[]): string | null {
  if (draft.channel !== "line_group") return null;
  const group = groups.find((g) => g.id === draft.address || g.lineGroupId === draft.address);
  if (group && group.kind !== "alerts") {
    return `「${group.name}」はスタッフが参加しているグループです。通知はスタッフ全員に見えてしまいます。管理者グループを選ぶことをおすすめします。`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

export type BehaviorField = keyof BehaviorSettings;

export function validateBehavior(b: BehaviorSettings): FieldErrors<BehaviorField> {
  const errors: FieldErrors<BehaviorField> = {};
  const botName = b.botName.trim();
  if (!botName) errors.botName = "アシスタントの名前を入力してください。";
  else if (Array.from(botName).length > MAX_NAME_LENGTH) errors.botName = `名前は${MAX_NAME_LENGTH}文字以内にしてください。`;
  if (!Number.isFinite(b.aggregateSeconds) || b.aggregateSeconds < 0 || b.aggregateSeconds > MAX_AGGREGATE_SECONDS) {
    errors.aggregateSeconds = `0〜${MAX_AGGREGATE_SECONDS}秒の範囲で入力してください。`;
  }
  if (!Number.isFinite(b.confidenceThreshold) || b.confidenceThreshold < 0 || b.confidenceThreshold > 1) {
    errors.confidenceThreshold = "0〜100%の範囲で設定してください。";
  }
  if (parseClock(b.nightStart) === null) errors.nightStart = "時刻を「22:00」の形で入力してください。";
  if (parseClock(b.nightEnd) === null) errors.nightEnd = "時刻を「8:00」の形で入力してください。";
  if (!Number.isFinite(b.replyDelayMs) || b.replyDelayMs < 0 || b.replyDelayMs > MAX_REPLY_DELAY_MS) {
    errors.replyDelayMs = `0〜${MAX_REPLY_DELAY_MS / 1000}秒の範囲で入力してください。`;
  }
  if (parseClock(b.dailyReportTime) === null) errors.dailyReportTime = "時刻を「21:00」の形で入力してください。";
  return errors;
}

/** "22:00" / "8:00" / "2200" → "22:00" / "08:00" (the format of <input type="time">). */
export function toTimeInput(value: string): string {
  const minutes = parseClock(value);
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 「22:00〜翌8:00」 / 「12:00〜16:00」 / null when night mode is off. */
export function nightRangeLabel(b: Pick<BehaviorSettings, "nightStart" | "nightEnd">): string | null {
  const start = parseClock(b.nightStart);
  const end = parseClock(b.nightEnd);
  if (start === null || end === null || start === end) return null;
  const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(start)}〜${end < start ? "翌" : ""}${fmt(end)}`;
}

/**
 * How many past judgements would have been 判定保留 with `threshold` — makes the slider tangible.
 * Emergencies never count (they are never held). Messages nothing matched at all (`unclear`) are
 * 判定保留 whatever the threshold, so they are counted separately — the logs show them too.
 */
export function estimateHeld(
  records: readonly Pick<AnalysisRecord, "analysis">[],
  threshold: number,
): { total: number; held: number; unclear: number } {
  const noClue = ({ analysis: a }: Pick<AnalysisRecord, "analysis">) => a.source === "fallback" && a.secondary.length === 0;
  const eligible = records.filter((r) => r.analysis.category !== "emergency" && !noClue(r));
  return {
    total: eligible.length,
    held: eligible.filter((r) => r.analysis.confidence < threshold).length,
    unclear: records.filter(noClue).length,
  };
}

export function sameBehavior(a: BehaviorSettings, b: BehaviorSettings): boolean {
  return (Object.keys(a) as (keyof BehaviorSettings)[]).every((k) => a[k] === b[k]);
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/** laundry-settings-20261014-1530.json (Asia/Tokyo). Call from an event handler. */
export function settingsFileName(now: number): string {
  const p = tokyoParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `laundry-settings-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}.json`;
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
