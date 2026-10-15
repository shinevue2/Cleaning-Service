"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, FileText, Layers, LoaderCircle } from "lucide-react";
import { CATEGORY_ICONS } from "@/components/ui";
import { cn } from "@/lib/format";
import { scenariosForGroup, type SampleScenario } from "@/lib/samples";
import type { Group } from "@/lib/types";

export interface ScenarioChipsProps {
  group: Group;
  /** one-tap send of a sample report */
  onSendScenario: (scenario: SampleScenario) => void;
  /** cleaning group: sends a photo, then the comment a moment later (shows the aggregation) */
  onSendCombo?: () => void;
  comboRunning?: boolean;
  /** managers' group: posts today's report */
  onPostReport?: () => void;
  className?: string;
}

const CHIP =
  "inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Order of the chips: the most telling samples first, so the emergency demo is visible without
 * scrolling on a laptop and a phone (清掃開始 → 完了報告 → 緊急 → …).
 */
const CHIP_ORDER: readonly string[] = [
  "sc_start",
  "sc_done_photo",
  "sc_emergency",
  "sc_leftover",
  "sc_machine",
  "sc_faq",
  "sc_question",
  "sc_done_nophoto",
  "cc_info",
  "cc_machine_refund",
  "cc_emergency_smell",
  "cc_thanks",
];
const orderOf = (id: string) => {
  const i = CHIP_ORDER.indexOf(id);
  return i < 0 ? CHIP_ORDER.length : i;
};

/** Scroll state of the chip row: which ends still hide chips. */
function useOverflow(resetKey: string) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // A vertical mouse wheel scrolls the row sideways (most PC mice have no horizontal wheel).
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const before = el.scrollLeft;
      el.scrollLeft += event.deltaY;
      if (el.scrollLeft !== before) event.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", update);
    };
  }, [update, resetKey]);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return { ref, edges, scrollBy };
}

const ARROW =
  "absolute top-1/2 z-[1] hidden size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900 [@media(pointer:fine)]:flex";

/** Horizontally scrollable one-tap sample posts for the open group (wheel and ‹ › buttons on a PC). */
export function ScenarioChips({
  group,
  onSendScenario,
  onSendCombo,
  comboRunning = false,
  onPostReport,
  className,
}: ScenarioChipsProps) {
  const scenarios = [...scenariosForGroup(group.id)].sort((a, b) => orderOf(a.id) - orderOf(b.id));
  const isCleaning = group.kind === "cleaning";
  const isAlerts = group.kind === "alerts";
  const { ref, edges, scrollBy } = useOverflow(group.id);
  if (scenarios.length === 0 && !isAlerts && !(isCleaning && onSendCombo)) return null;

  const chips = scenarios.map((scenario) => {
    const Icon = CATEGORY_ICONS[scenario.expect];
    const emergency = scenario.expect === "emergency";
    return (
      <li key={scenario.id} className="shrink-0">
        <button
          type="button"
          onClick={() => onSendScenario(scenario)}
          title={`「${scenario.text}」を送信します。${scenario.hint}`}
          aria-label={`サンプルを送信：${scenario.label}（${scenario.text}${scenario.photoIds.length > 0 ? "、写真つき" : ""}）`}
          className={cn(
            CHIP,
            emergency
              ? "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100"
              : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-200",
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {scenario.label}
          {scenario.photoIds.length > 0 && <Camera className="size-3.5 shrink-0 opacity-60" aria-hidden />}
        </button>
      </li>
    );
  });

  if (isCleaning && onSendCombo) {
    chips.splice(
      Math.min(3, chips.length),
      0,
      <li key="combo" className="shrink-0">
        <button
          type="button"
          onClick={onSendCombo}
          disabled={comboRunning}
          title="写真を先に送り、少しあとにコメントを送ります。別々に届いても、ひとつの報告として判定する様子を確認できます。"
          aria-label="サンプルを送信：写真とコメントを別々に送る（ひとつの報告としてまとめて判定されます）"
          className={cn(CHIP, "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100")}
        >
          {comboRunning ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Layers className="size-3.5 shrink-0" aria-hidden />
          )}
          写真とコメントを別々に送る
        </button>
      </li>,
    );
  }

  if (isAlerts && onPostReport) {
    chips.push(
      <li key="report" className="shrink-0">
        <button
          type="button"
          onClick={onPostReport}
          title="本日の清掃状況と対応状況のまとめを、このグループに送ります（毎日決まった時刻に送る機能のデモです）。"
          className={cn(CHIP, "bg-brand-50 text-brand-800 ring-brand-200 hover:bg-brand-100")}
        >
          <FileText className="size-3.5 shrink-0" aria-hidden />
          本日のレポートを受け取る
        </button>
      </li>,
    );
  }

  const fadeLeft = edges.left ? "transparent" : "black";
  const fadeRight = edges.right ? "transparent" : "black";
  return (
    <div className={cn("relative min-w-0", className)}>
      {edges.left && (
        <button type="button" onClick={() => scrollBy(-1)} aria-label="前のサンプルを表示" className={cn(ARROW, "left-1")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      <ul
        ref={ref}
        aria-label="ワンタップで試せるサンプル"
        style={{
          maskImage: `linear-gradient(to right, ${fadeLeft}, black 28px, black calc(100% - 36px), ${fadeRight})`,
          WebkitMaskImage: `linear-gradient(to right, ${fadeLeft}, black 28px, black calc(100% - 36px), ${fadeRight})`,
        }}
        className="scrollbar-none flex snap-x gap-1.5 overflow-x-auto px-3 py-0.5"
      >
        {chips}
      </ul>
      {edges.right && (
        <button type="button" onClick={() => scrollBy(1)} aria-label="次のサンプルを表示" className={cn(ARROW, "right-1")}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
