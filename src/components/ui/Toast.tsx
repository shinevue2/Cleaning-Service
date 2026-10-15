"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";

/*
 * Tiny global toast system — no provider needed.
 *   const toast = useToast();  toast("保存しました");               // success
 *   const { toast } = useToast(); toast("送信できませんでした", "error");
 * `toast()` can also be imported directly and called from non-React code (e.g. store actions).
 * Mount <ToastViewport /> once (done in the root layout).
 *
 * Accessibility: the viewport is the single polite live region; timers pause while the pointer is
 * over a toast or focus is inside one, so nothing disappears while it is being read (WCAG 2.2.1).
 */

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** second line, smaller */
  description?: string;
  /** ms before auto-dismiss; default 3500 (error: 6000, with an action: 7000) */
  duration?: number;
  /** a button in the toast (the toast closes after it is pressed) */
  action?: ToastAction;
}

export interface ToastItem {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
}

/**
 * Where toasts appear.
 *  - "default": top-center on phones (clear of a bottom composer), bottom-right on desktop.
 *  - "demo": the simulator — below the group tabs on phones, bottom-left on desktop (clear of the AI panel).
 */
export type ToastPlacement = "default" | "demo";

const MAX_VISIBLE = 4;
const EMPTY: readonly ToastItem[] = [];

let items: readonly ToastItem[] = EMPTY;
let placement: ToastPlacement = "default";
let seq = 0;
let paused = false;
const listeners = new Set<() => void>();
/** running timers, plus the time each toast still has left (kept while paused) */
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const deadlines = new Map<number, number>();
const remaining = new Map<number, number>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clearTimer(id: number) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  deadlines.delete(id);
}

function startTimer(id: number, ms: number) {
  clearTimer(id);
  if (typeof window === "undefined") return;
  deadlines.set(id, Date.now() + ms);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
}

export function dismissToast(id: number): void {
  clearTimer(id);
  remaining.delete(id);
  const next = items.filter((t) => t.id !== id);
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

function pauseAll() {
  if (paused) return;
  paused = true;
  const now = Date.now();
  for (const [id, deadline] of deadlines) remaining.set(id, Math.max(1500, deadline - now));
  for (const id of [...timers.keys()]) clearTimer(id);
}

function resumeAll() {
  if (!paused) return;
  paused = false;
  for (const [id, ms] of remaining) startTimer(id, ms);
  remaining.clear();
}

/** Shows a toast and returns its id. */
export function toast(message: string, tone: ToastTone = "success", options: ToastOptions = {}): number {
  seq += 1;
  const id = seq;
  const item: ToastItem = { id, message, tone, description: options.description, action: options.action };
  const next = [...items, item];
  // drop the oldest ones beyond the limit
  for (const old of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
    clearTimer(old.id);
    remaining.delete(old.id);
  }
  items = next.slice(-MAX_VISIBLE);
  emit();
  const duration = options.duration ?? (options.action ? 7000 : tone === "error" ? 6000 : 3500);
  if (paused) remaining.set(id, duration);
  else startTimer(id, duration);
  return id;
}

/** Sets where toasts appear; used by full-screen pages such as the simulator. */
export function setToastPlacement(next: ToastPlacement): void {
  if (placement === next) return;
  placement = next;
  emit();
}

/** Uses the given placement while the calling component is shown. */
export function useToastPlacement(next: ToastPlacement): void {
  useEffect(() => {
    setToastPlacement(next);
    return () => setToastPlacement("default");
  }, [next]);
}

export type ToastFn = ((message: string, tone?: ToastTone, options?: ToastOptions) => number) & {
  /** same function, so `const { toast } = useToast()` also works */
  toast: ToastFn;
  dismiss: (id: number) => void;
};

const toastApi: ToastFn = Object.assign(
  (message: string, tone?: ToastTone, options?: ToastOptions) => toast(message, tone, options),
  { dismiss: dismissToast },
) as ToastFn;
toastApi.toast = toastApi;

/** Returns the toast function (callable directly, or destructure `{ toast }`). */
export function useToast(): ToastFn {
  return toastApi;
}

const TONE: Record<ToastTone, { icon: LucideIcon; iconClass: string; bar: string; action: string }> = {
  success: {
    icon: CircleCheck,
    iconClass: "text-emerald-600",
    bar: "bg-emerald-500",
    action: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
  },
  info: { icon: Info, iconClass: "text-sky-600", bar: "bg-sky-500", action: "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100" },
  warning: {
    icon: TriangleAlert,
    iconClass: "text-amber-600",
    bar: "bg-amber-500",
    action: "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100",
  },
  error: { icon: CircleAlert, iconClass: "text-red-600", bar: "bg-red-500", action: "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100" },
};

const PLACEMENT: Record<ToastPlacement, string> = {
  default: cn(
    "inset-x-0 top-[calc(var(--app-header-height)+0.5rem)] items-center px-4",
    "sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end sm:px-0",
  ),
  // Phones: below the header AND the group tabs (so the 管理者 tab and its badge stay visible).
  // Desktop: bottom-left, over the group list — never over the AI判定パネル on the right.
  demo: cn(
    "inset-x-0 top-[calc(var(--app-header-height)+3.75rem)] items-center px-4",
    "lg:inset-x-auto lg:bottom-4 lg:left-4 lg:top-auto lg:items-start lg:px-0",
  ),
};

/** Toast width per placement (on the simulator's desktop layout it fits the group-list column). */
const ITEM_WIDTH: Record<ToastPlacement, string> = {
  default: "max-w-sm",
  demo: "max-w-sm lg:w-60 xl:w-[19rem]",
};

const getItems = () => items;
const getPlacement = () => placement;
const getDefaultPlacement = (): ToastPlacement => "default";

/** Renders active toasts (see `ToastPlacement` for where). */
export function ToastViewport() {
  const list = useSyncExternalStore(subscribe, getItems, () => EMPTY);
  const where = useSyncExternalStore(subscribe, getPlacement, getDefaultPlacement);

  return (
    <div
      role="region"
      aria-label="お知らせ"
      aria-live="polite"
      aria-relevant="additions text"
      onFocus={pauseAll}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeAll();
      }}
      className={cn("pointer-events-none fixed z-[60] flex flex-col gap-2", PLACEMENT[where])}
    >
      {list.map((item) => {
        const tone = TONE[item.tone];
        const Icon = tone.icon;
        return (
          <div
            key={item.id}
            onPointerEnter={pauseAll}
            onPointerLeave={resumeAll}
            className={cn(
              "pointer-events-auto relative flex w-full animate-toast-in items-start gap-3 overflow-hidden rounded-xl bg-white py-3 pl-4 pr-2 shadow-lg shadow-slate-900/10 ring-1 ring-slate-200",
              ITEM_WIDTH[where],
            )}
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} />
            <Icon className={cn("mt-0.5 size-5 shrink-0", tone.iconClass)} aria-hidden />
            <div className="min-w-0 flex-1 pt-px">
              <p className="text-sm font-semibold leading-snug text-slate-900">{item.message}</p>
              {item.description && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{item.description}</p>
              )}
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismissToast(item.id);
                  }}
                  className={cn(
                    "mt-2 inline-flex min-h-8 items-center rounded-lg px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors",
                    tone.action,
                  )}
                >
                  {item.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label="通知を閉じる"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
