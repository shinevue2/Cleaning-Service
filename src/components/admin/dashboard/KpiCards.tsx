import type { ReactNode } from "react";
import { Forward, Gauge, Inbox, Reply, Siren, type LucideIcon } from "lucide-react";
import { Meter } from "@/components/ui";
import { cn, formatNumber } from "@/lib/format";
import type { TodayStats } from "@/lib/store/selectors";

interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  icon: LucideIcon;
  iconClass: string;
  /** "danger" tints the card (an emergency is still open) */
  tone?: "default" | "danger";
  className?: string;
  children?: ReactNode;
}

function Kpi({ label, value, unit, sub, icon: Icon, iconClass, tone = "default", className, children }: KpiProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-3 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_4px_16px_-8px_rgb(15_23_42/0.08)] sm:p-4",
        tone === "danger" ? "border-red-200 bg-red-50" : "border-slate-200/80 bg-white",
        className,
      )}
    >
      <dt className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 sm:text-[13px]">
        <span className={cn("hidden size-7 shrink-0 items-center justify-center rounded-lg sm:flex", iconClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-2 flex flex-1 flex-col sm:mt-3">
        <span className="flex items-baseline gap-1">
          <span className="text-2xl font-bold leading-none tracking-tight text-slate-900 sm:text-3xl">{value}</span>
          {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
        </span>
        {children}
        {/* Phones show the numbers only (the 要対応リスト must stay near the top); a warning stays visible. */}
        <span className={cn("mt-2 text-xs leading-relaxed", tone === "danger" ? "text-red-800" : "hidden text-slate-500 sm:block")}>
          {sub}
        </span>
      </dd>
    </div>
  );
}

export function KpiCards({ stats }: { stats: TodayStats }) {
  const rate = stats.autoRate;
  const hasEmergency = stats.emergencies > 0;
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-4 xl:grid-cols-5" aria-label="本日の数字">
      <Kpi
        label="本日の受信"
        value={formatNumber(stats.received)}
        unit="件"
        sub="写真とコメントは1件として数えます"
        icon={Inbox}
        iconClass="bg-sky-50 text-sky-700"
      />
      <Kpi
        label="自動返信"
        value={formatNumber(stats.autoReplied)}
        unit="件"
        sub={stats.faqAnswers > 0 ? `うち、よくある質問への回答 ${stats.faqAnswers}件` : "定型の返信をAIが送りました"}
        icon={Reply}
        iconClass="bg-brand-50 text-brand-700"
      />
      <Kpi
        label="管理者へ転送"
        value={formatNumber(stats.forwarded)}
        unit="件"
        sub="要対応・緊急として通知しました"
        icon={Forward}
        iconClass="bg-amber-50 text-amber-700"
      />
      <Kpi
        label="緊急"
        value={formatNumber(stats.emergencies)}
        unit="件"
        sub={
          hasEmergency
            ? stats.urgentOpenIssues > 0
              ? `対応待ちが ${stats.urgentOpenIssues}件 あります`
              : "すべて対応済みです"
            : "本日は発生していません"
        }
        icon={Siren}
        iconClass={hasEmergency ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500"}
        tone={hasEmergency && stats.urgentOpenIssues > 0 ? "danger" : "default"}
      />
      <Kpi
        label="自動対応率"
        value={rate === null ? "—" : String(Math.round(rate * 100))}
        unit={rate === null ? undefined : "%"}
        sub={
          rate === null
            ? "まだ受信がありません"
            : `受信 ${stats.received}件のうち ${stats.autoHandled}件は、人の手を介さずに完了しました`
        }
        icon={Gauge}
        iconClass="bg-emerald-50 text-emerald-700"
        className="col-span-2 sm:col-span-2 xl:col-span-1"
      >
        {rate !== null && <Meter value={rate} label="自動対応率" showLabel={false} tone="green" className="mt-3" />}
      </Kpi>
    </dl>
  );
}
