"use client";

import { SendHorizontal, WandSparkles, X } from "lucide-react";
import type { SampleScenario } from "@/lib/samples";

export interface ScenarioBannerProps {
  scenario: SampleScenario;
  senderName?: string;
  /** position in the landing page's 体験ガイド, e.g. { index: 0, total: 5 } */
  guide?: { index: number; total: number };
  onSend: () => void;
  onDismiss: () => void;
}

/** Shown after opening `/demo?scenario=<id>`: the post is prefilled, one tap sends it. */
export function ScenarioBanner({ scenario, senderName, guide, onSend, onDismiss }: ScenarioBannerProps) {
  return (
    <section
      aria-label={`体験シナリオ：${scenario.label}`}
      className="mx-3 mb-2 animate-pop-in rounded-2xl bg-linear-to-br from-brand-50 to-emerald-50 p-3 ring-1 ring-inset ring-brand-200"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
          <WandSparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {guide && (
            <p className="text-[11.5px] font-semibold text-brand-800">
              体験ガイド {guide.index + 1}／{guide.total}
            </p>
          )}
          <p className="text-[13px] font-bold leading-snug text-brand-950">
            体験シナリオ「{scenario.label}」を入力しました
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-brand-900/80">
            {senderName ? `${senderName}さんとして送信します。` : ""}
            {scenario.hint}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="シナリオをやめる"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-brand-800/70 transition-colors hover:bg-white/70 hover:text-brand-950"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={onSend}
        className="mt-2.5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-line-strong text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-line-deep sm:w-auto sm:px-5"
      >
        <SendHorizontal className="size-4" aria-hidden />
        このシナリオを送信
      </button>
    </section>
  );
}
