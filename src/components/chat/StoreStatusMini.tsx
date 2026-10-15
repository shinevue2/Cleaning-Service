"use client";

import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { CleaningStatusBadge } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { shortMemberName } from "@/lib/store/pipeline";
import { useStoreBoard } from "@/lib/store/selectors";

/** Today's cleaning status per store — updates live when a start / done report is judged. */
export function StoreStatusMini({ now }: { now: number }) {
  const board = useStoreBoard(now);
  if (!board) return null;
  return (
    <section aria-labelledby="store-status-title" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="mb-2.5 flex items-center gap-2">
        <Store className="size-4 text-brand-700" aria-hidden />
        <h2 id="store-status-title" className="text-[13px] font-bold text-slate-900">
          店舗の清掃状況（本日）
        </h2>
      </div>
      <ul className="space-y-1.5">
        {board.map((row) => (
          <li key={row.store.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{row.store.name}</span>
            {row.updatedAt !== undefined && (
              <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                {row.member ? `${shortMemberName(row.member.name)} ` : ""}
                {formatTime(row.updatedAt)}
              </span>
            )}
            <CleaningStatusBadge status={row.status} size="sm" />
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-500">
        「清掃に入ります」「完了しました」の報告から、自動で更新されます。
      </p>
      <Link
        href="/admin"
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
      >
        ダッシュボードで見る
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
