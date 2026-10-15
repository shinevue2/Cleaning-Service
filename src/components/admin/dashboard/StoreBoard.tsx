import { Store as StoreIcon, TriangleAlert } from "lucide-react";
import { Card, CleaningStatusBadge, EmptyState, Meter, ButtonLink } from "@/components/ui";
import { cn, formatTime } from "@/lib/format";
import { shortMemberName } from "@/lib/store/pipeline";
import type { StoreBoardRow } from "@/lib/store/selectors";
import type { Issue, StoreCleaningStatus } from "@/lib/types";

const STATUS_NOTE: Record<StoreCleaningStatus, string> = {
  not_started: "本日の報告はまだありません",
  cleaning: "清掃中です",
  awaiting_photo: "完了写真を待っています",
  done: "清掃が完了しました",
};

const STATUS_BAR: Record<StoreCleaningStatus, string> = {
  not_started: "bg-slate-200",
  cleaning: "bg-sky-500",
  awaiting_photo: "bg-amber-400",
  done: "bg-emerald-500",
};

export interface StoreBoardProps {
  rows: StoreBoardRow[];
  /** unresolved issues — counted per store */
  openIssues: Issue[];
}

export function StoreBoard({ rows, openIssues }: StoreBoardProps) {
  const done = rows.filter((r) => r.status === "done").length;
  const issuesByStore = new Map<string, number>();
  for (const issue of openIssues) {
    if (issue.storeId) issuesByStore.set(issue.storeId, (issuesByStore.get(issue.storeId) ?? 0) + 1);
  }

  return (
    <Card
      title="店舗ごとの清掃状況"
      description="スタッフの「清掃に入ります」「完了しました」の報告から、自動で更新されます。"
      icon={StoreIcon}
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={StoreIcon}
          title="店舗が登録されていません"
          description="「設定」から店舗を追加すると、ここに清掃状況が表示されます。"
          action={
            <ButtonLink href="/admin/settings" size="sm" variant="secondary">
              店舗を登録する
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Meter
              value={done / rows.length}
              label={`清掃完了 ${done}／${rows.length}店舗`}
              tone="green"
              showLabel={false}
              className="flex-1"
            />
            <p className="shrink-0 text-sm font-bold text-slate-900">
              完了 <span className="text-lg">{done}</span>
              <span className="font-semibold text-slate-500">／{rows.length}店舗</span>
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {rows.map((row) => {
              const issueCount = issuesByStore.get(row.store.id) ?? 0;
              return (
                <li
                  key={row.store.id}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 pl-4"
                >
                  <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STATUS_BAR[row.status])} />
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[15px] font-bold text-slate-900">{row.store.name}</p>
                    <CleaningStatusBadge status={row.status} size="sm" />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    {row.updatedAt !== undefined ? (
                      <>
                        <time className="font-semibold tabular-nums text-slate-700">{formatTime(row.updatedAt)}</time>{" "}
                        {row.member ? `${shortMemberName(row.member.name)}さん・` : ""}
                        {STATUS_NOTE[row.status]}
                      </>
                    ) : (
                      STATUS_NOTE.not_started
                    )}
                  </p>
                  {issueCount > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                      <TriangleAlert className="size-3" aria-hidden />
                      対応待ちの案件 {issueCount}件
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
