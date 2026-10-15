/**
 * Default settings for the demo. Production would load the same shape
 * from Google Sheets or a database; the admin screens edit this shape.
 */
import type {
  BehaviorSettings,
  FaqEntry,
  Group,
  KeywordRule,
  Member,
  NotifyTarget,
  ReplyPattern,
  Settings,
  Store,
} from "./types";

export const BOT_ID = "bot";

export const DEFAULT_STORES: Store[] = [
  { id: "s_ekimae", name: "駅前店", aliases: ["駅前", "えきまえ"] },
  { id: "s_chuo", name: "中央通り店", aliases: ["中央通り", "中央店"] },
  { id: "s_minami", name: "南町店", aliases: ["南町", "みなみまち"] },
  { id: "s_kita", name: "北口店", aliases: ["北口", "きたぐち"] },
  { id: "s_midori", name: "緑ヶ丘店", aliases: ["緑ヶ丘", "緑が丘", "緑ケ丘", "みどりがおか"] },
];

export const DEFAULT_MEMBERS: Member[] = [
  { id: "m_tanaka", name: "田中", role: "staff", storeIds: ["s_ekimae", "s_chuo"], avatarColor: "#f59e0b" },
  { id: "m_sato", name: "佐藤", role: "staff", storeIds: ["s_minami", "s_kita"], avatarColor: "#10b981" },
  { id: "m_suzuki", name: "鈴木", role: "staff", storeIds: ["s_midori"], avatarColor: "#6366f1" },
  { id: "m_yamamoto", name: "山本（コールセンター）", role: "callcenter", storeIds: [], avatarColor: "#ec4899" },
  { id: "m_owner", name: "管理者", role: "manager", storeIds: [], avatarColor: "#0ea5e9" },
];

export const DEFAULT_GROUPS: Group[] = [
  { id: "g_cleaning", kind: "cleaning", name: "【清掃】スタッフ連絡" },
  { id: "g_call", kind: "callcenter", name: "【CC】コールセンター連絡" },
  { id: "g_alerts", kind: "alerts", name: "【管理者】緊急・要対応通知" },
];

/**
 * Keyword rules. Keywords are matched against normalised text (NFKC, lower-case, whitespace removed),
 * so write them without spaces. Hiragana also matches katakana ("みずもれ" ↔ "ミズモレ"); katakana must
 * be katakana ("ボヤ" never matches "ぼやけ"). Plain verb forms also match polite and casual forms
 * ("回らない" ↔ "回りません" / "回ってない"). "A+B" needs both words in the same sentence.
 * An exclude word only ignores the keyword it overlaps ("漏れなく" ↔ the 漏れ in it), never the whole message.
 * A keyword followed right away by a denial ("水漏れはありませんでした") is not counted.
 */
