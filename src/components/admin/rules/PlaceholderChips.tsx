"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/format";
import type { Category } from "@/lib/types";
import { placeholdersFor } from "./ruleUtils";

export interface PlaceholderChipsProps {
  category: Category;
  /** called with the token, e.g. "{name}" */
  onInsert: (token: string) => void;
  /** e.g. 「文面2」 — included in the accessible names */
  targetLabel?: string;
  className?: string;
}

/**
 * Buttons that insert {name} {store} {target} {time} ({answer} for questions) at the caret of the
 * last focused reply text. `onMouseDown` keeps the focus (and selection) in the textarea.
 */
export function PlaceholderChips({ category, onInsert, targetLabel, className }: PlaceholderChipsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-xs font-semibold text-slate-500">差し込み</span>
      {placeholdersFor(category).map((p) => (
        <button
          key={p.key}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(p.token)}
          title={`例：${p.example}`}
          aria-label={`${p.label}（${p.token}）を${targetLabel ? `${targetLabel}に` : ""}差し込む`}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors",
            "hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          )}
        >
          <Plus className="size-3 text-slate-400" aria-hidden />
          <code className="font-mono text-[11px] text-brand-800">{p.token}</code>
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
