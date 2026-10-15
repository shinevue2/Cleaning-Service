import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/format";

/** Page header placeholder shared by the admin screens while the demo data loads. */
export function HeaderSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="space-y-2 pt-0.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64 max-w-[60vw]" />
        </div>
      </div>
      {withActions && <Skeleton className="h-10 w-44 rounded-xl" />}
    </div>
  );
}

/** A white card with a title bar and a few placeholder rows. */
export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5", className)}>
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Screen-reader status shown with every skeleton. */
export function LoadingStatus() {
  return (
    <span className="sr-only" role="status">
      データを読み込んでいます…
    </span>
  );
}