export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  {
    id: "r_emergency_water",
    category: "emergency",
    urgency: "urgent",
    keywords: ["水漏れ", "水もれ", "みずもれ", "漏水", "水が漏れ", "水がもれ", "水浸し", "水びたし", "水だらけ", "浸水", "逆流", "あふれて", "溢れて", "あふれそう", "溢れそう", "びしょびしょ", "水がたまって", "水が溜まって", "雨漏り", "天井から水", "水が垂れ", "水がたれ", "水がぽたぽた", "破裂"],
    excludes: ["漏れなく", "ごみ箱があふれ", "ごみ箱が溢れ", "ごみがあふれ", "ごみが溢れ", "いっぱいであふれ", "いっぱいで溢れ"],
    roles: [],
    enabled: true,
    memo: "漏水・浸水は被害が広がるため即時通知",
  },
  {
    id: "r_emergency_fire",
    category: "emergency",
    urgency: "urgent",
    keywords: ["火事", "火災", "発火", "煙", "けむり", "焦げ", "こげくさ", "燃えて", "燃えた", "火花", "ボヤ", "小火", "火が出", "火が上が", "異常に熱", "異臭", "変なにおい", "変な臭い", "変な匂い", "ガス臭", "ガスくさ", "ガスのにおい", "ガスの臭い", "ガスの匂い", "ガス漏れ", "ガスもれ", "漏電", "感電", "ビリっと", "ビリッと", "ビリビリ", "停電", "ブレーカーが落ち", "ブレーカー落ち", "ブレーカーが上が", "ブレーカーが飛", "真っ暗", "照明が全部消え", "電気が全部消え", "すごく熱", "熱すぎ", "爆発"],
    excludes: ["煙草", "たばこの煙", "禁煙", "喫煙", "煙感知器の点検", "火災報知器の点検", "火災報知器点検", "消防点検", "焦げ茶", "焦げ跡", "焦げあと", "停電の予定", "停電予定", "計画停電", "停電します", "停電する予定", "外は真っ暗", "外が真っ暗"],
    roles: [],
    enabled: true,
    memo: "火災・ガス・電気系統の異常",
  },
  {
    id: "r_emergency_safety",
    category: "emergency",
    urgency: "urgent",
    keywords: ["けがを", "けがし", "けが人", "けがさ", "けがが", "けがは", "怪我", "出血", "血が出", "血だらけ", "挟まれ", "転倒", "転んで", "やけど", "火傷", "指を切", "手を切", "骨折", "転び", "意識がない", "意識がありません", "声をかけても", "救急", "倒れて", "倒れた", "警察", "110番", "119番", "不審", "怪しい人", "あやしい人", "知らない人が", "盗難", "泥棒", "盗まれ", "盗られ", "こじ開け", "いじられ+鍵", "開けられた+跡", "荒らされ", "侵入", "空き巣", "酔っ払いが", "酔っぱらいが", "暴れて", "割られ", "割れて", "破損", "壊され", "閉じ込め", "出られない"],
    excludes: ["救急箱", "警察の巡回", "盗難防止", "盗難対策", "電話に出られ", "看板が倒れ", "自転車が倒れ", "傘が倒れ", "風で倒れ", "のぼりが倒れ"],
    roles: [],
    enabled: true,
    memo: "人身・防犯・設備破損",
  },
  {
    id: "r_emergency_claim",
    category: "emergency",
    urgency: "urgent",
    keywords: ["激怒", "怒鳴", "お怒り", "大変怒", "かなり怒", "すごく怒", "怒って", "訴える", "訴訟", "弁護士", "消費者センター", "警察を呼", "返金しろ", "責任者を出", "責任者に代わ", "責任者と話", "責任者を呼", "店長を出", "店長を呼", "口コミに書", "SNSに書", "ネットに書"],
    excludes: [],
    roles: [],
    enabled: true,
    memo: "強いクレーム（コールセンター想定）",
  },
  {
    id: "r_machine_error",
    category: "machine_error",
    urgency: "attention",
    keywords: ["エラー", "error", "故障", "壊れ", "動かない", "止まった", "止まって", "止まっちゃ", "止まる", "止まらない", "回らない", "乾かない", "温まらない", "水が出ない", "洗剤が出ない", "排水しない", "排水されない", "水が抜けない", "脱水しない", "開かない", "閉まらない", "解除されない", "取り出せない", "コイン詰まり", "詰まって", "詰まった", "投入できない", "入らない+お札", "入らない+お金", "入らない+硬貨", "入らない+コイン", "入らない+電源", "飲み込", "お金が戻らない", "戻ってこない", "戻ってき+札", "戻ってき+硬貨", "戻ってき+お金", "戻ってき+コイン", "戻ってき+小銭", "お釣りが出ない", "スタートしない", "始まらない", "ひびが入", "ひび割れ", "返金", "電源が入らない", "電気がつかない", "異音", "変な音", "ガタガタ", "ガタンガタン", "表示が消え", "受け付けない", "使えない", "反応しない", "反応なし", "反応がない", "反応ない", "動作しない", "調子が悪", "調子がおかし", "不調"],
    excludes: ["返金対応済", "返金済", "返金は不要", "返金不要", "返金しました", "返金いたしました", "髪の毛が詰ま", "ほこりが詰ま", "体の不調", "使えなくなります", "使えなくなる予定", "止まる予定"],
    roles: [],
    enabled: true,
    memo: "機械のエラー・故障・両替機トラブル",
  },
  {
    id: "r_leftover",
    category: "leftover",
    urgency: "attention",
    keywords: ["出しっぱなし", "出しっ放し", "放置", "置きっぱなし", "置きっ放し", "入りっぱなし", "入れっぱなし", "忘れ物", "忘れもの", "取り忘れ", "置き忘れ", "洗濯物を忘れ", "服を忘れ", "残ったまま", "入ったまま", "入れたまま", "残されて", "取りに来ない", "取りにこない", "とりにこない", "引き取りに来ない", "残って+洗濯物", "残って+衣類", "残って+服", "残って+タオル", "そのまま+洗濯物", "そのまま+衣類", "そのまま+服"],
    excludes: [],
    roles: [],
    enabled: true,
    memo: "洗濯物の放置・忘れ物",
  },
  {
    id: "r_question",
    category: "question",
    urgency: "attention",
    keywords: ["?", "ですか", "ますか", "でしょうか", "っけ", "どうすれば", "どうしたら", "教えて", "おしえて", "わかりません", "分かりません", "わからない", "分からない", "確認したい", "ご指示", "判断をお願い"],
    excludes: [],
    roles: [],
    enabled: true,
    memo: "質問・確認依頼（FAQに一致すれば自動回答）",
  },
  {
    id: "r_request",
    category: "question",
    urgency: "attention",
    keywords: ["対応お願いします", "対応をお願いします", "対応してください", "確認お願いします", "確認をお願いします", "ご確認ください", "連絡ください", "折り返し", "苦情", "クレーム", "弁償", "補償"],
    excludes: [],
    roles: ["callcenter"],
    enabled: true,
    memo: "コールセンターからの対応・確認の依頼（担当者へ転送）",
  },
  {
    id: "r_cleaning_done",
    category: "cleaning_done",
    urgency: "normal",
    keywords: ["清掃完了", "掃除完了", "清掃終了", "掃除終了", "清掃終わり", "掃除終わり", "清掃おわり", "掃除おわり", "清掃が終わり", "掃除が終わり", "完了しました", "完了です", "終わりました", "おわりました", "終わりです", "おわりです", "終了しました", "終了です", "作業完了", "作業終了", "清掃済み", "退店します", "撤収します"],
    excludes: [],
    roles: ["staff"],
    enabled: true,
    memo: "清掃完了報告（写真の有無で返信を変える）",
  },
  {
    id: "r_cleaning_start",
    category: "cleaning_start",
    urgency: "normal",
    keywords: ["清掃に入ります", "掃除に入ります", "清掃入ります", "掃除入ります", "清掃開始", "掃除開始", "これから清掃", "これから掃除", "作業開始", "作業に入ります", "入店しました", "到着しました", "今から清掃", "今から掃除", "清掃を始め", "掃除を始め", "清掃を開始", "掃除を開始", "清掃します", "掃除します", "始めます", "はじめます", "スタートします", "清掃スタート", "店入ります", "はいります", "店in", "店イン", "着きました", "現地に着きました"],
    excludes: [],
    roles: ["staff"],
    enabled: true,
    memo: "清掃開始の連絡",
  },
  {
    id: "r_info",
    category: "info",
    urgency: "normal",
    keywords: ["お知らせ", "共有", "予定", "点検", "工事", "業者", "受付を開始", "受付開始", "受付を終了", "受付終了", "以上です", "念のため", "対応済み", "対応済", "解決しました", "解決済", "回答しました", "回答済", "説明しました", "説明済", "案内しました", "案内済", "お伝えしました", "入電なし", "入電ありません", "入電はありません", "返金は不要", "返金不要", "不要とのこと", "動いたと", "動くようになった", "直ったと", "特になし", "問題なし", "異常なし"],
    excludes: [],
    roles: ["callcenter"],
    enabled: true,
    memo: "コールセンターからの連絡事項（トラブルなし）。“連絡”“入電”だけでは連絡事項にしません",
  },
  {
    id: "r_info_staff",
    category: "info",
    urgency: "normal",
    keywords: ["点検", "工事", "業者", "お知らせ", "異常なし", "異常ありません", "異常はありません", "問題なし", "問題ありません", "特になし", "特に問題", "トラブルなし", "変わりなし", "補充しました", "交換しました", "換気しました", "掃除しました", "取り除きました", "片付けました", "直しておきました", "拾っておきました", "確認しました"],
    excludes: [],
    roles: ["staff"],
    enabled: true,
    memo: "スタッフからの「異常なし」や作業の報告",
  },
  {
    id: "r_chat",
    category: "chat",
    urgency: "normal",
    keywords: ["ありがとうございます", "ありがとう", "お疲れ様", "おつかれさま", "お疲れさま", "了解", "承知", "かしこまりました", "よろしくお願いします", "よろしくお願いいたします", "おはようございます", "こんにちは", "失礼します"],
    excludes: [],
    roles: [],
    enabled: true,
    memo: "あいさつ・お礼（返信しない）",
  },
];

