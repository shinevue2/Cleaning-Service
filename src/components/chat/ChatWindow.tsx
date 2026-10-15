"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, CircleHelp } from "lucide-react";
import { cn, formatTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { needsAnalysis } from "@/lib/store/pipeline";
import { selectSender, useGroupMessages } from "@/lib/store/selectors";
import type { AnalysisRecord, ChatMessage, Group, Photo, Settings } from "@/lib/types";
import { AlertCard } from "./AlertCard";
import { buildTimeline, groupMemberCount, recordMembership, recordTagIndex } from "./chatModel";
import { groupMeta } from "./groupMeta";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

/** Distance from the bottom (px) that still counts as "reading the newest messages". */
const STICKY_PX = 96;

export interface FocusRequest {
  messageId: string;
  /** changes on every request so the same message can be focused twice */
  nonce: number;
}

export interface ChatWindowProps {
  group: Group;
  settings: Settings;
  /** the visitor's selected sender in this group (their bubbles are on the right) */
  selfId: string | undefined;
  now: number;
  /** record shown in the AI panel — its messages are outlined */
  selectedRecordId: string | undefined;
  onSelectRecord: (record: AnalysisRecord) => void;
  onOpenPhoto: (photo: Photo) => void;
  onJumpToSource: (groupId: string, messageId: string, record: AnalysisRecord | undefined) => void;
  onShowHowTo: () => void;
  focusRequest: FocusRequest | null;
  /** id of the region, referenced by the phone group tabs */
  panelId: string;
  /** overlay at the top of the messages (the 使い方 card) */
  topOverlay?: ReactNode;
  /** overlay at the bottom right of the messages (the phone 「AI判定」 button) */
  bottomOverlay?: ReactNode;
  /** shown between the messages and the composer (aggregation countdown, scenario banner …) */
  footer?: ReactNode;
  composer: ReactNode;
  className?: string;
}

/** The LINE-like chat of one group: header, messages with date separators, typing indicator, composer. */
export function ChatWindow({
  group,
  settings,
  selfId,
  now,
  selectedRecordId,
  onSelectRecord,
  onOpenPhoto,
  onJumpToSource,
  onShowHowTo,
  focusRequest,
  panelId,
  topOverlay,
  bottomOverlay,
  footer,
  composer,
  className,
}: ChatWindowProps) {
  const messages = useGroupMessages(group.id);
  const allMessages = useDemoStore((s) => s.messages);
  const records = useDemoStore((s) => s.records);
  const typing = useDemoStore((s) => Boolean(s.typing[group.id]));

  // Messages that existed when the simulator opened don't animate; new ones slide in.
  const [initialIds] = useState(() => new Set(allMessages.map((m) => m.id)));

  const timeline = useMemo(() => buildTimeline(messages, now), [messages, now]);
  const tagIndex = useMemo(() => recordTagIndex(records), [records]);
  const membership = useMemo(() => recordMembership(records), [records]);
  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const memberCount = groupMemberCount(settings, group);
  const meta = groupMeta(group);
  const Icon = meta.icon;
  const botName = settings.behavior.botName;

  /* ---------------- scrolling ---------------- */

  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  /** last seen height of the list — a scroll caused by the list resizing is not the visitor scrolling */
  const heightRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // The composer grew (e.g. a guide card appeared) and the browser adjusted the scroll position:
    // keep following the newest message instead of treating it as the visitor scrolling up.
    if (el.clientHeight !== heightRef.current) {
      heightRef.current = el.clientHeight;
      if (stickRef.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICKY_PX;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  };

  // A different group: start at the newest message.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [group.id]);

  // Jump to a message (e.g. 「元の投稿へ」 on an alert card).
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusRequest.messageId)}"]`);
    if (!target) return;
    stickRef.current = false;
    // Instant on purpose: a smooth scroll could be cut short by the follow-the-bottom observer.
    target.scrollIntoView({ block: "center" });
  }, [focusRequest]);

  // Follow new content (messages, photos decoding, typing indicator, countdown) while at the bottom.
  useEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!list || !content || typeof ResizeObserver === "undefined") return;
    heightRef.current = list.clientHeight;
    const observer = new ResizeObserver(() => {
      heightRef.current = list.clientHeight;
      if (stickRef.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // The visitor's own post always scrolls into view, even when reading older messages.
  const last = messages[messages.length - 1];
  const lastId = last?.id;
  const lastIsOwn = last !== undefined && last.senderId === selfId;
  useEffect(() => {
    if (!lastId || !lastIsOwn) return;
    const el = listRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [lastId, lastIsOwn]);

  /* ---------------- screen readers ---------------- */

  // Announce the newest message that arrived while the chat was open (bot replies, alerts, others' posts).
  let announcement = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (initialIds.has(m.id)) break;
    if (m.senderId === selfId) continue;
    const who = selectSender(settings, m.senderId).name;
    announcement = m.alert ? `${who}：${m.alert.title}` : `${who}：${m.text || "写真を送信しました"}`;
    break;
  }

  /* ---------------- render ---------------- */

  const renderMessage = (message: ChatMessage, continued: boolean) => {
    const sender = selectSender(settings, message.senderId);
    const time = formatTime(message.createdAt);
    const animate = !initialIds.has(message.id);

    if (message.alert) {
      const alert = message.alert;
      const recordId = alert.sourceMessageIds.map((id) => membership.get(id)).find(Boolean);
      const record = recordId ? recordById.get(recordId) : undefined;
      const photos = allMessages
        .filter((m) => alert.sourceMessageIds.includes(m.id))
        .flatMap((m) => m.photos);
      const sourceGroup = settings.groups.find((g) => g.id === alert.sourceGroupId);
      return (
        <div key={message.id} data-message-id={message.id} className={cn(animate && "animate-msg-in")}>
          <AlertCard
            message={{ ...message, alert }}
            botName={sender.name}
            time={time}
            sourceGroupName={sourceGroup?.name}
            photos={photos}
            selected={record !== undefined && record.id === selectedRecordId}
            onOpenPhoto={onOpenPhoto}
            onShowAnalysis={record ? () => onSelectRecord(record) : undefined}
            onJumpToSource={
              sourceGroup && alert.sourceMessageIds[0]
                ? () => onJumpToSource(sourceGroup.id, alert.sourceMessageIds[0], record)
                : undefined
            }
          />
        </div>
      );
    }

    const own = !sender.isBot && message.senderId === selfId;
    const tagRecord = tagIndex.get(message.id);
    const read = message.analysisId !== undefined || !needsAnalysis(message, settings);
    return (
      <MessageBubble
        key={message.id}
        message={message}
        sender={sender}
        own={own}
        continued={continued}
        time={time}
        readCount={own && read ? memberCount - 1 : null}
        tag={tagRecord ? { record: tagRecord, merged: tagRecord.messageIds.length } : undefined}
        selected={selectedRecordId !== undefined && membership.get(message.id) === selectedRecordId}
        onSelectRecord={onSelectRecord}
        onOpenPhoto={onOpenPhoto}
        animate={animate}
      />
    );
  };

  return (
    <section
      id={panelId}
      aria-label={`${group.name}のトーク`}
      className={cn("relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-chat", className)}
    >
      {/* header (desktop; phones use the group tabs) */}
      <header className="hidden h-15 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:flex">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", meta.tile)}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-slate-900">
            {group.name}
            <span className="font-medium text-slate-500">（{memberCount}）</span>
          </h2>
          <p className="truncate text-[12px] text-slate-500">{meta.description}</p>
        </div>
        <button
          type="button"
          onClick={onShowHowTo}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <CircleHelp className="size-4" aria-hidden />
          使い方
        </button>
      </header>

      {/* messages */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-label="メッセージ"
          // New replies are announced by the live region below, not the whole list on every group switch.
          aria-live="off"
          tabIndex={0}
          className="relative h-full overflow-y-auto overscroll-contain focus-visible:outline-none"
        >
          <div ref={contentRef} className="flex min-h-full flex-col justify-end gap-3 px-3 pb-16 pt-4 sm:px-4 lg:pb-4">
            <p className="mx-auto max-w-[90%] rounded-full bg-black/15 px-3 py-1 text-center text-[11px] font-medium leading-relaxed text-white">
              {meta.notice}
            </p>
            {timeline.map((item) =>
              item.kind === "date" ? (
                // Static (not sticky): a pinned chip would sit on top of message text and buttons.
                <div key={item.key} className="flex justify-center">
                  <span className="rounded-full bg-black/20 px-3 py-0.5 text-[11px] font-semibold text-white">
                    {item.label}
                  </span>
                </div>
              ) : (
                renderMessage(item.message, item.continued)
              ),
            )}
            {typing && <TypingIndicator botName={botName} />}
          </div>
        </div>

        {topOverlay && (
          <div className="absolute inset-x-2 top-2 z-20 max-h-[calc(100%-1rem)] overflow-y-auto overscroll-contain rounded-2xl sm:inset-x-4 sm:top-3 sm:max-h-[calc(100%-1.5rem)]">
            {topOverlay}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
          {showJump && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label="最新のメッセージへ移動"
              className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-black/5 transition-colors hover:bg-slate-50"
            >
              <ArrowDown className="size-5" aria-hidden />
            </button>
          )}
          {bottomOverlay && <div className="pointer-events-auto">{bottomOverlay}</div>}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {footer}
      {composer}
    </section>
  );
}
