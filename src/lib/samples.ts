/**
 * Sample photos and one-tap test scenarios for the LINE simulator.
 *
 * The photos are small inline SVG illustrations (no network, no binary assets) so they work offline,
 * are tiny in localStorage and look the same on every device.
 * Scenario ids are FIXED by CONTRACT §4.4 — the landing page deep-links to `/demo?scenario=<id>`.
 */
import type { Category, Photo, Urgency } from "./types";

/* ------------------------------------------------------------------ */
/* Sample photos                                                       */
/* ------------------------------------------------------------------ */

export type SamplePhotoId =
  | "ph_floor_clean"
  | "ph_dryer_e21"
  | "ph_leftover"
  | "ph_changer"
  | "ph_filter"
  | "ph_water_leak";

export interface SamplePhoto extends Photo {
  id: SamplePhotoId;
  /** short label for the photo picker */
  label: string;
}

function svgDataUrl(svg: string): string {
  const compact = svg.replace(/\s*\n\s*/g, " ").replace(/>\s+</g, "><").trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(compact)}`;
}

/** Four-point sparkle centred on (0,0), radius r. */
function sparkle(x: number, y: number, r: number, color: string): string {
  const k = r * 0.18;
  return `<path transform="translate(${x} ${y})" fill="${color}" d="M0 ${-r}C${k} ${-k} ${k} ${-k} ${r} 0C${k} ${k} ${k} ${k} 0 ${r}C${-k} ${k} ${-k} ${k} ${-r} 0C${-k} ${-k} ${-k} ${-k} 0 ${-r}Z"/>`;
}

/** Front-loading washer, 96×128, top-left at (x,y). */
function washer(x: number, y: number, number: string, glass = "#1e3a5f"): string {
  return `<g transform="translate(${x} ${y})">
    <rect width="96" height="128" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
    <path d="M1.5 24V11.5A10 10 0 0 1 11.5 1.5h73a10 10 0 0 1 10 10V24z" fill="#e2e8f0"/>
    <rect x="10" y="7" width="26" height="11" rx="2" fill="#0f766e"/>
    <circle cx="72" cy="12.5" r="4" fill="#f59e0b"/><circle cx="84" cy="12.5" r="4" fill="#94a3b8"/>
    <circle cx="48" cy="76" r="34" fill="#cbd5e1"/><circle cx="48" cy="76" r="26" fill="${glass}"/>
    <path d="M33 64a20 20 0 0 1 18-10" stroke="#93c5fd" stroke-width="4" fill="none" stroke-linecap="round"/>
    <rect x="6" y="108" width="20" height="14" rx="3" fill="#0f766e"/>
    <text x="16" y="119" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${number}</text>
  </g>`;
}

const FLOOR_CLEAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect width="400" height="300" fill="#dbeafe"/>
  <rect y="0" width="400" height="26" fill="#bfdbfe"/>
  <rect x="300" y="38" width="76" height="54" rx="6" fill="#eff6ff" stroke="#93c5fd" stroke-width="3"/>
  <path d="M338 38v54M300 65h76" stroke="#93c5fd" stroke-width="3"/>
  <rect y="196" width="400" height="104" fill="#e6f4f1"/>
  <path d="M0 222h400M0 254h400M0 290h400" stroke="#cfe7e1" stroke-width="2"/>
  <path d="M70 196L30 300M150 196L130 300M230 196L230 300M310 196L330 300M390 196L430 300" stroke="#cfe7e1" stroke-width="2"/>
  ${washer(24, 66, "1")}${washer(132, 66, "2")}
  <rect x="244" y="104" width="44" height="92" rx="6" fill="#cbd5e1"/>
  <rect x="250" y="112" width="32" height="40" rx="4" fill="#f8fafc"/>
  <path d="M60 238l46-12M196 270l64-16M300 232l40-10" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.95"/>
  ${sparkle(118, 236, 13, "#14b8a6")}${sparkle(262, 252, 10, "#f59e0b")}${sparkle(352, 228, 15, "#14b8a6")}${sparkle(40, 270, 9, "#f59e0b")}
  <g transform="translate(318 150)">
    <rect x="0" y="8" width="44" height="40" rx="6" fill="#0ea5e9"/>
    <path d="M6 8c0-14 32-14 32 0" stroke="#0369a1" stroke-width="4" fill="none"/>
    <rect x="18" y="-60" width="6" height="74" rx="3" fill="#a16207"/>
  </g>
</svg>`;

