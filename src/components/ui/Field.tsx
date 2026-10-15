"use client";

import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Field: label + hint + error, auto-wires ids to the control inside    */
/* ------------------------------------------------------------------ */

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** For custom controls placed inside <Field>: returns the id / aria props to spread. */
export function useFieldControl(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** shows 「任意」 after the label */
  optional?: boolean;
  /** Renders a <fieldset>/<legend> — use for checkbox or radio groups. */
  as?: "div" | "fieldset";
  /** override the generated control id */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  as = "div",
  htmlFor,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const id = htmlFor ?? `field-${autoId}`;
  const hintId = hint !== undefined ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const labelContent = (
    <>
      {label}
      {required && (
        <span className="ml-1 text-red-600" aria-hidden>
          *
        </span>
      )}
      {optional && <span className="ml-1.5 text-xs font-normal text-slate-500">任意</span>}
    </>
  );

  const helper = (
    <>
      {hint !== undefined && (
        <p id={hintId} className="text-xs leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-xs font-medium text-red-700" role="alert">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  );

  const ctx: FieldContextValue = { id, describedBy, invalid: Boolean(error), required };

  if (as === "fieldset") {
    return (
      <fieldset className={cn("min-w-0 space-y-2", className)} aria-describedby={describedBy}>
        <legend className="mb-2 text-sm font-semibold text-slate-800">{labelContent}</legend>
        <FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
        {helper}
      </fieldset>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {labelContent}
      </label>
      <FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
      {helper}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared control styling                                              */
/* ------------------------------------------------------------------ */

const CONTROL =
  "block w-full rounded-xl border bg-white text-[15px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 " +
  "focus:outline-none focus-visible:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm";

function controlState(invalid: boolean): string {
  return invalid
    ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
    : "border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-500/15";
}

/** Merges the Field context into a control's own props. */
function useControlProps(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
  invalid?: boolean;
}) {
  const field = useContext(FieldContext);
  const invalid = Boolean(props.invalid ?? (props["aria-invalid"] === true || props["aria-invalid"] === "true")) || Boolean(field?.invalid);
  const describedBy = [props["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    required: props.required ?? (field?.required || undefined),
    invalid,
  };
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** icon or text shown inside the field on the left (e.g. a search icon) */
  leading?: ReactNode;
  /** content inside the field on the right (e.g. a unit 「秒」) */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid: invalidProp, leading, trailing, type = "text", ref, ...rest }: InputProps) {
  const { invalid, ...wired } = useControlProps({ ...rest, invalid: invalidProp });
  const input = (
    <input
      ref={ref}
      type={type}
      {...rest}
      {...wired}
      className={cn(
        CONTROL,
        controlState(invalid),
        "h-11 px-3.5 sm:h-10",
        leading !== undefined && "pl-10",
        trailing !== undefined && "pr-12",
        leading === undefined && trailing === undefined && className,
      )}
    />
  );
  if (leading === undefined && trailing === undefined) return input;
  return (
    <div className={cn("relative", className)}>
      {leading !== undefined && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-slate-400 [&_svg]:size-4">
          {leading}
        </span>
      )}
      {input}
      {trailing !== undefined && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-sm text-slate-500">
          {trailing}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Textarea                                                            */
/* ------------------------------------------------------------------ */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** grow with the content (CSS field-sizing; falls back to `rows` on older browsers) */
  autoGrow?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, invalid: invalidProp, autoGrow = false, rows = 3, ref, ...rest }: TextareaProps) {
  const { invalid, ...wired } = useControlProps({ ...rest, invalid: invalidProp });
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...rest}
      {...wired}
      className={cn(
        CONTROL,
        controlState(invalid),
        "resize-y px-3.5 py-2.5 leading-relaxed",
        autoGrow && "field-sizing-content min-h-20 resize-none",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** shorthand for <option> children */
  options?: SelectOption[];
  /** first, empty option text (e.g. 「すべて」) */
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({
  className,
  invalid: invalidProp,
  options,
  placeholder,
  children,
  ref,
  ...rest
}: SelectProps) {
  const { invalid, ...wired } = useControlProps({ ...rest, invalid: invalidProp });
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        {...rest}
        {...wired}
        className={cn(CONTROL, controlState(invalid), "h-11 appearance-none pl-3.5 pr-10 sm:h-10")}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        aria-hidden
      />
    </div>
  );
}
