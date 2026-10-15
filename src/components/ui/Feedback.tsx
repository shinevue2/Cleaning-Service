import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn, formatPercent } from "@/lib/format";
import { renderIcon, type IconLike } from "./icon";

/* ------------------------------------------------------------------ */
/* Callout                                                             */
/* ------------------------------------------------------------------ */

export type CalloutTone = "info" | "success" | "warning" | "danger" | "brand";

const CALLOUT: Record<CalloutTone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: Info, iconClass: "text-sky-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CircleCheck, iconClass: "text-emerald-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: TriangleAlert, iconClass: "text-amber-600" },
  danger: { box: "border-red-200 bg-red-50 text-red-950", icon: CircleAlert, iconClass: "text-red-600" },
  brand: { box: "border-brand-200 bg-brand-50 text-brand-950", icon: Info, iconClass: "text-brand-700" },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconLike;
  /** buttons/links shown under the text */
  action?: ReactNode;
  className?: string;
}

/** Inline notice box, e.g. 「AIの判定はサンプルです」. */
export function Callout({ tone = "info", title, children, icon, action, className }: CalloutProps) {
  const style = CALLOUT[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", style.box, className)}>
      <span className={cn("mt-px shrink-0", style.iconClass)}>{renderIcon(icon ?? style.icon, "size-5")}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {title !== undefined && <p className="font-semibold leading-snug">{title}</p>}
        {children !== undefined && <div className="leading-relaxed opacity-90">{children}</div>}
        {action !== undefined && <div className="flex flex-wrap gap-2 pt-1.5">{action}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spinner                                                             */
/* ------------------------------------------------------------------ */

export function Spinner({ label = "読み込み中", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-slate-500", className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Meter / ConfidenceMeter                                             */
/* ------------------------------------------------------------------ */

export type MeterTone = "brand" | "green" | "amber" | "red" | "gray";

const METER_FILL: Record<MeterTone, string> = {
  brand: "bg-brand-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};

export interface MeterProps {
  /** 0..1 */
  value: number;
  /** accessible name, e.g. 「確信度」 */
  label: string;
  tone?: MeterTone;
  /** show the label and percentage above the bar */
  showLabel?: boolean;
  /** draws a tick at this ratio (e.g. the confidence threshold) */
  marker?: number;
  markerLabel?: string;
  className?: string;
}

export function Meter({
  value,
  label,
  tone = "brand",
  showLabel = true,
  marker,
  markerLabel,
  className,
}: MeterProps) {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = formatPercent(ratio);
  return (
    <div className={cn("min-w-0", className)}>
      {showLabel && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-slate-600">{label}</span>
          <span className="font-bold tabular-nums text-slate-900">{pct}</span>
        </div>
      )}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={pct}
        className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/80"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", METER_FILL[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
        {marker !== undefined && Number.isFinite(marker) && (
          <span
            aria-hidden
            title={markerLabel}
            className="absolute inset-y-0 w-0.5 bg-slate-700/70"
            style={{ left: `calc(${Math.min(1, Math.max(0, marker)) * 100}% - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}

export interface ConfidenceMeterProps {
  /** 0..1 */
  value: number;
  /** behavior.confidenceThreshold — below it the message goes to a human */
  threshold?: number;
  showLabel?: boolean;
  className?: string;
}

/** 「確信度」 bar coloured by how sure the judgement is. */
export function ConfidenceMeter({ value, threshold, showLabel = true, className }: ConfidenceMeterProps) {
  const tone: MeterTone =
    threshold !== undefined && value < threshold ? "red" : value >= 0.8 ? "green" : value >= 0.65 ? "brand" : "amber";
  return (
    <Meter
      value={value}
      label="確信度"
      tone={tone}
      showLabel={showLabel}
      marker={threshold}
      markerLabel={threshold !== undefined ? `しきい値 ${formatPercent(threshold)}` : undefined}
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Kbd                                                                 */
/* ------------------------------------------------------------------ */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-300 bg-white px-1 font-sans text-[11px] font-semibold text-slate-600 shadow-[0_1px_0_rgb(203_213_225)]">
      {children}
    </kbd>
  );
}
