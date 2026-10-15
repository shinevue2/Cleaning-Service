import { ChevronRight, Link2, Rocket, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Section } from "./Section";

interface FlowStep {
  icon: LucideIcon;
  title: string;
  body: string;
  points: string[];
}

const STEPS: FlowStep[] = [
  {
    icon: Link2,
    title: "LINE公式アカウントを接続",
    body: "無料プランの公式アカウントを作成し、清掃スタッフ用・コールセンター用のグループに招待します。",
    points: ["スタッフの皆さまの操作は今まで通り", "通知先（LINE・メール・電話）を設定"],
  },
  {
    icon: SlidersHorizontal,
    title: "返信文と判定条件の調整",
    body: "実際のグループの会話に近い文面でテストしながら、返信の文言や緊急と判断する条件を一緒に整えます。",
    points: ["管理画面やGoogleスプレッドシートで変更可能", "夜間の対応ルールも決められます"],
  },
  {
    icon: Rocket,
    title: "運用開始",
    body: "運用しながら判定を直していくほど、自動で対応できる範囲が広がります。",
    points: ["毎日のレポートで状況を確認", "よくある質問を登録するほど自動回答が増加"],
  },
];

export function ProductionFlow() {
  return (
    <Section
      id="flow"
      eyebrow="本番導入"
      title="本番導入の流れ"
      description="このデモと同じしくみを、実際のLINEグループにつなぎます。お申し込みから運用開始までの目安は約2週間です。"
      className="bg-white"
    >
      <ol className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        {STEPS.map(({ icon: Icon, title, body, points }, i) => (
          <li key={title} className="relative">
            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-900/20">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-bold tracking-wide text-brand-700">STEP {i + 1}</p>
                  <h3 className="text-base font-bold text-slate-900">{title}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{body}</p>
              <ul className="mt-4 space-y-1.5 border-t border-slate-200 pt-4">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-[13px] text-slate-700">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute -right-7 top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-600 shadow ring-1 ring-slate-200 lg:flex"
              >
                <ChevronRight className="size-4" />
              </span>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
