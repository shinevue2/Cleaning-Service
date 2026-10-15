"use client";

import { useSyncExternalStore } from "react";
import { Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* "seen" flag in localStorage (per browser)                           */
/* ------------------------------------------------------------------ */

const HOWTO_KEY = "laundry-line-ai:demo-howto-dismissed";
const listeners = new Set<() => void>();
let memoryFlag: boolean | null = null;

function readDismissed(): boolean {
  if (memoryFlag !== null) return memoryFlag;
  try {
    memoryFlag = window.localStorage.getItem(HOWTO_KEY) === "1";
  } catch {
    memoryFlag = false;
  }
  return memoryFlag;
}

function writeDismissed(value: boolean): void {
  memoryFlag = value;
  try {
    if (value) window.localStorage.setItem(HOWTO_KEY, "1");
    else window.localStorage.removeItem(HOWTO_KEY);
  } catch {
    // private mode / blocked storage: remember for this visit only
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the 「使い方」 card is shown, and controls to hide / show it again. */
export function useHowTo(): { open: boolean; dismiss: () => void; show: () => void } {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  return { open: !dismissed, dismiss: () => writeDismissed(true), show: () => writeDismissed(false) };
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

const STEPS = [
  { title: "送信者を選ぶ", body: "入力欄の上の「送信者」で、清掃スタッフ・コールセンター・管理者から選べます。" },
  { title: "メッセージを送る", body: "自由に入力するか、「サンプル」のボタンを押すだけで送信できます。写真も添付できます。" },
  {
    title: "返信と判定を確認",
    body: "アシスタントの返信と「AI判定パネル」で、判断の理由と行った対応が確認できます。",
    mobile: "アシスタントの返信と、右下の「AI判定」ボタンから判断の理由と行った対応が確認できます。",
  },
] as const;

export interface HowToCardProps {
  onDismiss: () => void;
  className?: string;
}

/** First-visit guide: choose a sender → send → see the reply and the AI panel. */
export function HowToCard({ onDismiss, className }: HowToCardProps) {
  return (
    <section
      aria-labelledby="howto-title"
      className={cn(
        "@container animate-pop-in rounded-2xl bg-white/95 p-3.5 shadow-xl shadow-slate-900/15 ring-1 ring-slate-200 backdrop-blur sm:p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Lightbulb className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="howto-title" className="text-[14px] font-bold text-slate-900">
            使い方（3ステップ）
          </h2>
          <p className="text-[12px] text-slate-500">本物のLINEグループと同じように、投稿して試せます。</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="使い方を閉じる"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ol className="mt-3 grid gap-2 @xl:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-2.5 rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-100">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[12px] font-bold text-white"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-snug text-slate-900">{step.title}</p>
              {"mobile" in step ? (
                <>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600 lg:hidden">{step.mobile}</p>
                  <p className="mt-0.5 hidden text-[12px] leading-relaxed text-slate-600 lg:block">{step.body}</p>
                </>
              ) : (
                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">{step.body}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          緊急・要対応の内容は管理者グループに転送されます。
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto inline-flex h-8 items-center rounded-lg bg-brand-700 px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-800"
        >
          わかりました
        </button>
      </div>
    </section>
  );
}
