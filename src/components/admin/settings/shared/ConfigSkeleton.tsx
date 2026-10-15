import { Skeleton } from "@/components/ui";
import { CardSkeleton, HeaderSkeleton, LoadingStatus } from "../../shell/AdminSkeleton";

/** Placeholder for the configuration screens while the demo data loads from this browser. */
export function ConfigSkeleton({ tabs = 3, cards = 2 }: { tabs?: number; cards?: number }) {
  return (
    <div className="space-y-6">
      <LoadingStatus />
      <HeaderSkeleton />
      {tabs > 0 && (
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          {Array.from({ length: tabs }, (_, i) => (
            <Skeleton key={i} className="h-7 w-24" />
          ))}
        </div>
      )}
      <div className="space-y-5">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} rows={i === 0 ? 3 : 2} />
        ))}
      </div>
    </div>
  );
}