const DRYER_E21 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect width="400" height="300" fill="#e2e8f0"/>
  <rect x="0" y="0" width="400" height="128" fill="#cbd5e1"/>
  <rect x="16" y="14" width="40" height="30" rx="6" fill="#0f766e"/>
  <text x="36" y="36" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">3</text>
  <rect x="40" y="60" width="54" height="46" rx="8" fill="#94a3b8"/>
  <rect x="61" y="68" width="12" height="30" rx="4" fill="#475569"/>
  <rect x="118" y="34" width="164" height="78" rx="10" fill="#111827" stroke="#475569" stroke-width="4"/>
  <text x="200" y="92" font-family="'Courier New', Courier, monospace" font-size="54" font-weight="700" fill="#ef4444" text-anchor="middle" opacity="0.35" transform="translate(2 2)">E21</text>
  <text x="200" y="92" font-family="'Courier New', Courier, monospace" font-size="54" font-weight="700" fill="#f87171" text-anchor="middle">E21</text>
  <circle cx="318" cy="58" r="12" fill="#f59e0b"/><circle cx="352" cy="58" r="12" fill="#22c55e"/>
  <rect x="306" y="84" width="58" height="16" rx="8" fill="#94a3b8"/>
  <g transform="translate(300 128)">
    <path d="M30 4L58 54H2Z" fill="#facc15" stroke="#a16207" stroke-width="3" stroke-linejoin="round"/>
    <rect x="27.5" y="20" width="5" height="18" rx="2" fill="#713f12"/><circle cx="30" cy="45" r="3" fill="#713f12"/>
  </g>
  <circle cx="190" cy="262" r="112" fill="#cbd5e1" stroke="#94a3b8" stroke-width="4"/>
  <circle cx="190" cy="262" r="88" fill="#1f2937"/>
  <path d="M130 230a68 68 0 0 1 52-44" stroke="#64748b" stroke-width="8" fill="none" stroke-linecap="round"/>
</svg>`;

const LEFTOVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect width="400" height="300" fill="#f1f5f9"/>
  <rect y="236" width="400" height="64" fill="#e2e8f0"/>
  <path d="M0 262h400" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="110" y="48" width="170" height="190" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
  <path d="M111.5 86V61.5a12 12 0 0 1 12-12h143a12 12 0 0 1 12 12V86z" fill="#e2e8f0"/>
  <rect x="124" y="58" width="36" height="16" rx="3" fill="#0f766e"/>
  <rect x="244" y="208" width="26" height="20" rx="4" fill="#0f766e"/>
  <text x="257" y="223" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">4</text>
  <circle cx="195" cy="150" r="56" fill="#94a3b8"/>
  <circle cx="195" cy="150" r="46" fill="#334155"/>
  <ellipse cx="178" cy="160" rx="24" ry="16" fill="#f472b6"/>
  <ellipse cx="210" cy="140" rx="22" ry="15" fill="#60a5fa"/>
  <ellipse cx="200" cy="170" rx="20" ry="11" fill="#facc15"/>
  <ellipse cx="186" cy="134" rx="15" ry="10" fill="#a78bfa"/>
  <path d="M168 176c-6 18-2 40 6 56l18-4c-6-14-6-30-2-44z" fill="#f472b6"/>
  <ellipse cx="300" cy="150" rx="20" ry="54" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>
  <path d="M30 236l14-62h86l14 62z" fill="#d97706"/>
  <path d="M44 174h86" stroke="#b45309" stroke-width="5"/>
  <path d="M48 200h78M42 220h90" stroke="#b45309" stroke-width="3" opacity="0.6"/>
  <ellipse cx="66" cy="170" rx="24" ry="13" fill="#34d399"/>
  <ellipse cx="104" cy="166" rx="26" ry="14" fill="#f87171"/>
  <ellipse cx="86" cy="156" rx="20" ry="11" fill="#93c5fd"/>
  <g transform="translate(300 40)">
    <rect width="78" height="62" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="3"/>
    <rect y="0" width="78" height="16" rx="6" fill="#f59e0b"/>
    <path d="M18 30h42M18 42h30" stroke="#b45309" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`;

