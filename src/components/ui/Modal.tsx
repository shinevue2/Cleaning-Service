"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/format";
import { Button, IconButton } from "./Button";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const noopSubscribe = () => () => {};

/** false during SSR / hydration, true afterwards — without a setState-in-effect. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

// Body scroll lock shared by nested dialogs (Modal → ConfirmDialog).
let lockCount = 0;
let savedOverflow = "";
function lockScroll() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = savedOverflow;
}

// Only the top-most dialog reacts to Escape / Tab.
const dialogStack: string[] = [];

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** disable closing by overlay click (ESC and the × button still work) */
  persistent?: boolean;
  className?: string;
}

/**
 * Accessible dialog: ESC / overlay click closes, focus moves inside on open and returns on close,
 * Tab is kept within the dialog. On phones it opens as a bottom sheet.
 * Put `data-autofocus` on the element that should receive focus first.
 */
export function Modal(props: ModalProps) {
  const isClient = useIsClient();
  if (!props.open || !isClient) return null;
  return createPortal(<ModalPanel {...props} />, document.body);
}

function ModalPanel({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  persistent = false,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = description !== undefined ? `${uid}-desc` : undefined;

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (dialogStack[dialogStack.length - 1] !== uid) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableIn(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(uid);
    lockScroll();

    if (panel) {
      const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
      const target = preferred ?? focusableIn(panel).find((el) => !el.dataset.modalClose) ?? panel;
      target.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const idx = dialogStack.lastIndexOf(uid);
      if (idx >= 0) dialogStack.splice(idx, 1);
      unlockScroll();
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [uid]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-[2px]"
        onClick={persistent ? undefined : onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none",
          "animate-sheet-up sm:animate-pop-in sm:max-h-[88dvh] sm:rounded-2xl",
          SIZE[size],
          className,
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <header className="flex items-start gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold leading-snug text-slate-900 sm:text-lg">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descId} className="mt-1 text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            )}
          </div>
          <IconButton label="閉じる" icon={X} size="sm" onClick={onClose} data-modal-close="true" className="-mr-1.5" />
        </header>
        {children !== undefined && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        )}
        {footer !== undefined && (
          <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ConfirmDialog                                                       */
/* ------------------------------------------------------------------ */

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** extra content between the description and the buttons */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = red confirm button and the cancel button gets the initial focus */
  tone?: "primary" | "danger";
  /** Called on confirm. The dialog then closes itself via onClose/onCancel. */
  onConfirm: () => void;
  /** Called when the dialog is dismissed (cancel, ESC, overlay, ×) and after confirm. */
  onClose?: () => void;
  /** alias of onClose */
  onCancel?: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  tone = "primary",
  onConfirm,
  onClose,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const close = () => {
    (onCancel ?? onClose)?.();
  };
  const danger = tone === "danger";
  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={
        <span className="flex items-start gap-2.5">
          {danger && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <CircleAlert className="size-4" aria-hidden />
            </span>
          )}
          <span className="pt-0.5">{title}</span>
        </span>
      }
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} data-autofocus={danger ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={loading}
            data-autofocus={danger ? undefined : true}
            onClick={() => {
              onConfirm();
              close();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
