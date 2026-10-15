"use client";

import { useMemo, useState } from "react";
import { ChartColumn, Table2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { buildHourlySeries, type HourBucket } from "./hourly";

/*
 * Stacked columns, pure HTML/CSS: "handled automatically" at the baseline, "forwarded" on top.
 * Colours validated for colour-vision deficiency (dataviz validator): brand-600 #03998b / amber-500 #f59e0b.
 * Below-3:1 contrast on white is relieved by the legend and the table view.
 */
const AUTO_COLOR = "#03998b";
const FORWARD_COLOR = "#f59e0b";
const PLOT_HEIGHT = 144; // px

function hourLabel(hour: number): string {
  return `${hour}時台`;
}

export function HourlyChart({ now }: { now: number }) {
  const records = useDemoStore((s) => s.records);
  const series = useMemo(() => buildHourlySeries(records, now), [records, now]);
  const [showTable, setShowTable] = useState(false);
  const { buckets, max, peak, total } = series;
  const ticks = [max, max / 2, 0];
  const count = buckets.length;

  return (
    <Card
      title="時間帯別の受信"
      description={
        total > 0 && peak
          ? `本日 ${total}件。いちばん多かったのは ${hourLabel(peak.hour)}（${peak.total}件）です。`
          : "本日の受信はまだありません。"
      }
      icon={ChartColumn}
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={showTable ? ChartColumn : Table2}
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? "グラフで見る" : "表で見る"}
        </Button>
      }
    >
      {/* legend */}
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="凡例">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: AUTO_COLOR }} />
          自動で対応
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: FORWARD_COLOR }} />
          管理者へ転送
        </li>
      </ul>

      {showTable ? (
        <div className="max-h-80 overflow-y-auto rounded-xl ring-1 ring-slate-200">
          <HourlyTable buckets={buckets} />
        </div>
      ) : (
        <>
          <div aria-hidden className="flex gap-2">
            {/* y axis */}
            <div className="relative w-5 shrink-0 text-right text-[10px] tabular-nums text-slate-500" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((t) => (
                <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
                  {t}
                </span>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="relative" style={{ height: PLOT_HEIGHT }}>
                {/* gridlines */}
                {ticks.map((t) => (
                  <span
                    key={t}
                    className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-slate-300" : "bg-slate-100")}
                    style={{ top: `${(1 - t / max) * 100}%` }}
                  />
                ))}
                {/* columns */}
                <div className="absolute inset-0 flex items-end">
                  {buckets.map((b, i) => (
                    <Column key={b.hour} bucket={b} max={max} isPeak={peak?.hour === b.hour} align={alignFor(i, count)} />
                  ))}
                </div>
              </div>
              {/* x axis */}
              <div className="mt-1.5 flex">
                {buckets.map((b) => (
                  <span
                    key={b.hour}
                    className={cn(
                      "flex-1 text-center text-[10px] tabular-nums",
                      b.hour === series.currentHour ? "font-bold text-slate-700" : "text-slate-500",
                    )}
                  >
                    {b.hour === series.currentHour ? "今" : b.hour % 3 === 0 ? b.hour : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="sr-only">
            <HourlyTable buckets={buckets} />
          </div>
        </>
      )}
    </Card>
  );
}

function alignFor(index: number, count: number): "start" | "center" | "end" {
  if (index < 3) return "start";
  if (index >= count - 3) return "end";
  return "center";
}

function Column({
  bucket,
  max,
  isPeak,
  align,
}: {
  bucket: HourBucket;
  max: number;
  isPeak: boolean;
  align: "start" | "center" | "end";
}) {
  const autoPct = (bucket.auto / max) * 100;
  const forwardPct = (bucket.forwarded / max) * 100;
  return (
    <div className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-px">
      {/* hover band — makes the hit area the full column, not just the bar */}
      <span className="absolute inset-0 rounded-md transition-colors group-hover:bg-slate-100/70" />
      <div className="relative flex h-full w-full max-w-6 flex-col justify-end">
        {isPeak && bucket.total > 0 && (
          <span className="mb-0.5 shrink-0 text-center text-[10px] font-bold leading-none tabular-nums text-slate-600">
            {bucket.total}
          </span>
        )}
        {bucket.forwarded > 0 && (
          <span
            className="block w-full shrink-0 rounded-t-[4px]"
            style={{ height: `${forwardPct}%`, backgroundColor: FORWARD_COLOR }}
          />
        )}
        {bucket.auto > 0 && (
          <span
            className={cn(
              "block w-full shrink-0",
              // 2px surface gap between the stacked segments (inside the height, so totals stay exact)
              bucket.forwarded === 0 ? "rounded-t-[4px]" : "border-t-2 border-white",
            )}
            style={{ height: `${autoPct}%`, backgroundColor: AUTO_COLOR }}
          />
        )}
      </div>
      {/* tooltip */}
      {!bucket.future && (
        <span
          className={cn(
            "pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-48 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-relaxed text-white shadow-lg group-hover:block",
            align === "start" && "left-0",
            align === "end" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
          )}
        >
          <span className="block font-bold">{hourLabel(bucket.hour)}</span>
          {bucket.total === 0 ? (
            "受信なし"
          ) : (
            <>
              <span className="block">受信 {bucket.total}件</span>
              <span className="block text-white/80">
                自動で対応 {bucket.auto}件・転送 {bucket.forwarded}件
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function HourlyTable({ buckets }: { buckets: HourBucket[] }) {
  return (
    <table className="w-full text-left text-[13px]">
      <caption className="sr-only">時間帯別の受信件数</caption>
      <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
        <tr>
          <th scope="col" className="px-3 py-2 font-semibold">
            時間帯
          </th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">
            受信
          </th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">
            自動で対応
          </th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">
            転送
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {buckets
          .filter((b) => !b.future)
          .map((b) => (
            <tr key={b.hour} className={cn(b.total === 0 && "text-slate-500")}>
              <th scope="row" className="px-3 py-1.5 font-medium">
                {hourLabel(b.hour)}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums">{b.total}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{b.auto}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{b.forwarded}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
