"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn, formatTime, tokyoDateKey } from "@/lib/format";
import type { ChatMessage, Group } from "@/lib/types";
import { dateLabel, messagePreview } from "./chatModel";
import { groupMeta } from "./groupMeta";

export interface GroupListProps {
  groups: readonly Group[];
  selectedId: string;
  onSelect: (groupId: string) => void;
  /** last message per group id */
  lastMessages: Readonly<Record<string, ChatMessage | undefined>>;
  unread: Readonly<Record<string, number>>;
  typing: Readonly<Record<string, boolean>>;
  /** member count shown after the name, LINE style */
  memberCounts: Readonly<Record<string, number>>;
  now: number;
  className?: string;
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm",
        className,
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">未読{count}件</span>
    </span>
  );
}

function shortTime(ms: number, now: number): string {
  return tokyoDateKey(ms) === tokyoDateKey(now) ? formatTime(ms) : dateLabel(ms, now);
}

/** Desktop: the group list column (LINE's "トーク" list). */
export function GroupList({
  groups,
  selectedId,
  onSelect,
  lastMessages,
  unread,
  typing,
  memberCounts,
  now,
  className,
}: GroupListProps) {
  return (
    <nav aria-label="グループ" className={cn("min-w-0", className)}>
      <ul className="space-y-1">
        {groups.map((group) => {
          const meta = groupMeta(group);
          const Icon = meta.icon;
          const last = lastMessages[group.id];
          const count = unread[group.id] ?? 0;
          const active = group.id === selectedId;
          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                  active ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "hover:bg-slate-50",
                )}
              >
                <span className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-xl", meta.tile)}>
                  <Icon className="size-5" aria-hidden />
                  {count > 0 && (
                    <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-3">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-red-600 ring-2 ring-white" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px] font-bold", active ? "text-brand-900" : "text-slate-900")}>
                      {group.name}
                      <span className="font-medium text-slate-500">（{memberCounts[group.id] ?? 0}）</span>
                    </span>
                    {last && <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{shortTime(last.createdAt, now)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
                      {typing[group.id] ? (
                        <span className="font-semibold text-brand-700">アシスタントが返信を入力中…</span>
                      ) : last ? (
                        messagePreview(last)
                      ) : (
                        meta.description
                      )}
                    </span>
                    <UnreadBadge count={count} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface GroupTabsProps {
  groups: readonly Group[];
  selectedId: string;
  onSelect: (groupId: string) => void;
  unread: Readonly<Record<string, number>>;
  /** id of the chat region the tabs control */
  panelId: string;
  className?: string;
}

/** Phones: the groups as a segmented control at the top of the chat. */
export function GroupTabs({ groups, selectedId, onSelect, unread, panelId, className }: GroupTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % groups.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + groups.length) % groups.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = groups.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onSelect(groups[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="グループを切り替え"
      className={cn("flex gap-1 rounded-xl bg-slate-100 p-1", className)}
    >
      {groups.map((group, index) => {
        const meta = groupMeta(group);
        const Icon = meta.icon;
        const active = group.id === selectedId;
        const count = unread[group.id] ?? 0;
        return (
          <button
            key={group.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(group.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            title={group.name}
            className={cn(
              "relative flex h-9 min-w-0 flex-auto items-center justify-center gap-1 rounded-lg px-2 text-[12.5px] font-bold transition-colors",
              active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Icon className={cn("size-3.5 shrink-0", active ? "text-brand-700" : "text-slate-500")} aria-hidden />
            <span className="truncate">{meta.short}</span>
            <UnreadBadge count={count} className="absolute -right-1 -top-1.5 h-4.5 min-w-4.5 px-1 text-[10px] ring-2 ring-white" />
          </button>
        );
      })}
    </div>
  );
}
