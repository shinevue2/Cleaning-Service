"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useFieldControl } from "@/components/ui";
import { cn } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* ChoiceGroup: radio buttons drawn as selectable cards                 */
/* ------------------------------------------------------------------ */

export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceGroupProps<T extends string> {
  /** radio group name (one per group) */
  name?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly ChoiceOption<T>[];
  /** grid columns from the `sm` breakpoint */
  columns?: 1 | 2 | 3 | 4;
  /** compact pills instead of cards */
  compact?: boolean;
  className?: string;
}

const COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/** Put inside <Field as="fieldset" label=…> so the group gets a legend. */
export function ChoiceGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 3,
  compact = false,
  className,
}: ChoiceGroupProps<T>) {
  const autoName = useId();
  const groupName = name ?? `choice-${autoName}`;
  return (
    <div className={cn(compact ? "flex flex-wrap gap-2" : cn("grid gap-2", COLUMNS[columns]), className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500",
              compact ? "px-3 py-2" : "px-3.5 py-2.5",
              checked
                ? "border-brand-500 bg-brand-50/70 ring-1 ring-inset ring-brand-500"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                checked ? "border-brand-700 bg-brand-700" : "border-slate-300 bg-white",
              )}
            >
              {checked && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                {option.icon}
                {option.label}
              </span>
              {option.description !== undefined && (
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{option.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CheckChips: multi-select drawn as toggle chips (stores, urgencies)   */
/* ------------------------------------------------------------------ */

export interface CheckChipOption<T extends string> {
  value: T;
  label: string;
  /** extra content after the label, e.g. a colour dot */
  adornment?: ReactNode;
}

export interface CheckChipsProps<T extends string> {
  value: readonly T[];
  onChange: (next: T[]) => void;
  options: readonly CheckChipOption<T>[];
  className?: string;
}

/** Native checkboxes styled as chips. Put inside <Field as="fieldset">. Keeps `options` order. */
export function CheckChips<T extends string>({ value, onChange, options, className }: CheckChipsProps<T>) {
  const autoId = useId();
  const toggle = (v: T) => {
    const set = new Set(value);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(options.map((o) => o.value).filter((x) => set.has(x)));
  };
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option, i) => {
        const checked = value.includes(option.value);
        const id = `${autoId}-${i}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500",
              checked
                ? "border-brand-600 bg-brand-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
            )}
          >
            <input
              id={id}
              type="checkbox"
              checked={checked}
              onChange={() => toggle(option.value)}
              className="sr-only"
            />
            {checked ? (
              <Check className="size-3.5 shrink-0" aria-hidden strokeWidth={3} />
            ) : (
              <span aria-hidden className="size-3.5 shrink-0 rounded-full border-2 border-slate-300" />
            )}
            {option.label}
            {option.adornment}
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RangeInput: a slider with a value read-out and end labels            */
/* ------------------------------------------------------------------ */

export interface RangeInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** read-out shown next to the slider and announced by screen readers */
  format: (value: number) => string;
  minLabel?: ReactNode;
  maxLabel?: ReactNode;
  /** accessible name when not inside a <Field> */
  ariaLabel?: string;
  className?: string;
}

export function RangeInput({
  value,
  onChange,
  min,
  max,
  step,
  format,
  minLabel,
  maxLabel,
  ariaLabel,
  className,
}: RangeInputProps) {
  const field = useFieldControl();
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          id={field?.id}
          aria-label={field ? undefined : ariaLabel}
          aria-describedby={field?.describedBy}
          aria-valuetext={format(value)}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-6 w-full min-w-0 cursor-pointer accent-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        />
        <output
          htmlFor={field?.id}
          className="min-w-16 shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-center text-sm font-bold tabular-nums text-slate-900"
        >
          {format(value)}
        </output>
      </div>
      {(minLabel !== undefined || maxLabel !== undefined) && (
        <div className="mt-1.5 flex justify-between gap-4 pr-[4.75rem] text-[11px] leading-snug text-slate-500">
          <span>{minLabel}</span>
          <span className="text-right">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

/** "Saved"/"unsaved" hint next to a form's buttons. */
export function DirtyHint({ dirty }: { dirty: boolean }) {
  return (
    <span
      aria-live="polite"
      className={cn("text-xs font-medium", dirty ? "text-amber-800" : "text-slate-500")}
    >
      {dirty ? "保存していない変更があります" : "変更は保存されています"}
    </span>
  );
}

/** A label/value row used in summaries. */
export function InfoRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-28 shrink-0 text-xs font-semibold text-slate-500 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
