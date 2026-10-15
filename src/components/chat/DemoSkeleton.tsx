import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/format";

/** Placeholder bubble on the chat background. */
function BubbleSkeleton({ side, width }: { side: "left" | "right"; width: string }) {
  return (
    <div className={cn("flex items-end gap-2", side === "right" ? "justify-end" : "justify-start")}>
      {side === "left" && <span aria-hidden className="size-8 shrink-0 animate-pulse rounded-full bg-white/40" />}
      <span aria-hidden className={cn("h-10 animate-pulse rounded-2xl", side === "right" ? "bg-line/60" : "bg-white/60", width)} />
    </div>
  );
}

/**
 * Server-safe loading state of the simulator (hook-free).
 * Shown while the page streams in and until the demo data has been restored from this browser.
 */
export function DemoSkeleton() {
  return (
    <div
      className="flex h-[calc(100dvh-var(--app-header-height))] w-full flex-col lg:mx-auto lg:max-w-[90rem] lg:flex-row lg:gap-3 lg:p-4 xl:gap-4"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        シミュレーターを準備しています…
      </span>

      {/* groups: segmented control on phones, list on desktop */}
      <div className="flex gap-1.5 border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 flex-1 rounded-xl" />
      </div>
      <div className="hidden w-60 shrink-0 flex-col gap-3 lg:flex xl:w-[19rem]">
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-4">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>

      {/* chat */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-chat lg:rounded-2xl">
        <div className="hidden h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:flex">
          <Skeleton className="size-9 rounded-xl" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex flex-1 flex-col justify-end gap-4 px-4 py-4">
          <span aria-hidden className="mx-auto h-5 w-14 animate-pulse rounded-full bg-black/10" />
          <BubbleSkeleton side="left" width="w-56" />
          <BubbleSkeleton side="right" width="w-48" />
          <BubbleSkeleton side="left" width="w-64" />
          <BubbleSkeleton side="right" width="w-40" />
        </div>
        <div className="space-y-2 border-t border-slate-200 bg-white px-3 py-3">
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-10 flex-1 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
        </div>
      </div>

      {/* AI panel */}
      <div className="hidden w-[20rem] shrink-0 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 lg:block xl:w-[25rem]">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}