const CHANGER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect width="400" height="300" fill="#ecfeff"/>
  <rect y="270" width="400" height="30" fill="#cbd5e1"/>
  <rect x="122" y="24" width="156" height="252" rx="14" fill="#0f766e"/>
  <rect x="122" y="24" width="156" height="44" rx="14" fill="#115e59"/>
  <rect x="122" y="54" width="156" height="14" fill="#115e59"/>
  <text x="200" y="55" font-family="'Hiragino Sans', 'Yu Gothic', Meiryo, 'Noto Sans JP', sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">両替機</text>
  <rect x="146" y="82" width="108" height="34" rx="6" fill="#ccfbf1"/>
  <text x="200" y="107" font-family="'Courier New', Courier, monospace" font-size="22" font-weight="700" fill="#134e4a" text-anchor="middle">¥1000</text>
  <rect x="156" y="132" width="88" height="16" rx="8" fill="#042f2e"/>
  <circle cx="258" cy="140" r="6" fill="#4ade80"/>
  <path d="M164 160h72" stroke="#5eead4" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  <circle cx="170" cy="182" r="9" fill="#fbbf24"/><circle cx="200" cy="182" r="9" fill="#e2e8f0"/><circle cx="230" cy="182" r="9" fill="#fb923c"/>
  <rect x="160" y="204" width="80" height="48" rx="8" fill="#134e4a"/>
  <ellipse cx="184" cy="240" rx="12" ry="5" fill="#fbbf24"/><ellipse cx="204" cy="236" rx="12" ry="5" fill="#cbd5e1"/><ellipse cx="220" cy="242" rx="12" ry="5" fill="#fbbf24"/>
  <g transform="translate(36 70)">
    <circle cx="30" cy="30" r="28" fill="#fbbf24" stroke="#d97706" stroke-width="4"/>
    <text x="30" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#92400e" text-anchor="middle">¥</text>
  </g>
  <g transform="translate(306 120)">
    <rect width="64" height="36" rx="4" fill="#bbf7d0" stroke="#16a34a" stroke-width="3"/>
    <circle cx="32" cy="18" r="9" fill="none" stroke="#16a34a" stroke-width="3"/>
  </g>
</svg>`;

const FILTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <pattern id="mesh" width="9" height="9" patternUnits="userSpaceOnUse">
      <path d="M0 0h9M0 0v9" stroke="#94a3b8" stroke-width="1.2"/>
    </pattern>
  </defs>
  <rect width="400" height="300" fill="#f0fdfa"/>
  <rect x="112" y="30" width="176" height="244" rx="18" fill="#e2e8f0" stroke="#64748b" stroke-width="4"/>
  <rect x="166" y="38" width="68" height="16" rx="8" fill="#64748b"/>
  <rect x="132" y="66" width="136" height="190" rx="10" fill="#f8fafc"/>
  <rect x="132" y="66" width="136" height="190" rx="10" fill="url(#mesh)"/>
  <path d="M150 230l100-140" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
  ${sparkle(310, 80, 16, "#14b8a6")}${sparkle(84, 120, 12, "#f59e0b")}${sparkle(320, 214, 11, "#f59e0b")}${sparkle(76, 230, 15, "#14b8a6")}
  <g transform="translate(298 128)">
    <circle cx="26" cy="26" r="24" fill="#14b8a6"/>
    <path d="M14 27l8 8 16-17" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const WATER_LEAK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect width="400" height="300" fill="#f1f5f9"/>
  <rect y="206" width="400" height="94" fill="#e2e8f0"/>
  ${washer(152, 76, "2")}
  <ellipse cx="200" cy="246" rx="170" ry="34" fill="#60a5fa" opacity="0.55"/>
  <ellipse cx="190" cy="240" rx="120" ry="22" fill="#3b82f6" opacity="0.45"/>
  <ellipse cx="320" cy="270" rx="46" ry="12" fill="#60a5fa" opacity="0.5"/>
  <path d="M150 226c20-6 40 6 60 0s40-6 60 0" stroke="#dbeafe" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M182 210c0 8-6 12-6 18a6 6 0 0 0 12 0c0-6-6-10-6-18z" fill="#2563eb"/>
  <path d="M226 214c0 6-5 9-5 14a5 5 0 0 0 10 0c0-5-5-8-5-14z" fill="#2563eb"/>
  <g transform="translate(40 128)">
    <path d="M32 0L64 58H0Z" fill="#facc15" stroke="#a16207" stroke-width="3" stroke-linejoin="round"/>
    <rect x="29.5" y="18" width="5" height="22" rx="2" fill="#713f12"/><circle cx="32" cy="48" r="3.2" fill="#713f12"/>
  </g>
</svg>`;

