"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { renderIcon, type IconLike } from "./icon";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  /** pass an element (e.g. <Bell />) when the tabs are rendered from a Server Component */
  icon?: IconLike;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** "line" = underline tabs (page sections), "pill" = segmented control */
  variant?: "line" | "pill";
  /** accessible name of the tab list, e.g. 「表示の切り替え」 */
  ariaLabel?: string;
  /**
   * When set, tabs get ids `${idPrefix}-tab-${id}` and aria-controls `${idPrefix}-panel-${id}`.
   * Render the content with <TabPanel idPrefix=… id=…>.
   */
  idPrefix?: string;
  /** stretch tabs to fill the width (good for 2-4 tabs on phones) */
  fullWidth?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  variant = "line",
  ariaLabel,
  idPrefix,
  fullWidth = false,
  size = "md",
  className,
}: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number | "first" | "last") => {
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    let target: number;
    if (delta === "first") target = enabled[0];
    else if (delta === "last") target = enabled[enabled.length - 1];
    else {
      const pos = enabled.indexOf(from);
      const nextPos = (pos + delta + enabled.length) % enabled.length;
      target = enabled[pos === -1 ? 0 : nextPos];
    }
    onChange(tabs[target].id);
    refs.current[target]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home":
        event.preventDefault();
        move(index, "first");
        break;
      case "End":
        event.preventDefault();
        move(index, "last");
        break;
      default:
        break;
    }
  };

  const pill = variant === "pill";
  // Keep the list reachable with Tab even if `value` matches no tab.
  const anySelected = tabs.some((t) => t.id === value);
  const firstEnabled = tabs.findIndex((t) => !t.disabled);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        "scrollbar-none flex max-w-full overflow-x-auto",
        pill ? "gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/70" : "gap-1 border-b border-slate-200",
        fullWidth ? "w-full" : pill && "w-fit",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        const hasCount = typeof tab.count === "number";
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            aria-selected={selected}
            tabIndex={selected || (!anySelected && index === firstEnabled) ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "text-[13px]" : "text-sm",
              fullWidth && "flex-1",
              pill
                ? cn(
                    "rounded-lg",
                    size === "sm" ? "h-8 px-3" : "h-9 px-3.5",
                    selected
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
                  )
                : cn(
                    "-mb-px border-b-2",
                    size === "sm" ? "h-9 px-2.5" : "h-11 px-3",
                    selected
                      ? "border-brand-600 text-brand-800"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                  ),
            )}
          >
            {renderIcon(tab.icon, "size-4 shrink-0")}
            <span>{tab.label}</span>
            {hasCount && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums",
                  selected ? "bg-brand-100 text-brand-800" : "bg-slate-200/80 text-slate-600",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  id: string;
  children: ReactNode;
  className?: string;
}

/** Content area paired with <Tabs idPrefix=…>. Render only the active panel. */
export function TabPanel({ idPrefix, id, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className={cn("focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}
