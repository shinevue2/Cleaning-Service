import {
  CalendarCheck,
  GraduationCap,
  Images,
  MessageCircleReply,
  SlidersHorizontal,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { Section } from "./Section";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  chips: string[];
  /** icon chip colours */
  tone: string;
}

const FEATURES: Feature[] = [
  {
    icon: MessageCircleReply,
    title: "定型の連絡には自動で返信",
    body: "清掃開始には「よろしくお願いします」、写真つきの完了報告には「お疲れ様でした」、コールセンターの連絡には「承知しました」と、内容に合わせてその場でお返事します。",
    chips: ["よろしくお願いします", "お疲れ様でした", "承知しました"],
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    icon: Siren,
    title: "緊急のトラブルは自動で転送",
    body: "水漏れ・焦げ臭いにおい・けがなどは「緊急」として、管理者グループへすぐに転送します。メールでの通知や、夜間は電話での呼び出しにも対応します。",
    chips: ["管理者グループ", "メール", "夜間は電話"],
    tone: "bg-red-50 text-red-700 ring-red-200",
  },
  {
    icon: SlidersHorizontal,
    title: "返信文は管理画面で変更",
    body: "返信の文言や緊急と判断する言葉は、管理画面（ご希望ならGoogleスプレッドシートでも）で書き換えるだけで変わります。新しい返信パターンも追加ボタンから。プログラムの知識は必要ありません。",
    chips: ["田中さん、お疲れ様でした！", "名前は自動で入ります"],
    tone: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  {
    icon: GraduationCap,
    title: "判定を直すと、次から賢く",
    body: "AIの判定が違っていたら、判定ログで正しい分類を選ぶだけ。直した記録が次からの手本になり、似た内容は正しく判定されるようになります。",
    chips: ["修正 → 次回から反映"],
    tone: "bg-brand-50 text-brand-700 ring-brand-200",
  },
  {
    icon: CalendarCheck,
    title: "毎日のレポートでひと目で確認",
    body: "店舗ごとの清掃状況、自動返信や転送の件数、まだ対応していないトラブルを、毎日1通にまとめて管理者グループへお届けします。",
    chips: ["毎日 21:00", "清掃状況", "未対応のトラブル"],
    tone: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  {
    icon: Images,
    title: "写真つきの報告もまとめて判定",
    body: "写真とコメントが別々に送られてきても、同じ人からの続けての投稿はひとつの報告としてまとめて判定します。二重に返信することはありません。",
    chips: ["写真 ＋ コメント ＝ 1件の報告"],
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
  },
];

export function Features() {
  return (
    <Section
      id="features"
      eyebrow="できること"
      title="現場の連絡を、AIがまとめて引き受けます"
      description="管理者の方がグループを見張っていなくても、返すべきものは返し、知らせるべきものだけが届きます。"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body, chips, tone }) => (
          <li
            key={title}
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
          >
            <span className={`flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ${tone}`}>
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{body}</p>
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="例">
              {chips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium leading-none text-slate-600"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}