export const SAMPLE_PHOTOS: readonly SamplePhoto[] = [
  { id: "ph_floor_clean", label: "清掃後の床", alt: "清掃を終えたあとの店内の床（サンプル写真）", src: svgDataUrl(FLOOR_CLEAN) },
  { id: "ph_dryer_e21", label: "乾燥機のエラー表示", alt: "乾燥機3番の表示パネルにエラー「E21」が出ている様子（サンプル写真）", src: svgDataUrl(DRYER_E21) },
  { id: "ph_leftover", label: "放置された洗濯物", alt: "洗濯機4番に残されたままの洗濯物（サンプル写真）", src: svgDataUrl(LEFTOVER) },
  { id: "ph_changer", label: "両替機", alt: "店内の両替機（サンプル写真）", src: svgDataUrl(CHANGER) },
  { id: "ph_filter", label: "乾燥機のフィルター", alt: "掃除を終えた乾燥機のフィルター（サンプル写真）", src: svgDataUrl(FILTER) },
  { id: "ph_water_leak", label: "床の水漏れ", alt: "洗濯機の下から床に水が広がっている様子（サンプル写真）", src: svgDataUrl(WATER_LEAK) },
];

export function getSamplePhoto(id: string): SamplePhoto | undefined {
  return SAMPLE_PHOTOS.find((p) => p.id === id);
}