export const DEFAULT_REPLY_PATTERNS: ReplyPattern[] = [
  {
    id: "p_start",
    category: "cleaning_start",
    when: "any",
    texts: ["{name}さん、{store}の清掃よろしくお願いします！お気をつけて🙏", "{name}さん、よろしくお願いします！"],
    enabled: true,
  },
  {
    id: "p_done_photo",
    category: "cleaning_done",
    when: "with_photo",
    texts: ["{name}さん、お疲れ様でした！写真も確認しました✨", "{name}さん、{store}の清掃ありがとうございました！写真確認しました。お疲れ様でした。"],
    enabled: true,
  },
  {
    id: "p_done_nophoto",
    category: "cleaning_done",
    when: "without_photo",
    texts: ["{name}さん、お疲れ様でした！お手数ですが、完了写真の送付もお願いします📷"],
    enabled: true,
  },
  {
    id: "p_leftover",
    category: "leftover",
    when: "any",
    texts: ["ご報告ありがとうございます。{target}の件、担当者に共有しました。対応方法が決まり次第お知らせします。"],
    enabled: true,
  },
  {
    id: "p_machine",
    category: "machine_error",
    when: "any",
    texts: ["ご報告ありがとうございます。{target}の件、担当者に連絡しました。可能であれば「使用中止」の貼り紙をお願いします。"],
    enabled: true,
  },
  {
    // The call center is not on site, so it gets a reply without the 「使用中止」 request.
    id: "p_machine_cc",
    category: "machine_error",
    when: "any",
    roles: ["callcenter"],
    texts: ["承知しました。{target}の件、担当者に連絡しました。お客様へのご案内（返金の可否など）は、担当者からあらためてご連絡します。"],
    enabled: true,
  },
  {
    id: "p_question_faq",
    category: "question",
    when: "any",
    texts: ["{answer}"],
    enabled: true,
  },
  {
    id: "p_question",
    category: "question",
    when: "any",
    texts: ["確認して折り返しご連絡します。少々お待ちください。"],
    enabled: true,
  },
  {
    id: "p_info",
    category: "info",
    when: "any",
    texts: ["承知しました。共有ありがとうございます。", "承知しました。"],
    enabled: true,
  },
  {
    id: "p_emergency",
    category: "emergency",
    when: "any",
    texts: ["{name}さん、ご連絡ありがとうございます。緊急のトラブルとして、担当者へすぐに連絡しました。安全を最優先に、無理のない範囲で対応をお願いします。"],
    enabled: true,
  },
  {
    // Used only when a phone target is actually called at night.
    id: "p_emergency_night",
    category: "emergency",
    when: "night",
    texts: ["{name}さん、ご連絡ありがとうございます。緊急のトラブルとして、担当者へすぐに連絡しました（夜間のため電話でも呼び出しています）。安全を最優先に対応をお願いします。"],
    enabled: true,
  },
  {
    // The call center is not on site: ask them to guide the customer instead.
    id: "p_emergency_cc",
    category: "emergency",
    when: "any",
    roles: ["callcenter"],
    texts: ["承知しました。緊急のトラブルとして、担当者へすぐに連絡しました。お客様には、安全を最優先にしていただくようご案内をお願いします。"],
    enabled: true,
  },
  {
    id: "p_emergency_cc_night",
    category: "emergency",
    when: "night",
    roles: ["callcenter"],
    texts: ["承知しました。緊急のトラブルとして、担当者へすぐに連絡しました（夜間のため電話でも呼び出しています）。お客様には、安全を最優先にしていただくようご案内をお願いします。"],
    enabled: true,
  },
  {
    id: "p_chat",
    category: "chat",
    when: "any",
    texts: ["こちらこそありがとうございます！"],
    enabled: false,
  },
  {
    id: "p_unknown",
    category: "unknown",
    when: "any",
    texts: ["内容を確認します。少々お待ちください。"],
    enabled: true,
  },
];

