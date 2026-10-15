import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Card, CategoryBadge } from "@/components/ui";
import { getScenario, type SampleScenarioId } from "@/lib/samples";

/** Scenarios that change this dashboard the most (issues, alerts, KPIs). */
const QUICK_SCENARIOS: readonly SampleScenarioId[] = ["sc_emergency", "sc_leftover", "sc_question", "cc_machine_refund"];

export function QuickTry() {
  const scenarios = QUICK_SCENARIOS.map((id) => getScenario(id)).filter((s) => s !== undefined);
  return (
    <Card
      title="シミュレーターで試す"
      description="サンプルの投稿が入った状態でシミュレーターが開きます。送信後にこの画面へ戻ると、数字や要対応リストが変わっています。"
      icon={Play}
      flush
    >
      <ul className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
        {scenarios.map((sc) => (
          <li key={sc.id}>
            <Link
              href={`/demo?scenario=${sc.id}`}
              className="group flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/80 transition hover:bg-white hover:ring-brand-300"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <CategoryBadge category={sc.expect} size="sm" />
                  <span className="text-sm font-bold text-slate-900 group-hover:text-brand-800">{sc.label}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">「{sc.text}」</span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
