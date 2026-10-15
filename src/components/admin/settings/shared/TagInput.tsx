"use client";

import {
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type KeyboardEvent,
} from "react";
import { Plus, X } from "lucide-react";
import { useFieldControl } from "@/components/ui";
import { cn } from "@/lib/format";
import { addWords, splitWords, WORD_SEPARATOR } from "./words";

export type TagTone = "brand" | "red" | "slate" | "blue";

const CHIP: Record<TagTone, string> = {
  brand: "bg-brand-50 text-brand-900 ring-brand-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  slate: "bg-slate-100 text-slate-800 ring-slate-200",
  blue: "bg-sky-50 text-sky-900 ring-sky-200",
};

const MAX_WORD_LENGTH = 40;

export interface TagInputProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** accessible name when the input is not inside a <Field> */
  ariaLabel?: string;
  placeholder?: string;
  tone?: TagTone;
  invalid?: boolean;
  /** maximum number of words */
  max?: number;
  className?: string;
  id?: string;
}

/**
 * Word list editor: type a word and press Enter (or 「、」) to add it, × to remove it,
 * Backspace on an empty field removes the last word. Pasted lists are split on 「、」「,」 and
 * line breaks. Japanese IME input is respected (Enter while converting does not add a word).
 */
export function TagInput({
  value,
  onChange,
  ariaLabel,
  placeholder = "言葉を入力して Enter",
  tone = "brand",
  invalid = false,
  max = 60,
  className,
  id: idProp,
}: TagInputProps) {
  const field = useFieldControl();
  const autoId = useId();
  const inputId = idProp ?? field?.id ?? `tags-${autoId}`;
  const statusId = `${inputId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; warn: boolean }>({ text: "", warn: false });
  const isInvalid = invalid || Boolean(field?.invalid);
  const full = value.length >= max;

  const commit = (raw: string): void => {
    const words = splitWords(raw).map((w) => Array.from(w).slice(0, MAX_WORD_LENGTH).join(""));
    setDraft("");
    if (words.length === 0) return;
    const { next, added, duplicates } = addWords(value, words);
    const limited = next.slice(0, max);
    const kept = added.filter((w) => limited.includes(w));
    if (kept.length > 0) onChange(limited);
    const warnings: string[] = [];
    if (duplicates.length > 0) warnings.push(`「${duplicates.join("」「")}」はすでに登録されています。`);
    if (added.length > kept.length) warnings.push(`登録できるのは${max}個までです。`);
    setStatus({
      text: [kept.length > 0 ? `「${kept.join("」「")}」を追加しました。` : "", ...warnings].join(""),
      warn: warnings.length > 0,
    });
  };

  const remove = (index: number): void => {
    const word = value[index];
    onChange(value.filter((_, i) => i !== index));
    setStatus({ text: `「${word}」を削除しました。`, warn: false });
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // keyCode 229 = Safari's IME composition key
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      remove(value.length - 1);
    }
  };

  const onCompositionStart = (): void => {
    composing.current = true;
  };
  const onCompositionEnd = (event: CompositionEvent<HTMLInputElement>): void => {
    composing.current = false;
    const text = event.currentTarget.value;
    if (WORD_SEPARATOR.test(text)) commit(text);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData("text");
    if (!WORD_SEPARATOR.test(text)) return;
    event.preventDefault();
    commit(`${draft}${text}`);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2 py-1.5 shadow-sm transition-colors sm:min-h-10",
          "focus-within:ring-4",
          isInvalid
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500/15"
            : "border-slate-300 hover:border-slate-400 focus-within:border-brand-500 focus-within:ring-brand-500/15",
        )}
      >
        <ul className="contents" aria-label={ariaLabel ? `${ariaLabel}の一覧` : "登録済みの言葉"}>
          {value.map((word, index) => (
            <li
              key={`${word}-${index}`}
              className={cn(
                "inline-flex max-w-full items-center gap-0.5 rounded-lg py-0.5 pl-2 pr-0.5 text-[13px] font-semibold ring-1 ring-inset",
                CHIP[tone],
              )}
            >
              <span className="truncate">{word}</span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`「${word}」を削除`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          disabled={full}
          enterKeyHint="done"
          autoComplete="off"
          aria-label={field ? undefined : ariaLabel}
          aria-describedby={[field?.describedBy, statusId].filter(Boolean).join(" ")}
          aria-invalid={isInvalid || undefined}
          placeholder={full ? `${max}個まで登録できます` : value.length === 0 ? placeholder : "追加…"}
          onChange={(e) => {
            const text = e.target.value;
            if (status.warn) setStatus({ text: "", warn: false });
            if (!composing.current && WORD_SEPARATOR.test(text)) commit(text);
            else setDraft(text);
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onPaste={onPaste}
          onBlur={() => {
            if (!composing.current && draft.trim()) commit(draft);
          }}
          className="h-8 min-w-28 flex-1 bg-transparent px-1.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed sm:text-sm"
        />
        {draft.trim() !== "" && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(draft)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-brand-700 px-2 text-xs font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Plus className="size-3.5" aria-hidden />
            追加
          </button>
        )}
      </div>
      <p
        id={statusId}
        aria-live="polite"
        className={status.warn ? "mt-1 text-xs font-medium text-amber-800" : "sr-only"}
      >
        {status.text}
      </p>
    </div>
  );
}
