import Link from "next/link";
import {
  ArrowRight,
  ChartColumn,
  Clock,
  Image as ImageIcon,
  ListChecks,
  Play,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import { ButtonLink, CategoryBadge, UrgencyBadge } from "@/components/ui";
import { cn } from "@/lib/format";
import { EXTRA_SCENARIOS, GUIDE_STEPS, scenarioHref } from "./scenarios";
import { Section } from "./Section";

interface AdminLink {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
}

const ADMIN_LINKS: AdminLink[] = [
  {
    href: "/admin/logs",
    icon: ListChecks,
    title: "判定ログで判定を直す",
    body: "AIの判定が違っていたら、正しい分類を選ぶだけ。次から同じような内容に反映されます。",
  },
  {
    href: "/admin/rules",
    icon: SquarePen,
    title: "返信文を書き換える",
    body: "「お疲れ様でした」の文面を変えて、もう一度シミュレーターで送ってみてください。",
  },
  {
    href: "/admin/report",
    icon: ChartColumn,
    title: "日次レポートを見る",
    body: "店舗ごとの清掃状況や未対応のトラブルが、毎日1通にまとまります。",
  },
];

export function TryGuide() {
  return (
    <Section
      id="guide"
      eyebrow="3分でわかる体験ガイド"
      title="まずはこの5つを、順番に試してみてください"
      description="各ボタンから、シミュレーターでそのサンプルの投稿をすぐに試せます。返ってくる自動返信と、画面の「AI判定パネル」に表示される判定の理由をご覧ください。"
      className="bg-white"
    >
      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GUIDE_STEPS.map((step, i) => {
          const urgent = step.urgency === "urgent";
          return (
            <li
              key={step.scenario}
              className={cn(
                "flex flex-col rounded-2xl border bg-slate-50/60 p-5 transition-shadow hover:shadow-md",
                urgent ? "border-red-200" : "border-slate-200",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                    urgent ? "bg-red-600" : "bg-brand-700",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <h3 className="min-w-0 flex-1 text-base font-bold text-slate-900">
                  <span className="sr-only">ステップ{i + 1}：</span>
                  {step.title}
                </h3>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="size-3.5" aria-hidden />
                  約30秒
                </span>
              </div>

              {/* sample post */}
              <div className="mt-4 rounded-xl bg-chat/90 p-3">
                <p className="text-[11px] font-medium text-white/90">{step.sender}</p>
                <div className="mt-1 space-y-1.5">
                  {step.photos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-600">
                      <ImageIcon className="size-3.5" aria-hidden />
                      写真 {step.photos}枚
                    </span>
                  )}
                  <p className="w-fit max-w-full rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-sm">
                    {step.text}
                  </p>
                </div>
              </div>

              {/* expected outcome */}
              <div className="mt-4 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] font-semibold text-slate-500">判定</span>
                  <CategoryBadge category={step.category} size="sm" />
                  <UrgencyBadge urgency={step.urgency} size="sm" />
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{step.result}</p>
              </div>

              <ButtonLink
                href={scenarioHref(step.scenario)}
                variant={urgent ? "danger" : "primary"}
                icon={Play}
                block
                className="mt-5"
                aria-label={`このサンプルを試す：${step.title}`}
              >
                このサンプルを試す
              </ButtonLink>
            </li>
          );
        })}

        {/* after the steps: go to the admin screens */}
        <li className="flex flex-col rounded-2xl border border-brand-200 bg-linear-to-br from-brand-50 to-white p-5">
          <div className="flex items-center gap-3">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
              aria-hidden
            >
              6
            </span>
            <h3 className="text-base font-bold text-slate-900">
              <span className="sr-only">ステップ6：</span>
              最後に、管理画面で確認
            </h3>
          </div>
          <ul className="mt-4 flex-1 space-y-2">
            {ADMIN_LINKS.map(({ href, icon: Icon, title, body }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-brand-300"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-900 group-hover:text-brand-800">
                      {title}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      </ol>

      {/* more examples */}
      <div className="mt-10 rounded-2xl border border-dashed border-slate-300 p-5">
        <h3 className="text-sm font-bold text-slate-900">ほかにも、こんな投稿を試せます</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXTRA_SCENARIOS.map((sc) => (
            <li key={sc.scenario}>
              <Link
                href={scenarioHref(sc.scenario)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white pl-1.5 pr-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-brand-800 hover:ring-brand-300"
              >
                <CategoryBadge category={sc.category} size="sm" />
                {sc.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
