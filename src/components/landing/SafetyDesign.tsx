import { BookX, Eye, ShieldCheck, Siren, type LucideIcon } from "lucide-react";

interface Principle {
  icon: LucideIcon;
  title: string;
  body: string;
}

const PRINCIPLES: Principle[] = [
  {
    icon: ShieldCheck,
    title: "迷ったら、人に回す",
    body: "AIが自信を持てない内容は「判定保留」として管理者へ。緊急のトラブルを「お疲れ様でした」で流してしまうことはありません。",
  },
  {
    icon: Siren,
    title: "緊急は、必ず通知",
    body: "「水漏れ」「焦げ臭い」など緊急の条件に当てはまる投稿は、AIの判断にかかわらず必ず緊急として扱います。",
  },
  {
    icon: BookX,
    title: "知らないことには答えない",
    body: "登録されていない質問に、AIがもっともらしく答えることはしません。答えがわからないものは人に回します。",
  },
  {
    icon: Eye,
    title: "判断の理由が見える",
    body: "どの言葉から、なぜその判定になったのかを文章で残します。管理画面からいつでも確認できます。",
  },
];

export function SafetyDesign() {
  return (
    <section aria-labelledby="safety-heading" className="relative isolate overflow-hidden bg-slate-900 py-16 sm:py-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_24rem_at_15%_0%,rgb(6_182_164/0.28),transparent_70%),radial-gradient(40rem_20rem_at_100%_100%,rgb(14_165_233/0.18),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold tracking-wide text-brand-300">
            <span aria-hidden className="h-px w-6 bg-brand-400" />
            安心して任せられる理由
          </p>
          <h2 id="safety-heading" className="text-2xl font-bold leading-snug text-white text-balance sm:text-3xl">
            AIに任せきりにしない、安心の仕組みです
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300 sm:text-base">
            自動で返すのは、間違えても困らない定型の連絡だけ。少しでも判断に迷うものは、必ず人の目を通ります。
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/30">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
