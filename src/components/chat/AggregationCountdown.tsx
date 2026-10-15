"use client";

import { Hourglass, Zap } from "lucide-react";
import { useDemoStore, bufferKey, secondsUntil, type PendingEntry } from "@/lib/store";
import { selectMessagesByIds, selectSender, useNow } from "@/lib/store/selectors";
import { waitProgress, waitingLabel } from "./chatModel";

export interface AggregationCountdownProps {
  entries: readonly PendingEntry[];
  /** the visitor's selected sender in this group (shown without a name) */
  selfId?: string;
}

/**
 * 「写真の追加を待っています… 5秒」 with a 「すぐ判定」 button, one row per waiting sender.
 * A text and a photo sent separately within the wait are judged as one report.
 */
export function AggregationCountdown({ entries, selfId }: AggregationCountdownProps) {
  const now = useNow(250);
  const messages = useDemoStore((s) => s.messages);
  const settings = useDemoStore((s) => s.settings);
  const flushPending = useDemoStore((s) => s.flushPending);
  const totalMs = Math.max(1, settings.behavior.aggregateSeconds) * 1000;

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5 px-3 pb-2">
      {entries.map((entry) => {
        const key = bufferKey(entry.groupId, entry.senderId);
        const label = waitingLabel(selectMessagesByIds(messages, entry.messageIds));
        const at = now ?? entry.dueAt - totalMs;
        const seconds = secondsUntil(entry.dueAt, at);
        const progress = waitProgress(entry.dueAt, at, totalMs);
        const who = entry.senderId === selfId ? "" : `${selectSender(settings, entry.senderId).shortName}さんの投稿：`;
        return (
          <div
            key={key}
            className="animate-pop-in overflow-hidden rounded-2xl bg-white/95 shadow-md ring-1 ring-black/5 backdrop-blur"
          >
            <div className="flex items-center gap-2.5 px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Hourglass className="size-4 animate-pulse" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-snug text-slate-900" role="status">
                  {who}
                  {label}…{" "}
                  <span className="tabular-nums text-amber-700" aria-hidden>
                    {seconds}秒
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                  別々に届いた写真とコメントを、ひとつの報告として判定します
                </p>
              </div>
              <button
                type="button"
                onClick={() => flushPending(key)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand-700 px-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-brand-800"
              >
                <Zap className="size-3.5" aria-hidden />
                すぐ判定
              </button>
            </div>
            <div className="h-1 bg-amber-100" aria-hidden>
              <div
                className="h-full bg-amber-400 transition-[width] duration-300 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