/** Sample photos for a list of ids, in order; unknown ids are skipped. */
export function samplePhotos(ids: readonly string[]): SamplePhoto[] {
  return ids.map(getSamplePhoto).filter((p): p is SamplePhoto => p !== undefined);
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

export const SAMPLE_SCENARIO_IDS = [
  "sc_start",
  "sc_done_photo",
  "sc_done_nophoto",
  "sc_leftover",
  "sc_machine",
  "sc_faq",
  "sc_question",
  "sc_emergency",
  "cc_info",
  "cc_machine_refund",
  "cc_emergency_smell",
  "cc_thanks",
] as const;

export type SampleScenarioId = (typeof SAMPLE_SCENARIO_IDS)[number];

export interface SampleScenario {
  id: SampleScenarioId;
  groupId: string;
  senderId: string;
  /** short chip label */
  label: string;
  text: string;
  photoIds: SamplePhotoId[];
  /** category the assistant is expected to choose */
  expect: Category;
  expectUrgency: Urgency;
  /** what the assistant will do — one plain sentence for the owner */
  hint: string;
}

export const SAMPLE_SCENARIOS: readonly SampleScenario[] = [
  {
    id: "sc_start",
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    label: "清掃開始",
    text: "駅前店、これから清掃に入ります",
    photoIds: [],
    expect: "cleaning_start",
    expectUrgency: "normal",
    hint: "「よろしくお願いします」と返信し、駅前店の状況を「清掃中」にします。",
  },
  {
    id: "sc_done_photo",
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    label: "完了報告（写真あり）",
    text: "駅前店の清掃完了しました！",
    photoIds: ["ph_floor_clean"],
    expect: "cleaning_done",
    expectUrgency: "normal",
    hint: "「お疲れ様でした」と返信し、駅前店の状況を「完了」にします。",
  },
  {
    id: "sc_done_nophoto",
    groupId: "g_cleaning",
    senderId: "m_sato",
    label: "完了報告（写真なし）",
    text: "南町店、清掃終わりました",
    photoIds: [],
    expect: "cleaning_done",
    expectUrgency: "normal",
    hint: "完了写真の送付をお願いし、南町店を「写真待ち」として記録します。",
  },
  {
    id: "sc_leftover",
    groupId: "g_cleaning",
    senderId: "m_sato",
    label: "洗濯物の放置",
    text: "北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです",
    photoIds: ["ph_leftover"],
    expect: "leftover",
    expectUrgency: "attention",
    hint: "担当者に共有したことを返信し、管理者グループへ転送して要対応リストに登録します。",
  },
  {
    id: "sc_machine",
    groupId: "g_cleaning",
    senderId: "m_suzuki",
    label: "乾燥機のエラー",
    text: "緑ヶ丘店の乾燥機3番がE21エラーで止まっています",
    photoIds: ["ph_dryer_e21"],
    expect: "machine_error",
    expectUrgency: "attention",
    hint: "「使用中止」の貼り紙をお願いし、管理者グループへ転送します。",
  },
  {
    id: "sc_faq",
    groupId: "g_cleaning",
    senderId: "m_suzuki",
    label: "よくある質問",
    text: "洗剤の補充はどこにありますか？",
    photoIds: [],
    expect: "question",
    expectUrgency: "normal",
    hint: "登録済みの回答で自動返信します。管理者への転送はしません。",
  },
  {
    id: "sc_question",
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    label: "登録のない質問",
    text: "中央通り店の自販機の釣り銭切れ、どうすればいいですか？",
    photoIds: [],
    expect: "question",
    expectUrgency: "attention",
    hint: "回答が登録されていないため、推測では答えずに管理者へ回します。",
  },
  {
    id: "sc_emergency",
    groupId: "g_cleaning",
    senderId: "m_tanaka",
    label: "緊急：水漏れ",
    text: "駅前店、洗濯機の下から水漏れしていて床が水浸しです！",
    photoIds: [],
    expect: "emergency",
    expectUrgency: "urgent",
    hint: "待ち時間なしで判定し、管理者グループとメールへ緊急通知します。",
  },
  {
    id: "cc_info",
    groupId: "g_call",
    senderId: "m_yamamoto",
    label: "点検のお知らせ",
    text: "【連絡】明日10時から中央通り店で業者の定期点検が入ります。",
    photoIds: [],
    expect: "info",
    expectUrgency: "normal",
    hint: "「承知しました」と返信します。",
  },
  {
    id: "cc_machine_refund",
    groupId: "g_call",
    senderId: "m_yamamoto",
    label: "返金の入電",
    text: "南町店のお客様から、乾燥機が回らないので返金してほしいと入電がありました。",
    photoIds: [],
    expect: "machine_error",
    expectUrgency: "attention",
    hint: "返金の申し出として管理者グループへ転送し、要対応リストに登録します。",
  },
  {
    id: "cc_emergency_smell",
    groupId: "g_call",
    senderId: "m_yamamoto",
    label: "緊急：焦げ臭いにおい",
    text: "北口店で焦げ臭いにおいがするとお客様から連絡がありました。至急確認お願いします。",
    photoIds: [],
    expect: "emergency",
    expectUrgency: "urgent",
    hint: "緊急トラブルとして、すぐに管理者グループとメールへ通知します。",
  },
  {
    id: "cc_thanks",
    groupId: "g_call",
    senderId: "m_yamamoto",
    label: "終業の連絡",
    text: "本日の入電は以上です。ありがとうございました。",
    photoIds: [],
    expect: "info",
    expectUrgency: "normal",
    hint: "「承知しました」と返信します。対応が必要な内容ではないため、転送はしません。",
  },
];

export function isSampleScenarioId(value: unknown): value is SampleScenarioId {
  return typeof value === "string" && (SAMPLE_SCENARIO_IDS as readonly string[]).includes(value);
}

export function getScenario(id: string | null | undefined): SampleScenario | undefined {
  return id ? SAMPLE_SCENARIOS.find((s) => s.id === id) : undefined;
}

/** Scenarios that are posted into the given group (for the simulator's chips). */
export function scenariosForGroup(groupId: string): SampleScenario[] {
  return SAMPLE_SCENARIOS.filter((s) => s.groupId === groupId);
}

/** The sample photos attached by a scenario. */
export function scenarioPhotos(scenario: SampleScenario): SamplePhoto[] {
  return samplePhotos(scenario.photoIds);
}
