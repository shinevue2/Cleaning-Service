import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";
import { renderIcon, type IconLike } from "./icon";

export type BadgeTone = "gray" | "green" | "amber" | "red" | "blue" | "purple" | "teal";
export type BadgeSize = "sm" | "md";

const SOFT: Record<BadgeTone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-brand-50 text-brand-800 ring-brand-200",
};

const SOLID: Record<BadgeTone, string> = {
  gray: "bg-slate-700 text-white ring-slate-700",
  green: "bg-emerald-700 text-white ring-emerald-700",
  amber: "bg-amber-400 text-amber-950 ring-amber-400",
  red: "bg-red-600 text-white ring-red-600",
  blue: "bg-sky-700 text-white ring-sky-700",
  purple: "bg-violet-600 text-white ring-violet-600",
  teal: "bg-brand-700 text-white ring-brand-700",
};

const DOT: Record<BadgeTone, string> = {
  gray: "bg-slate-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-sky-500",
  purple: "bg-violet-500",
  teal: "bg-brand-500",
};

const SIZE: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-1.5 text-[11px]",
  md: "h-6 gap-1 px-2 text-xs",
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone?: BadgeTone;
  size?: BadgeSize;
  /** filled background for strong emphasis (e.g. urgent) */
  solid?: boolean;
  /** small coloured dot before the label */
  dot?: boolean;
  icon?: IconLike;
  children: ReactNode;
}

export function Badge({
  tone = "gray",
  size = "md",
  solid = false,
  dot = false,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full font-semibold leading-none ring-1 ring-inset",
        solid ? SOLID[tone] : SOFT[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", solid ? "bg-current" : DOT[tone])} />}
      {renderIcon(icon, size === "sm" ? "size-3 shrink-0" : "size-3.5 shrink-0")}
      <span className="truncate">{children}</span>
    </span>
  );
}
