"use client";

import { ArrowRight, CornerUpLeft, Siren, Sparkles, TriangleAlert, Info } from "lucide-react";
import { BotAvatar, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/format";
import { cleanAlertTitle } from "@/lib/store/pipeline";
import { URGENCY_LABELS, type ChatMessage, type Photo, type Urgency } from "@/lib/types";
import { parseAlertBody } from "./chatModel";
import { PhotoGrid } from "./PhotoGrid";

const STYLE: Record<Urgency, { band: string; ring: string; icon: typeof Siren; button: "danger" | "primary" }> = {
  urgent: { band: "bg-red-600 text-white", ring: "ring-red-300", icon: Siren, button: "danger" },
  attention: { band: "bg-amber-400 text-amber-950", ring: "ring-amber-300", icon: TriangleAlert, button: "primary" },
  normal: { band: "bg-slate-600 text-white", ring: "ring-slate-300", icon: Info, button: "primary" },
};

export interface AlertCardProps {
  message: ChatMessage & { alert: NonNullable<ChatMessage["alert"]> };
  botName: string;
  time: string;
  /** name of the group the report came from */
  sourceGroupName?: string;
  /** photos of the original report */
  photos: readonly Photo[];
  selected?: boolean;
  onOpenPhoto?: (photo: Photo) => void;
  onShowAnalysis?: () => void;
  onJumpToSource?: () => void;
}

/** A forwarded alert in the managers' group, rendered as a red (緊急) or amber (要対応) card. */
export function AlertCard({
  message,
  botName,
  time,
  sourceGroupName,
  photos,
  selected = false,
  onOpenPhoto,
  onShowAnalysis,
  onJumpToSource,
}: AlertCardProps) {
  const { urgency, title } = message.alert;
  const style = STYLE[urgency] ?? STYLE.attention;
  const Icon = style.icon;
  const fields = parseAlertBody(message.text).filter((f) => f.label !== "グループ");
  const content = fields.find((f) => f.label === "内容");
  const others = fields.filter((f) => f !== content && f.label !== "写真");

  return (
    <div className="flex items-start gap-2 pr-2 sm:pr-10">
      <BotAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-medium text-white/95">{botName}</p>
        <div className="flex items-end gap-1.5">
          <article
            aria-label={`${URGENCY_LABELS[urgency]}の通知：${cleanAlertTitle(title)}`}
            className={cn(
              "w-full max-w-[24rem] overflow-hidden rounded-2xl rounded-tl-md bg-white shadow-md transition-shadow",
              selected ? cn("ring-4", style.ring) : "ring-1 ring-black/5",
            )}
          >
            <header className={cn("flex items-center gap-2 px-3.5 py-2", style.band)}>
              <Icon className={cn("size-4 shrink-0", urgency === "urgent" && "animate-pulse")} aria-hidden />
              <span className="text-[13px] font-bold tracking-wide">{URGENCY_LABELS[urgency]}の通知</span>
              {sourceGroupName && (
                <span className="ml-auto truncate text-[11px] font-medium opacity-90">転送元：{sourceGroupName}</span>
              )}
            </header>

            <div className="space-y-2.5 px-3.5 pb-3 pt-2.5">
              <h3 className="text-[15px] font-bold leading-snug text-slate-900">{cleanAlertTitle(title)}</h3>

              {content && (
                <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
                  {content.value}
                </blockquote>
              )}

              {photos.length > 0 && <PhotoGrid photos={photos} onOpen={onOpenPhoto} size="sm" />}

              {others.length > 0 && (
                <dl className="space-y-1 text-[12px] leading-relaxed">
                  {others.map((field, i) => (
                    <div key={`${field.label}-${i}`}>
                      <dt className="inline font-semibold text-slate-500">{field.label || "詳細"}：</dt>
                      <dd className="inline whitespace-pre-wrap text-slate-700">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <footer className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/80 px-2.5 py-2">
              <ButtonLink href="/admin" size="sm" variant={style.button} iconRight={ArrowRight}>
                要対応リストを見る
              </ButtonLink>
              {onJumpToSource && (
                <button
                  type="button"
                  onClick={onJumpToSource}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-200/70"
                >
                  <CornerUpLeft className="size-3.5" aria-hidden />
                  元の投稿へ
                </button>
              )}
              {onShowAnalysis && (
                <button
                  type="button"
                  onClick={onShowAnalysis}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-violet-700 transition-colors hover:bg-violet-100/70"
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  判定の詳細
                </button>
              )}
            </footer>
          </article>
          <span className="shrink-0 pb-0.5 text-[10px] leading-tight text-white/90">{time}</span>
        </div>
      </div>
    </div>
  );
}
