"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CircleAlert, Eye, Plus, Shuffle, TriangleAlert, X } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Category, Settings } from "@/lib/types";
import { PlaceholderChips } from "./PlaceholderChips";
import { MAX_REPLY_LENGTH, insertToken, previewText } from "./ruleUtils";

export const MAX_VARIANTS = 8;

export interface ReplyTextsEditorProps {
  category: Category;
  texts: string[];
  onChange: (texts: string[]) => void;
  settings: Settings;
  /** unique per editor, used for element ids */
  idPrefix: string;
  error?: string;
  warnings?: string[];
  /** focus the first text on mount (modals) */
  autoFocus?: boolean;
}

/** Editor for the text variants of one reply pattern, with placeholder chips and a live preview. */
export function ReplyTextsEditor({
  category,
  texts,
  onChange,
  settings,
  idPrefix,
  error,
  warnings = [],
  autoFocus = false,
}: ReplyTextsEditorProps) {
  const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const caret = useRef<{ index: number; position: number } | null>(null);
  const [active, setActive] = useState(0);
  const list = texts.length > 0 ? texts : [""];
  const activeIndex = Math.min(active, list.length - 1);

  // Restore focus/caret after a chip inserted a placeholder or a variant was added.
  useLayoutEffect(() => {
    const pending = caret.current;
    if (!pending) return;
    caret.current = null;
    const el = refs.current[pending.index];
    if (!el) return;
    el.focus();
    el.setSelectionRange(pending.position, pending.position);
  });

  const update = (index: number, value: string) => {
    onChange(list.map((t, i) => (i === index ? value : t)));
  };

  const insert = (token: string) => {
    const el = refs.current[activeIndex];
    const current = list[activeIndex] ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = insertToken(current, start, end, token);
    caret.current = { index: activeIndex, position: next.caret };
    update(activeIndex, next.text);
  };

  const add = () => {
    if (list.length >= MAX_VARIANTS) return;
    caret.current = { index: list.length, position: 0 };
    setActive(list.length);
    onChange([...list, ""]);
  };

  const remove = (index: number) => {
    if (list.length <= 1) return;
    const next = list.filter((_, i) => i !== index);
    const focusIndex = Math.max(0, index - 1);
    caret.current = { index: focusIndex, position: next[focusIndex]?.length ?? 0 };
    setActive(focusIndex);
    onChange(next);
  };

  const errorId = `${idPrefix}-error`;

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {list.map((text, index) => {
          const id = `${idPrefix}-text-${index}`;
          const previewId = `${id}-preview`;
          const hasPlaceholder = /[{｛]/.test(text);
          const length = Array.from(text).length;
          return (
            <li key={index} className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-[13px] font-semibold text-slate-700">
                  {list.length > 1 ? `文面${index + 1}` : "返信の文面"}
                </label>
                <span className="flex items-center gap-1">
                  {length > MAX_REPLY_LENGTH * 0.8 && (
                    <span className={cn("text-[11px] tabular-nums", length > MAX_REPLY_LENGTH ? "text-red-700" : "text-slate-500")}>
                      {length}／{MAX_REPLY_LENGTH}
                    </span>
                  )}
                  {list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label={`文面${index + 1}を削除`}
                      title={`文面${index + 1}を削除`}
                      className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </span>
              </div>
              <Textarea
                ref={(el) => {
                  refs.current[index] = el;
                }}
                id={id}
                value={text}
                rows={2}
                autoGrow
                data-autofocus={autoFocus && index === 0 ? true : undefined}
                invalid={Boolean(error) && text.trim() === "" && list.every((t) => t.trim() === "")}
                aria-describedby={[hasPlaceholder ? previewId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
                onFocus={() => setActive(index)}
                onChange={(e) => update(index, e.target.value)}
                placeholder={index === 0 ? "例：{name}さん、お疲れ様でした！" : "別の言い回しを入力（任意）"}
              />
              {hasPlaceholder && text.trim() !== "" && (
                <p id={previewId} className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
                  <Eye className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span>
                    <span className="font-semibold text-slate-600">表示例：</span>
                    {previewText(text, category, settings) || "（空欄になります）"}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <PlaceholderChips
        category={category}
        onInsert={insert}
        targetLabel={list.length > 1 ? `文面${activeIndex + 1}` : undefined}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="sm" icon={Plus} onClick={add} disabled={list.length >= MAX_VARIANTS}>
          言い回しを追加
        </Button>
        {list.length > 1 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Shuffle className="size-3.5" aria-hidden />
            毎回この中から1つを選んで返信します
          </span>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-xs font-medium text-red-700">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="flex items-start gap-1 text-xs font-medium text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {w}
        </p>
      ))}
    </div>
  );
}
