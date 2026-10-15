"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/format";
import { AnalysisPanel, type AnalysisPanelProps } from "./AnalysisPanel";

export interface MobileAnalysisSheetProps extends Omit<AnalysisPanelProps, "variant" | "className"> {
  open: boolean;
  onClose: () => void;
}

/** Phones / tablets: the AI panel as a bottom sheet. */
export function MobileAnalysisSheet({ open, onClose, ...panel }: MobileAnalysisSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="AI判定パネル" size="md">
      <AnalysisPanel {...panel} variant="sheet" />
    </Modal>
  );
}

export interface AnalysisFabProps {
  onClick: () => void;
  /** a judgement arrived that the visitor has not opened yet */
  fresh: boolean;
  busy: boolean;
  className?: string;
}

/** Floating 「AI判定」 button over the chat (phones / tablets). */
export function AnalysisFab({ onClick, fresh, busy, className }: AnalysisFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={fresh ? "AI判定パネルを開く（新しい判定があります）" : "AI判定パネルを開く"}
      className={cn(
        "relative inline-flex h-11 items-center gap-1.5 rounded-full bg-slate-900/90 pl-3.5 pr-4 text-[13px] font-bold text-white shadow-lg shadow-slate-900/25 ring-1 ring-white/20 backdrop-blur transition-transform active:scale-95",
        className,
      )}
    >
      {busy ? (
        <LoaderCircle className="size-4 animate-spin text-violet-300" aria-hidden />
      ) : (
        <Sparkles className="size-4 text-violet-300" aria-hidden />
      )}
      AI判定
      {fresh && !busy && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-3.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex size-3.5 rounded-full bg-violet-500 ring-2 ring-white" />
        </span>
      )}
    </button>
  );
}
