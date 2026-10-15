"use client";

import { FileText, LayoutDashboard, MessagesSquare } from "lucide-react";
import { ButtonLink, Callout, PageHeader, Skeleton } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import { useNow, useOpenIssues, useStoreBoard, useTodayStats } from "@/lib/store/selectors";
import { CardSkeleton, HeaderSkeleton, LoadingStatus } from "../shell/AdminSkeleton";
import { HourlyChart } from "./HourlyChart";
import { IssueList } from "./IssueList";
import { KpiCards } from "./KpiCards";
import { QuickTry } from "./QuickTry";
import { RecentAlerts } from "./RecentAlerts";
import { StoreBoard } from "./StoreBoard";

/** /admin — today's numbers, the store board, the 要対応リスト and recent alerts. */
export function DashboardScreen() {
  const hydrated = useHydrated();
  const now = useNow(30_000);
  if (!hydrated || now === null) return <DashboardSkeleton />;
  return <Dashboard now={now} />;
}

function Dashboard({ now }: { now: number }) {
  const stats = useTodayStats(now);
  const board = useStoreBoard(now);
  const openIssues = useOpenIssues();
  if (!stats || !board) return <DashboardSkeleton />;

  const urgentOpen = openIssues.filter((i) => i.urgency === "urgent");

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="ダッシュボード"
        icon={LayoutDashboard}
        description={
          <>
            {formatDate(now)} {formatTime(now)} 時点の状況です。シミュレーターで投稿すると、この画面の数字もすぐに変わります。
          </>
        }
        actions={
          <>
            <ButtonLink href="/admin/report" variant="secondary" icon={FileText}>
              日次レポート
            </ButtonLink>
            <ButtonLink href="/demo" icon={MessagesSquare}>
              シミュレーターを開く
            </ButtonLink>
          </>
        }
      />

      {urgentOpen.length > 0 && (
        <Callout
          tone="danger"
          title={`緊急の案件が ${urgentOpen.length}件、まだ対応済みになっていません`}
          action={
            <a
              href="#issues"
              className="inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-[13px] font-semibold text-white hover:bg-red-700"
            >
              要対応リストを見る
            </a>
          }
        >
          {urgentOpen
            .slice(0, 2)
            .map((i) => i.title)
            .join("／")}
          {urgentOpen.length > 2 ? ` ほか${urgentOpen.length - 2}件` : ""}
        </Callout>
      )}

      <KpiCards stats={stats} />

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <IssueList now={now} />
          <StoreBoard rows={board} openIssues={openIssues} />
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start gap-5 sm:gap-6 md:grid-cols-2 xl:grid-cols-1">
          <HourlyChart now={now} />
          <RecentAlerts now={now} />
          <div className="md:col-span-2 xl:col-span-1">
            <QuickTry />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingStatus />
      <HeaderSkeleton />
      <div className="grid grid-cols-3 gap-2 sm:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={i === 4 ? "col-span-2 rounded-2xl border border-slate-200/80 bg-white p-4 xl:col-span-1" : "rounded-2xl border border-slate-200/80 bg-white p-4"}
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-4 h-8 w-14" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={2} />
        </div>
        <div className="space-y-6">
          <CardSkeleton rows={2} />
          <CardSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
