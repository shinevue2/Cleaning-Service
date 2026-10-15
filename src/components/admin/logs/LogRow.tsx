"use client";

import { BookOpen, Camera, ChevronDown, Forward, GraduationCap, Reply } from "lucide-react";
import { Avatar, Badge, BotAvatar, CategoryBadge, UrgencyBadge } from "@/components/ui";
import { cn, formatDateTime, formatTime, isSameTokyoDay, truncate } from "@/lib/format";
import type { SenderInfo } from "@/lib/store/selectors";
import type { AnalysisRecord, Group } from "@/lib/types";
import { LogDetail } from "./LogDetail";
import type { LogJudgement } from "./logUtils";

export interface LogRowProps {
  record: AnalysisRecord;
  judgement: LogJudgement;
  sender: SenderInfo;
  group?: Group;
  now: number;
  expanded: boolean;
  /** opened from a link (?record=…) — highlighted */
  focused: boolean;
  onToggle: () => void;
  onCorrect: () => void;
  onRegisterFaq: () => void;
}

export function LogRow({
  record,
  judgement,
  sender,
  group,
  now,
  expanded,
  focused,
  onToggle,
  onCorrect,
  onRegisterFaq,
}: LogRowProps) {
  const detailId = `log-detail-${record.id}`;
  const when = isSameTokyoDay(record.createdAt, now) ? formatTime(record.createdAt) : formatDateTime(record.createdAt);
  const text = record.combinedText.trim();

  return (
    <li
      id={`log-${record.id}`}
      className={cn("scroll-mt-14 lg:scroll-mt-2", focused && "bg-brand-50/50 ring-2 ring-inset ring-brand-300")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors sm:px-5",
          expanded ? "bg-slate-50" : "hover:bg-slate-50/80",
        )}
      >
        {sender.isBot ? (
          <BotAvatar size="sm" className="mt-0.5" />
        ) : (
          <Avatar name={sender.name} color={sender.color} size="sm" className="mt-0.5" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold text-slate-900">{sender.shortName}</span>
            {group && <span className="truncate text-xs text-slate-500">{group.name}</span>}
            <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-500">{when}</span>
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-slate-800">
            {text ? truncate(text.replace(/\s*\n\s*/g, " "), 110) : <span className="text-slate-500">（写真のみの投稿）</span>}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={judgement.category} size="sm" />
            <UrgencyBadge urgency={judgement.urgency} size="sm" />
            {judgement.corrected && (
              <Badge tone="teal" size="sm" icon={GraduationCap}>
                修正済み
              </Badge>
            )}
            {record.photoCount > 0 && (
              <Badge tone="gray" size="sm" icon={Camera}>
                写真{record.photoCount}枚
              </Badge>
            )}
            {record.plan.reply !== null && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500">
                {record.analysis.faqId ? <BookOpen className="size-3" aria-hidden /> : <Reply className="size-3" aria-hidden />}
                {record.analysis.faqId ? "よくある質問で自動回答" : "自動返信"}
              </span>
            )}
            {record.plan.forward !== null && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500">
                <Forward className="size-3" aria-hidden />
                管理者へ転送
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
        <span className="sr-only">{expanded ? "詳細を閉じる" : "詳細を開く"}</span>
      </button>
      {expanded && (
        <LogDetail
          id={detailId}
          record={record}
          judgement={judgement}
          sender={sender}
          group={group}
          onCorrect={onCorrect}
          onRegisterFaq={onRegisterFaq}
        />
      )}
    </li>
  );
}
