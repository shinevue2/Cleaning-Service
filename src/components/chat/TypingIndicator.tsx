import { BotAvatar } from "@/components/ui";

/** 「アシスタントが入力中…」 bubble at the end of the chat (hook-free). */
export function TypingIndicator({ botName }: { botName: string }) {
  return (
    <div className="flex animate-msg-in items-start gap-2 pr-10" role="status">
      <BotAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium text-white/95">{botName}</p>
        <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-white px-3.5 py-3 shadow-sm">
          <span className="flex items-center gap-1" aria-hidden>
            {[0, 160, 320].map((delay) => (
              <span
                key={delay}
                className="size-2 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
              />
            ))}
          </span>
          <span className="text-xs text-slate-500">内容を確認して返信しています…</span>
        </div>
      </div>
    </div>
  );
}
