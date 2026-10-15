"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { Avatar, BotAvatar } from "@/components/ui";
import { cn } from "@/lib/format";
import { effectiveCategory, effectiveUrgency, type SenderInfo } from "@/lib/store/selectors";
import { CATEGORY_LABELS, URGENCY_LABELS, type AnalysisRecord, type ChatMessage, type Photo, type Urgency } from "@/lib/types";
import { PhotoGrid } from "./PhotoGrid";

const TAG_TONE: Record<Urgency, string> = {
  urgent: "bg-red-600 text-white hover:bg-red-700",
  attention: "bg-amber-300 text-amber-950 hover:bg-amber-200",
  normal: "bg-white/90 text-slate-700 hover:bg-white",
};

export interface RecordTag {
  record: AnalysisRecord;
  /** number of raw messages judged together (photo + comment sent separately) */
  merged: number;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  sender: SenderInfo;
  /** the visitor's currently selected sender → right side, LINE green */
  own: boolean;
  /** same sender as the previous message → no avatar / name */
  continued: boolean;
  time: string;
  /** 「既読 N」 for own messages; null = not read yet */
  readCount?: number | null;
  /** AI judgement tag, shown under the last message of a processed report */
  tag?: RecordTag;
  /** part of the record shown in the AI panel */
  selected?: boolean;
  onSelectRecord?: (record: AnalysisRecord) => void;
  onOpenPhoto?: (photo: Photo) => void;
  /** slide in (only for messages that arrive while the chat is open) */
  animate?: boolean;
}

function AiTag({
  tag,
  align,
  selected,
  onSelect,
}: {
  tag: RecordTag;
  align: "left" | "right";
  selected: boolean;
  onSelect?: (record: AnalysisRecord) => void;
}) {
  const { record, merged } = tag;
  // After a manager's correction, show the corrected category AND urgency (never a mix).
  const category = effectiveCategory(record);
  const urgency = effectiveUrgency(record);
  // Labels such as 「質問・確認」 already contain 「・」, so the urgency is set off with 「｜」;
  // 緊急トラブル implies 緊急 (and the red tag carries it).
  const label = category === "emergency" ? CATEGORY_LABELS[category] : `${CATEGORY_LABELS[category]}｜${URGENCY_LABELS[urgency]}`;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(record)}
      aria-pressed={selected}
      aria-label={`AI判定を表示：${label}${merged > 1 ? `（${merged}件をまとめて判定）` : ""}`}
      className={cn(
        "mt-1 inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1.5 pr-1 text-[11px] font-semibold shadow-sm transition",
        TAG_TONE[urgency],
        selected && "ring-2 ring-white ring-offset-1 ring-offset-chat",
        align === "right" && "self-end",
      )}
    >
      <Sparkles className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        AI判定：{label}
        {merged > 1 && <span className="font-medium opacity-80">（{merged}件をまとめて判定）</span>}
      </span>
      <ChevronRight className="size-3 shrink-0 opacity-70" aria-hidden />
    </button>
  );
}

function Meta({ time, readCount, align }: { time: string; readCount?: number | null; align: "left" | "right" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col justify-end pb-0.5 text-[10px] leading-tight text-white/90",
        align === "right" ? "items-end" : "items-start",
      )}
    >
      {typeof readCount === "number" && readCount > 0 && <span>既読 {readCount}</span>}
      <time>{time}</time>
    </span>
  );
}

/** One chat message: own (right, green), other members (left, white) or the assistant (left, bot avatar). */
export function MessageBubble({
  message,
  sender,
  own,
  continued,
  time,
  readCount,
  tag,
  selected = false,
  onSelectRecord,
  onOpenPhoto,
  animate = false,
}: MessageBubbleProps) {
  const hasText = message.text.trim() !== "";
  const hasPhotos = message.photos.length > 0;
  const highlight = selected ? "ring-2 ring-white ring-offset-2 ring-offset-chat" : "";

  if (own) {
    return (
      <div className={cn("flex justify-end pl-10 sm:pl-16", animate && "animate-msg-in")} data-message-id={message.id}>
        <span className="sr-only">{sender.name}（あなた）：</span>
        <div className="flex min-w-0 max-w-full items-end gap-1.5">
          <Meta time={time} readCount={readCount} align="right" />
          <div className="flex min-w-0 flex-col items-end gap-1">
            {hasPhotos && (
              <PhotoGrid photos={message.photos} onOpen={onOpenPhoto} align="right" className={cn("rounded-2xl", highlight)} />
            )}
            {hasText && (
              <p
                className={cn(
                  "max-w-full whitespace-pre-wrap rounded-2xl rounded-tr-md bg-line px-3 py-2 text-[15px] leading-relaxed text-slate-950 shadow-sm sm:text-sm",
                  highlight,
                )}
              >
                {message.text}
              </p>
            )}
            {tag && <AiTag tag={tag} align="right" selected={selected} onSelect={onSelectRecord} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2 pr-10 sm:pr-16", animate && "animate-msg-in")} data-message-id={message.id}>
      {continued ? (
        <span aria-hidden className="w-8 shrink-0" />
      ) : sender.isBot ? (
        <BotAvatar size="sm" className="mt-0.5" />
      ) : (
        <Avatar name={sender.name} color={sender.color} size="sm" className="mt-0.5" />
      )}
      <div className="min-w-0">
        {continued ? (
          <span className="sr-only">{sender.name}：</span>
        ) : (
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-white/95">
            <span className="truncate">{sender.name}</span>
            {sender.isBot && (
              <span className="rounded bg-white/25 px-1 py-px text-[10px] font-semibold leading-none text-white">自動返信</span>
            )}
          </p>
        )}
        <div className="flex items-end gap-1.5">
          <div className="flex min-w-0 flex-col items-start gap-1">
            {hasPhotos && <PhotoGrid photos={message.photos} onOpen={onOpenPhoto} className={cn("rounded-2xl", highlight)} />}
            {hasText && (
              <p
                className={cn(
                  "max-w-full whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-800 shadow-sm sm:text-sm",
                  continued ? "rounded-tl-2xl" : "rounded-tl-md",
                  highlight,
                )}
              >
                {message.text}
              </p>
            )}
            {tag && <AiTag tag={tag} align="left" selected={selected} onSelect={onSelectRecord} />}
          </div>
          <Meta time={time} align="left" />
        </div>
      </div>
    </div>
  );
}
