/**
 * Daily summary posted to the managers' group (plain text, LINE friendly: no markdown).
 */
import type { AnalysisRecord, Category, Issue, Settings, StoreCleaningStatus, Urgency } from "../types";
import { CATEGORY_LABELS, CATEGORY_ORDER, CLEANING_STATUS_LABELS, ISSUE_STATUS_LABELS } from "../types";
import { URGENCY_RANK } from "./analyze";
import { cleanAlertTitle, shortName } from "./plan";
import { formatTokyoDate, formatTokyoTime, tokyoDateKey, tokyoParts } from "./time";

export interface DailyReportInput {
  records: AnalysisRecord[];
  issues: Issue[];
  storeStatus: Record<string, { status: StoreCleaningStatus; updatedAt: number; memberId?: string }>;
  settings: Settings;
  now: number;
}

/** Maximum number of open issues listed one by one. */
export const REPORT_ISSUE_LIMIT = 10;

const STATUS_ICON: Record<StoreCleaningStatus, string> = {
  done: "✅",
  awaiting_photo: "📷",
  cleaning: "🧹",
  not_started: "⬜",
};

const URGENCY_ICON: Record<Urgency, string> = { urgent: "🚨", attention: "⚠️", normal: "ℹ️" };

function when(ms: number, todayKey: string): string {
  if (tokyoDateKey(ms) === todayKey) return formatTokyoTime(ms);
  const p = tokyoParts(ms);
  return `${p.month}/${p.day} ${formatTokyoTime(ms)}`;
}

const categoryOf = (r: AnalysisRecord): Category => r.correctedCategory ?? r.analysis.category;

export function buildDailyReport(input: DailyReportInput): string {
  const { records, issues, storeStatus, settings, now } = input;
  const todayKey = tokyoDateKey(now);
  const lines: string[] = [];

  lines.push(`📋 日次レポート｜${formatTokyoDate(now)}`);
  lines.push(`${formatTokyoTime(now)} 時点のまとめです。`);

  /* --- cleaning status per store --- */
  const statuses = settings.stores.map((store) => {
    const entry = storeStatus[store.id];
    const current = entry && tokyoDateKey(entry.updatedAt) === todayKey ? entry : undefined;
    return { store, status: current?.status ?? ("not_started" as StoreCleaningStatus), entry: current };
  });
  const doneCount = statuses.filter((s) => s.status === "done").length;
  const awaitingCount = statuses.filter((s) => s.status === "awaiting_photo").length;

  lines.push("");
  if (statuses.length === 0) {
    lines.push("■ 清掃状況");
    lines.push("店舗が登録されていません。");
  } else {
    lines.push(
      `■ 清掃状況（完了 ${doneCount}／${statuses.length}店舗${awaitingCount > 0 ? `・写真待ち ${awaitingCount}店舗` : ""}）`,
    );
    for (const { store, status, entry } of statuses) {
      let detail = "";
      if (entry) {
        const member = entry.memberId ? settings.members.find((m) => m.id === entry.memberId) : undefined;
        detail = `（${formatTokyoTime(entry.updatedAt)}${member ? `・${shortName(member.name)}さん` : ""}）`;
      }
      lines.push(`${STATUS_ICON[status]} ${store.name}：${CLEANING_STATUS_LABELS[status]}${detail}`);
    }
  }

  /* --- message counts --- */
  const today = records.filter((r) => tokyoDateKey(r.createdAt) === todayKey);
  lines.push("");
  lines.push("■ 本日のやりとり");
  if (today.length === 0) {
    lines.push("本日のメッセージはまだありません。");
  } else {
    const replied = today.filter((r) => r.plan.reply !== null).length;
    const forwarded = today.filter((r) => r.plan.forward !== null).length;
    const emergencies = today.filter((r) => categoryOf(r) === "emergency").length;
    const faqAnswers = today.filter((r) => r.analysis.source === "faq" || Boolean(r.analysis.faqId)).length;
    const autoRate = Math.round(((today.length - forwarded) / today.length) * 100);
    lines.push(
      `受信 ${today.length}件／自動返信 ${replied}件／管理者へ転送 ${forwarded}件${emergencies > 0 ? `（うち緊急 ${emergencies}件）` : ""}`,
    );
    lines.push(`自動対応率 ${autoRate}%${faqAnswers > 0 ? `（よくある質問への自動回答 ${faqAnswers}件）` : ""}`);
    const breakdown = CATEGORY_ORDER.map((c) => ({ c, n: today.filter((r) => categoryOf(r) === c).length }))
      .filter(({ n }) => n > 0)
      .map(({ c, n }) => `${CATEGORY_LABELS[c]} ${n}件`);
    lines.push(`内訳：${breakdown.join("、")}`);
  }

  /* --- open issues --- */
  const open = issues
    .filter((i) => i.status !== "resolved")
    .sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || a.createdAt - b.createdAt);
  const resolvedToday = issues.filter((i) => i.status === "resolved" && tokyoDateKey(i.updatedAt) === todayKey).length;

  lines.push("");
  if (open.length === 0) {
    lines.push("■ 対応待ちの案件");
    lines.push(`ありません。すべて対応済みです👍${resolvedToday > 0 ? `（本日対応済み ${resolvedToday}件）` : ""}`);
  } else {
    lines.push(`■ 対応待ちの案件（${open.length}件${resolvedToday > 0 ? `・本日対応済み ${resolvedToday}件` : ""}）`);
    open.slice(0, REPORT_ISSUE_LIMIT).forEach((issue, i) => {
      lines.push(
        `${i + 1}. ${URGENCY_ICON[issue.urgency]} ${ISSUE_STATUS_LABELS[issue.status]}｜${cleanAlertTitle(issue.title)}（${when(issue.createdAt, todayKey)}）`,
      );
      const note = issue.note?.replace(/\s+/g, " ").trim();
      if (note) lines.push(`　メモ：${Array.from(note).length > 40 ? `${Array.from(note).slice(0, 40).join("")}…` : note}`);
    });
    if (open.length > REPORT_ISSUE_LIMIT) lines.push(`…ほか${open.length - REPORT_ISSUE_LIMIT}件`);
  }

  /* --- closing --- */
  lines.push("");
  if (open.some((i) => i.urgency === "urgent")) {
    lines.push("緊急の案件が残っています。対応状況のご確認をお願いします。");
  } else if (statuses.length > 0 && doneCount + awaitingCount < statuses.length) {
    lines.push("清掃の報告がまだの店舗があります。必要に応じてご確認ください。");
  }
  lines.push("本日もお疲れ様でした。明日もよろしくお願いいたします。");

  return lines.join("\n");
}
