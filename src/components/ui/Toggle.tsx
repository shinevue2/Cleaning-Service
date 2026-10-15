"use client";

import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/format";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** visually hide the label (it stays as the accessible name) — for compact table cells */
  hideLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
}

/** An on/off switch (role="switch"). The label sits on the left, the switch on the right. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  hideLabel = false,
  size = "md",
  className,
  id: idProp,
}: ToggleProps) {
  const autoId = useId();
  const id = idProp ?? `toggle-${autoId}`;
  const descId = description !== undefined ? `${id}-desc` : undefined;

  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "size-4" : "size-5";
  const shift = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        hideLabel ? "inline-flex" : "justify-between",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className={cn("min-w-0", hideLabel && "sr-only")}>
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
          {label}
        </label>
        {description !== undefined && (
          <p id={descId} className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed",
          track,
          checked ? "bg-brand-600" : "bg-slate-300 hover:bg-slate-400",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200",
            knob,
            checked ? shift : "translate-x-0",
          )}
        >
          {checked && <Check className="size-3 text-brand-700" strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

/** A native checkbox with a label (and optional description) — accessible by default. */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
  id: idProp,
  name,
}: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? `checkbox-${autoId}`;
  const descId = description !== undefined ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex items-start gap-2.5", disabled && "opacity-60", className)}>
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={descId}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 rounded border-slate-300 accent-brand-700 disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
        {description !== undefined && (
          <p id={descId} className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
