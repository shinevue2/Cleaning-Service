import type { SampleScenarioId } from "@/lib/samples";
import type { Category, Urgency } from "@/lib/types";

/**
 * Deep links into the simulator. The ids are FIXED by CONTRACT §4.4 (SAMPLE_SCENARIOS)
 * and read by /demo via `?scenario=<id>`. Type-only import: the landing page stays free of the
 * sample photo data. __tests__/scenarios.test.ts checks the copy below against the real scenarios.
 */
export type ScenarioId = SampleScenarioId;

export function scenarioHref(id: ScenarioId): string {
  return `/demo?scenario=${id}`;
}

export interface GuideStep {
  scenario: ScenarioId;
  title: string;
  sender: string;
  text: string;
  /** number of sample photos attached to the post */
  photos: number;
  category: Category;
  urgency: Urgency;
  /** what the owner should see happen */
  result: string;
}

/** The 3-minute guide on the landing page, in the order the owner should try them. */
export const GUIDE_STEPS: GuideStep[] = [
  {
    scenario: "sc_start",
    title: "清掃開始の連絡",
    sender: "田中（清掃スタッフ）",
    text: "駅前店、これから清掃に入ります",
    photos: 0,
    category: "cleaning_start",
    urgency: "normal",
    result: "「よろしくお願いします！」と自動で返信し、駅前店の状況を「清掃中」にします。",
  },
  {
    scenario: "sc_done_photo",
    title: "写真つきの完了報告",
    sender: "田中（清掃スタッフ）",
    text: "駅前店の清掃完了しました！",
    photos: 1,
    category: "cleaning_done",
    urgency: "normal",
    result: "「お疲れ様でした」と返信し、店舗の清掃状況を「完了」にします。写真とコメントが別々に届いても、ひとつの報告として扱います。",
  },
  {
    scenario: "sc_leftover",
    title: "洗濯物の放置",
    sender: "佐藤（清掃スタッフ）",
    text: "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです",
    photos: 1,
    category: "leftover",
    urgency: "attention",
    result: "スタッフにお礼を返したうえで管理者グループへ転送し、要対応リストにも登録します。",
  },
  {
    scenario: "sc_faq",
    title: "よくある質問への自動回答",
    sender: "鈴木（清掃スタッフ）",
    text: "洗剤の補充はどこにありますか？",
    photos: 0,
    category: "question",
    urgency: "normal",
    result: "登録済みの回答をそのまま返信します。登録のない質問には答えず、管理者へ回します。",
  },
  {
    scenario: "sc_emergency",
    title: "緊急トラブル",
    sender: "田中（清掃スタッフ）",
    text: "駅前店、洗濯機の下から水漏れしていて床が水浸しです！",
    photos: 0,
    category: "emergency",
    urgency: "urgent",
    result: "待ち時間なしで判定し、管理者グループとメールへ緊急通知します。夜間は電話でも呼び出します。",
  },
];

export interface ExtraScenario {
  scenario: ScenarioId;
  label: string;
  category: Category;
}

/** Additional one-tap examples shown as chips under the guide. */
export const EXTRA_SCENARIOS: ExtraScenario[] = [
  { scenario: "sc_done_nophoto", label: "写真なしの完了報告", category: "cleaning_done" },
  { scenario: "sc_machine", label: "乾燥機のエラー", category: "machine_error" },
  { scenario: "sc_question", label: "回答が登録されていない質問", category: "question" },
  { scenario: "cc_info", label: "コールセンターからの連絡", category: "info" },
  { scenario: "cc_machine_refund", label: "お客様からの返金依頼", category: "machine_error" },
  { scenario: "cc_emergency_smell", label: "焦げ臭いにおいの入電", category: "emergency" },
];