export const DEFAULT_FAQS: FaqEntry[] = [
  {
    id: "f_detergent",
    patterns: [["洗剤", "補充"], ["洗剤", "どこ"], ["洗剤", "場所"], ["洗剤", "在庫"]],
    question: "洗剤の補充（在庫）はどこにありますか？",
    answer: "【自動回答】洗剤の在庫は各店舗バックヤードの棚（上から2段目）にあります。残りが2本以下になったら、このグループでお知らせください。",
    enabled: true,
  },
  {
    id: "f_lost_item",
    patterns: [["忘れ物", "どう"], ["忘れ物", "保管"], ["忘れ物", "どこ"], ["忘れもの", "どう"]],
    question: "忘れ物はどうすればいいですか？",
    answer: "【自動回答】忘れ物は透明の袋に入れて日付を書き、バックヤードの「忘れ物ボックス」へ入れてください。1週間を過ぎたものは管理者が処分します。",
    enabled: true,
  },
  {
    id: "f_garbage",
    // Hiragana also matches katakana: "ごみ" covers "ゴミ".
    patterns: [["ごみ", "いつ"], ["ごみ", "何曜"], ["ごみ", "曜日"], ["ごみ", "出し"], ["ごみ", "出す"]],
    question: "ゴミ出しはいつですか？",
    answer: "【自動回答】ゴミ出しは月曜・木曜の朝8時までです。分別表はバックヤード扉の内側に貼ってあります。",
    enabled: true,
  },
  {
    id: "f_key",
    patterns: [["鍵", "どこ"], ["鍵", "場所"], ["かぎ", "どこ"], ["かぎ", "場所"], ["キーボックス"]],
    question: "鍵はどこにありますか？",
    answer: "【自動回答】鍵は入口横のキーボックスに入っています。暗証番号が分からない場合は、管理者に個別にお問い合わせください（グループには書き込まないでください）。",
    enabled: true,
  },
  {
    id: "f_filter",
    patterns: [["フィルター", "掃除"], ["フィルター", "どう"], ["フィルター", "やり方"]],
    question: "乾燥機のフィルター掃除はどうすればいいですか？",
    answer: "【自動回答】乾燥機のフィルターは毎回の清掃で外してホコリを取り、元に戻してください。破れや変形があれば写真を送ってください。",
    enabled: true,
  },
  {
    id: "f_change",
    patterns: [["両替", "補充"], ["両替", "足りない"], ["小銭", "足りない"], ["両替機", "どう"]],
    question: "両替機の小銭が足りないときは？",
    answer: "【自動回答】両替機の補充は管理者が行います。このグループで「〇〇店の両替機、小銭不足」とお知らせいただければ、当日中に対応します。",
    enabled: true,
  },
];

