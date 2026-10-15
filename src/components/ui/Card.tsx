import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { renderIcon, type IconLike } from "./icon";

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** buttons / links rendered at the right of the header */
  actions?: ReactNode;
  icon?: IconLike;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** remove the body padding (for tables / edge-to-edge lists) */
  flush?: boolean;
  /** heading level of the title, default h2 */
  titleAs?: "h2" | "h3";
  id?: string;
}

export function Card({
  title,
  description,
  actions,
  icon,
  children,
  footer,
  className,
  bodyClassName,
  flush = false,
  titleAs = "h2",
  id,
}: CardProps) {
  const TitleTag = titleAs;
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04),0_4px_16px_-8px_rgb(15_23_42/0.08)]",
        className,
      )}
    >
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-0 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon !== undefined && (
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                {renderIcon(icon, "size-4")}
              </span>
            )}
            <div className="min-w-0">
              {title !== undefined && (
                <TitleTag className="text-[15px] font-bold leading-snug text-slate-900">{title}</TitleTag>
              )}
              {description !== undefined && (
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>
              )}
            </div>
          </div>
          {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={cn(flush ? (hasHeader ? "pt-4" : "") : "p-4 sm:p-5", bodyClassName)}>{children}</div>
      )}
      {footer !== undefined && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** small label above the title, e.g. 「管理画面」 */
  eyebrow?: ReactNode;
  icon?: IconLike;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, icon, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon !== undefined && (
          // Hidden on phones: the tile would indent the title and squeeze the description into a narrow column.
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-900/20 sm:flex">
            {renderIcon(icon, "size-5")}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow !== undefined && (
            <p className="mb-1 text-xs font-semibold tracking-wide text-brand-700">{eyebrow}</p>
          )}
          <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description !== undefined && (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
          )}
        </div>
      </div>
      {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconLike;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** smaller padding for use inside cards / panels */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12",
        className,
      )}
    >
      {icon !== undefined && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-slate-100 text-slate-500",
            compact ? "size-10" : "size-12",
          )}
        >
          {renderIcon(icon, compact ? "size-5" : "size-6")}
        </span>
      )}
      <p className={cn("font-semibold text-slate-800", compact ? "text-sm" : "text-[15px]")}>{title}</p>
      {description !== undefined && (
        <p className="max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      )}
      {action !== undefined && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
}

/** Grey shimmer block shown while the store hydrates. */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-slate-200/80", className)} />;
}

/** A few lines of skeleton text plus a polite "読み込み中" for screen readers. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <span className="sr-only" role="status">
        読み込み中…
      </span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
