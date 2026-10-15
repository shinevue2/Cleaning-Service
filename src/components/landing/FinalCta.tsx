import { ArrowRight, LayoutDashboard, MessagesSquare } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-heading" className="px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 via-brand-800 to-slate-900 px-6 py-12 text-center shadow-xl shadow-brand-900/20 sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(36rem_18rem_at_50%_0%,rgb(83_241_217/0.35),transparent_70%)]"
        />
        <h2 id="cta-heading" className="text-2xl font-bold leading-snug text-white text-balance sm:text-3xl">
          まずは3分、実際に触ってみてください
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-brand-50/90 sm:text-base">
          スタッフになったつもりで投稿すると、自動返信と管理者への通知がその場で届きます。管理画面で返信文を変えて、もう一度送ってみるのもおすすめです。
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink
            href="/demo"
            size="lg"
            variant="secondary"
            icon={MessagesSquare}
            iconRight={ArrowRight}
            className="sm:px-7"
          >
            シミュレーターで試してみる
          </ButtonLink>
          <ButtonLink
            href="/admin"
            size="lg"
            variant="inverse"
            icon={LayoutDashboard}
          >
            管理画面を見る
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
