import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { Avatar, BotAvatar } from "@/components/ui";
import { cn } from "@/lib/format";

export interface ChatPreviewIncoming {
  name: string;
  color: string;
  text: string;
  photo?: boolean;
}

export interface ChatPreviewProps {
  botName: string;
  /** the staff message being answered (drawn on the right like the sender's own LINE screen) */
  incoming?: ChatPreviewIncoming;
  /** the bot's reply; null = the bot stays silent */
  reply: string | null;
  /** shown instead of the reply bubble when reply is null */
  silentLabel?: ReactNode;
  /** small clock text next to the bubbles, e.g. "14:00" */
  time?: string;
  className?: string;
}

/** A tiny LINE-style conversation used to preview replies in the admin screens. */
export function ChatPreview({
  botName,
  incoming,
  reply,
  silentLabel = "自動返信はしません",
  time,
  className,
}: ChatPreviewProps) {
  return (
    <div
      className={cn("space-y-3 rounded-2xl bg-chat p-3 sm:p-4", className)}
      role="group"
      aria-label="返信のプレビュー"
    >
      {incoming && (
        <div className="flex justify-end pl-8">
          <span className="sr-only">{incoming.name}：</span>
          <div className="flex min-w-0 items-end gap-1.5">
            {time && <span className="shrink-0 text-[10px] text-white/85">{time}</span>}
            <div className="flex min-w-0 flex-col items-end gap-1">
              {incoming.photo && (
                <span className="inline-flex h-16 w-24 items-center justify-center gap-1 rounded-2xl bg-white/80 text-xs font-semibold text-slate-600 shadow-sm">
                  <ImageIcon className="size-4" aria-hidden />
                  写真
                </span>
              )}
              {incoming.text.trim() !== "" && (
                <p className="max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-line px-3 py-2 text-[15px] leading-relaxed text-slate-950 shadow-sm sm:text-sm">
                  {incoming.text}
                </p>
              )}
            </div>
            <Avatar name={incoming.name} color={incoming.color} size="xs" className="mb-0.5 hidden sm:inline-flex" />
          </div>
        </div>
      )}

      {reply !== null ? (
        <div className="flex items-start gap-2 pr-8">
          <BotAvatar size="sm" className="mt-0.5" />
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-white/95">
              <span className="truncate">{botName}</span>
              <span className="rounded bg-white/25 px-1 py-px text-[10px] font-semibold leading-none">自動返信</span>
            </p>
            <div className="flex items-end gap-1.5">
              <p className="min-w-0 whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[15px] leading-relaxed text-slate-800 shadow-sm sm:text-sm">
                {reply}
              </p>
              {time && <span className="shrink-0 text-[10px] text-white/85">{time}</span>}
            </div>
          </div>
        </div>
      ) : (
        <p className="mx-auto w-fit rounded-full bg-slate-900/25 px-3 py-1 text-center text-xs font-medium text-white">
          {silentLabel}
        </p>
      )}
    </div>
  );
}
