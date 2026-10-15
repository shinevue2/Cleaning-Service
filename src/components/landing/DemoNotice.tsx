import { HardDrive, MonitorSmartphone, Sparkles, type LucideIcon } from "lucide-react";

interface NoticeItem {
  icon: LucideIcon;
  title: string;
  body: string;
  iconClass: string;
}

const ITEMS: NoticeItem[] = [
  {
    icon: Sparkles,
    title: "AIの判定は、現在サンプルです",
    body: "本番のAIにつなぐ前のため、あらかじめ決めた判定ルールで動く「サンプルのAI」が判定しています（画面には「AI判定（サンプル）」と表示されます）。本番では、AIが文章の意味を読み取って判定します。",
    iconClass: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  {
    icon: HardDrive,
    title: "データはこのブラウザの中だけ",
    body: "送信したメッセージや変更した設定は、お使いのブラウザ内にのみ保存され、外部には送信されません。メニューの「デモをリセット」で、いつでも最初の状態に戻せます。",
    iconClass: "bg-brand-50 text-brand-700 ring-brand-200",
  },
  {
    icon: MonitorSmartphone,
    title: "LINEの画面を再現したシミュレーター",
    body: "実際のLINEとは別の画面です。スタッフの皆さまのLINEにメッセージが届くことはありませんので、安心して何度でもお試しください。",
    iconClass: "bg-sky-50 text-sky-700 ring-sky-200",
  },
];

export function DemoNotice() {
  return (
    <section aria-labelledby="notice-heading" className="px-4 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="notice-heading" className="text-sm font-bold text-slate-900">
          このデモについて
        </h2>
        <ul className="mt-4 grid gap-5 md:grid-cols-3 md:gap-6">
          {ITEMS.map(({ icon: Icon, title, body, iconClass }) => (
            <li key={title} className="flex gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${iconClass}`}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
