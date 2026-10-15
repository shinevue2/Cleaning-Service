"use client";

import { useMemo, useState } from "react";
import { Forward, MessageSquareOff, Plus } from "lucide-react";
import { Badge, Button, Callout, CategoryBadge, ConfirmDialog, EmptyState, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { CATEGORY_LABELS, type Category, type ReplyPattern } from "@/lib/types";
import { AddPatternModal } from "./AddPatternModal";
import { ReplyPatternCard } from "./ReplyPatternCard";
import { CATEGORY_HELP, FORWARDED_CATEGORIES, groupPatterns, hasActivePattern, patternConditionLabel } from "./ruleUtils";

type Filter = Category | "all";

/** 返信パターン tab: every reply text, grouped by message category. */
export function ReplyPatternsPanel() {
  const settings = useDemoStore((s) => s.settings);
  const deletePattern = useDemoStore((s) => s.deleteReplyPattern);
  const groups = useMemo(() => groupPatterns(settings.replyPatterns), [settings.replyPatterns]);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<ReplyPattern | null>(null);

  const visible = filter === "all" ? groups : groups.filter((g) => g.category === filter);

  return (
    <div className="space-y-5">
      <Callout tone="brand" title="メッセージの種類ごとに、AIが返す文面を決めます">
        言い回しを複数登録すると、毎回その中から1つを選んで返信するので、機械的な印象になりにくくなります。
        <code className="mx-0.5 font-mono text-[13px]">{"{name}"}</code>（名前）や
        <code className="mx-0.5 font-mono text-[13px]">{"{store}"}</code>（店舗名）などの差し込みは、送った人や内容に合わせて自動で置き換わります。
      </Callout>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="表示する種類"
          className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={settings.replyPatterns.length}>
            すべて
          </FilterChip>
          {groups.map((g) => (
            <FilterChip
              key={g.category}
              active={filter === g.category}
              onClick={() => setFilter(g.category)}
              count={g.patterns.length}
            >
              {CATEGORY_LABELS[g.category]}
            </FilterChip>
          ))}
        </div>
        <Button icon={Plus} onClick={() => setAdding(filter === "all" ? "cleaning_done" : filter)} className="shrink-0">
          返信パターンを追加
        </Button>
      </div>

      <div className="space-y-8">
        {visible.map(({ category, patterns }) => {
          const active = hasActivePattern(settings.replyPatterns, category);
          const headingId = `patterns-${category}`;
          return (
            <section key={category} aria-labelledby={headingId} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <h3 id={headingId} className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={category} />
                    <span className="sr-only">の返信パターン</span>
                    {FORWARDED_CATEGORIES.has(category) && (
                      <Badge tone="amber" size="sm" icon={Forward}>
                        管理者へ転送あり
                      </Badge>
                    )}
                    {category === "question" && (
                      <Badge tone="amber" size="sm" icon={Forward}>
                        よくある質問にないときは転送
                      </Badge>
                    )}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-slate-600">{CATEGORY_HELP[category]}</p>
                </div>
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding(category)}>
                  追加
                </Button>
              </div>

              {!active && (
                <p
                  className={cn(
                    "flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset",
                    category === "chat"
                      ? "bg-slate-50 text-slate-700 ring-slate-200"
                      : "bg-amber-50 text-amber-950 ring-amber-200",
                  )}
                >
                  <MessageSquareOff className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
                  {category === "chat"
                    ? "いまは、あいさつやお礼には返信しない設定です。返信したい場合は、下のパターンを「使う」にしてください。"
                    : FORWARDED_CATEGORIES.has(category)
                      ? "使用中の返信パターンがないため、このメッセージには自動返信しません（管理者への転送は行います）。"
                      : "使用中の返信パターンがないため、このメッセージには自動返信しません。"}
                </p>
              )}

              {patterns.length === 0 ? (
                <EmptyState
                  compact
                  title="返信パターンがありません"
                  description="「追加」から文面を登録できます。"
                  className="rounded-2xl border border-dashed border-slate-300 bg-white/60"
                />
              ) : (
                <div className="space-y-3">
                  {patterns.map((p) => (
                    <ReplyPatternCard key={p.id} pattern={p} settings={settings} onDelete={() => setDeleting(p)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {adding && <AddPatternModal category={adding} onClose={() => setAdding(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title="この返信パターンを削除しますか？"
        description={
          deleting
            ? `「${CATEGORY_LABELS[deleting.category]}（${patternConditionLabel(deleting)}）」の返信パターンを削除します。元に戻すことはできません。一時的に止めたいときは、削除せずに「使う」をオフにしてください。`
            : undefined
        }
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          deletePattern(deleting.id);
          toast("返信パターンを削除しました", "info");
        }}
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
            {deleting.texts[0] ?? ""}
            {deleting.texts.length > 1 && <span className="text-slate-500">（ほか{deleting.texts.length - 1}件の言い回し）</span>}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400",
      )}
    >
      {children}
      <span className={cn("text-[11px] tabular-nums", active ? "text-white/75" : "text-slate-500")}>{count}</span>
    </button>
  );
}
