import { ArrowRight, CircleCheck, LayoutDashboard, MessagesSquare } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { ChatPreview } from "./ChatPreview";

const TRUST_POINTS = ["登録・インストール不要", "スマホでもそのまま試せます", "入力内容はこのブラウザ内だけに保存"];

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      {/* background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(70rem_36rem_at_75%_-10%,var(--color-brand-100),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40rem_24rem_at_0%_100%,rgb(224_242_254/0.7),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(15_23_42/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/0.045)_1px,transparent_1px)] bg-size-[36px_36px] mask-[radial-gradient(ellipse_80%_70%_at_50%_0%,black_40%,transparent_100%)]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pb-24 lg:pt-20">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-800 shadow-sm ring-1 ring-brand-200 backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
            </span>
            コインランドリー運営向け・LINE連絡の自動化
          </p>

          <h1
            id="hero-heading"
            className="mt-5 text-[1.75rem] font-bold leading-[1.35] tracking-tight text-slate-900 text-balance sm:text-4xl sm:leading-[1.3] lg:text-[2.75rem]"
          >
            清掃報告もコールセンターの連絡も、
            <span className="bg-linear-to-r from-brand-700 to-emerald-600 bg-clip-text text-transparent">
              AIが仕分けて自動で返信
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
            スタッフの「清掃に入ります」「完了しました」には、AIがその場でお返事。洗濯物の放置や機械のエラー、水漏れなどの緊急トラブルだけを、管理者へすぐにお知らせします。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/demo" size="lg" icon={MessagesSquare} iconRight={ArrowRight} className="sm:px-7">
              シミュレーターで試してみる
            </ButtonLink>
            <ButtonLink href="/admin" size="lg" variant="secondary" icon={LayoutDashboard}>
              管理画面を見る
            </ButtonLink>
          </div>
          <p className="mt-3 text-xs text-slate-500">所要時間は約3分です。下の「体験ガイド」の順に試すと流れがよくわかります。</p>

          <ul className="mt-8 flex flex-col gap-2.5 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CircleCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <ChatPreview />
      </div>
    </section>
  );
}
