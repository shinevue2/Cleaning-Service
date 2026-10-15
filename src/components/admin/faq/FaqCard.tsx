"use client";

import { CircleCheck, CircleHelp, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, IconButton, Toggle } from "@/components/ui";
import { cn } from "@/lib/format";
import type { FaqEntry } from "@/lib/types";
import { PatternGroupsView } from "./PatternGroupsEditor";

export interface FaqCardProps {
  faq: FaqEntry;
  /** matched by the test box */
  highlighted?: boolean;
  /** which groups matched the test question */
  matchedGroups?: readonly boolean[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function FaqCard({ faq, highlighted = false, matchedGroups, onEdit, onDelete, onToggle }: FaqCardProps) {
  return (
    <article
      aria-label={faq.question}
      className={cn(
        "min-w-0 rounded-2xl border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow",
        highlighted ? "border-emerald-300 ring-2 ring-emerald-300/70" : "border-slate-200/80",
        !faq.enabled && !highlighted && "bg-slate-50/80",
      )}
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              faq.enabled ? "bg-sky-50 text-sky-700 ring-sky-100" : "bg-slate-100 text-slate-500 ring-slate-200",
            )}
          >
            <CircleHelp className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {highlighted && (
                <Badge tone="green" size="sm" icon={CircleCheck}>
                  テストの質問に一致
                </Badge>
              )}
              {!faq.enabled && (
                <Badge tone="gray" size="sm">
                  停止中
                </Badge>
              )}
            </div>
            <h3 className={cn("text-[15px] font-bold leading-snug", faq.enabled ? "text-slate-900" : "text-slate-500")}>
              {faq.question}
            </h3>
          </div>
        </div>

        <p className="whitespace-pre-wrap rounded-xl rounded-tl-md bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200/80">
          <span className="sr-only">回答：</span>
          {faq.answer}
        </p>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-500">反応する言葉</p>
          <PatternGroupsView groups={faq.patterns} highlight={matchedGroups} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <Toggle
          size="sm"
          label={
            <>
              自動回答に使う<span className="sr-only">（{faq.question}）</span>
            </>
          }
          checked={faq.enabled}
          onChange={onToggle}
          className="items-center gap-2 [&_label]:text-xs [&_label]:font-medium [&_label]:text-slate-600"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
            編集
          </Button>
          <IconButton
            label={`「${faq.question}」を削除`}
            icon={Trash2}
            size="sm"
            onClick={onDelete}
            className="hover:text-red-600"
          />
        </div>
      </footer>
    </article>
  );
}
