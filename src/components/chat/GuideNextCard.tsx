"use client";

import Link from "next/link";
import { ArrowRight, CircleCheckBig, LayoutDashboard, ListChecks, X } from "lucide-react";
import type { GuideStep } from "@/components/landing/scenarios";
import { cn } from "@/lib/format";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

/** "①", "②" … for a 0-based guide step. */
export function circled(index: number): string {
  return CIRCLED[index] ?? `${index + 1}.`;
}

export interface GuideNextCardProps {
  steps: readonly GuideStep[];
  /** index of the step that was just sent */
  done: number;
  /** prefills the next step (shows its banner) */
  onTryNext: (step: GuideStep) => void;
  onDismiss: () => void;
}

/**
 * Shown above the composer after a 体験ガイド sample was sent (and the bot has answered): what was
 * just tried, and one tap to the next step — so a first-time tester never has to find the way back.
 */
export function GuideNextCard({ steps, done, onTryNext, onDismiss }: GuideNextCardProps) {
  const current = steps[done];
  const next = steps[done + 1];
  if (!current) return null;
  const finished = next === undefined;

  return (
    <section
      aria-label="体験ガイドの進み具合"
      className="mx-3 mb-2 animate-pop-in rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-inset ring-brand-200"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            finished ? "bg-emerald-600 text-white" : "bg-brand-50 text-brand-800 ring-1 ring-brand-200",
          )}
        >
          {finished ? <CircleCheckBig className="size-4" aria-hidden /> : <ListChecks className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-brand-800">
            体験ガイド {done + 1}／{steps.length}
          </p>
          <p className="mt-0.5 text-[13px] font-bold leading-snug text-slate-900">
            {finished
              ? "体験ガイドをすべて試しました。お疲れ様でした！"
              : `${circled(done)} ${current.title}を試しました。`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-600">
            {finished
              ? "管理画面では、転送された内容や判定ログ、店舗ごとの清掃状況を確認できます。"
              : `次は ${circled(done + 1)} ${next.title} です。`}
          </p>
          <ol aria-hidden className="mt-1.5 flex gap-1">
            {steps.map((step, i) => (
              <li
                key={step.scenario}
                className={cn("h-1.5 flex-1 rounded-full", i <= done ? "bg-brand-500" : "bg-slate-200")}
              />
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="体験ガイドの案内を閉じる"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {finished ? (
          <Link
            href="/admin"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-brand-800 sm:flex-none sm:px-5"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            管理画面を見る
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onTryNext(next)}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-brand-800 sm:flex-none sm:px-5"
          >
            次を試す
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
        <Link
          href="/#guide"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-3 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50"
        >
          体験ガイドに戻る
        </Link>
      </div>
    </section>
  );
}