export const DEFAULT_NOTIFY_TARGETS: NotifyTarget[] = [
  {
    id: "t_alerts_line",
    name: "管理者グループ（LINE）",
    channel: "line_group",
    address: "g_alerts",
    urgencies: ["attention", "urgent"],
    nightOnly: false,
    enabled: true,
  },
  {
    id: "t_owner_mail",
    name: "オーナーのメール",
    channel: "email",
    address: "owner@example.com",
    urgencies: ["urgent"],
    nightOnly: false,
    enabled: true,
  },
  {
    id: "t_night_phone",
    name: "夜間の電話呼び出し",
    channel: "phone",
    address: "090-****-1234",
    urgencies: ["urgent"],
    nightOnly: true,
    enabled: true,
  },
  {
    id: "t_chatwork",
    name: "Chatwork 業務ルーム",
    channel: "chatwork",
    address: "rid:000000",
    urgencies: ["attention"],
    nightOnly: false,
    enabled: false,
  },
];

export const DEFAULT_BEHAVIOR: BehaviorSettings = {
  botName: "ランドリーアシスタント",
  aggregateSeconds: 6,
  confidenceThreshold: 0.55,
  nightStart: "22:00",
  nightEnd: "08:00",
  replyDelayMs: 900,
  askPhotoWhenMissing: true,
  dailyReportTime: "21:00",
};

export function defaultSettings(): Settings {
  // structuredClone keeps the module-level defaults immutable
  return structuredClone({
    stores: DEFAULT_STORES,
    members: DEFAULT_MEMBERS,
    groups: DEFAULT_GROUPS,
    replyPatterns: DEFAULT_REPLY_PATTERNS,
    keywordRules: DEFAULT_KEYWORD_RULES,
    faqs: DEFAULT_FAQS,
    learned: [],
    notifyTargets: DEFAULT_NOTIFY_TARGETS,
    behavior: DEFAULT_BEHAVIOR,
  });
}
