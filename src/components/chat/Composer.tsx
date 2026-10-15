"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ImagePlus, SendHorizontal, X } from "lucide-react";
import { Avatar, Kbd } from "@/components/ui";
import { cn } from "@/lib/format";
import { ROLE_LABELS, type Group, type Member } from "@/lib/types";
import { isDraftEmpty, MAX_ATTACHED_PHOTOS, type Draft } from "./chatModel";

const MAX_TEXTAREA_PX = 128;

export interface ComposerProps {
  group: Group;
  sender: Member | undefined;
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
  onSend: () => void;
  onOpenSenderPicker: () => void;
  onOpenPhotoPicker: () => void;
  /** pulse the send button (a scenario was prefilled) */
  highlightSend?: boolean;
  /** one-tap sample chips, rendered above the input */
  chips?: ReactNode;
  /** e.g. the scenario banner */
  banner?: ReactNode;
}

/** True on touch-first devices (software keyboard: there is no Shift+Enter). */
function prefersTouch(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * LINE-like input area: sender, photo attach, text and send.
 * PC: Enter = send, Shift+Enter = newline. Phone: Enter = newline, the send button sends (like LINE).
 */
export function Composer({
  group,
  sender,
  draft,
  onDraftChange,
  onSend,
  onOpenSenderPicker,
  onOpenPhotoPicker,
  highlightSend = false,
  chips,
  banner,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const empty = isDraftEmpty(draft);
  const disabled = !sender;
  const isManager = sender?.role === "manager";

  // Grow the textarea with its content (up to ~5 lines).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [draft.text]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Software keyboards: Enter inserts a newline, as in the LINE app; the button sends.
    if (prefersTouch()) return;
    // Japanese IME: Enter confirms the conversion — never send in the middle of it.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!empty && !disabled) onSend();
  };

  const removePhoto = (id: string) => onDraftChange({ ...draft, photos: draft.photos.filter((p) => p.id !== id) });

  return (
    <div className="relative z-10 border-t border-slate-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      {banner}
      {chips}

      {/* sender */}
      <div className="flex items-center gap-2 px-3 pt-1.5">
        <button
          type="button"
          onClick={onOpenSenderPicker}
          disabled={disabled}
          aria-haspopup="dialog"
          className="group inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2.5 text-left text-[12.5px] transition-colors hover:bg-slate-200"
        >
          {sender ? (
            <Avatar name={sender.name} color={sender.avatarColor} size="xs" />
          ) : (
            <span aria-hidden className="size-6 rounded-full bg-slate-300" />
          )}
          <span className="min-w-0 truncate">
            <span className="text-slate-500">送信者：</span>
            <span className="font-bold text-slate-900">{sender ? sender.name : "未選択"}</span>
            {sender && !sender.name.includes(ROLE_LABELS[sender.role]) && (
              <span className="text-slate-500">（{ROLE_LABELS[sender.role]}）</span>
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-slate-500 transition-transform group-hover:translate-y-px" aria-hidden />
          <span className="sr-only">（タップして送信者を変更）</span>
        </button>
        {isManager && group.kind !== "alerts" && (
          <span className="truncate text-[11px] text-slate-500">管理者の投稿には自動返信しません</span>
        )}
        <span className="ml-auto hidden shrink-0 items-center gap-1 text-[11px] text-slate-500 xl:flex">
          <Kbd>Enter</Kbd>で送信・<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd>で改行
        </span>
      </div>

      {/* attached photos */}
      {draft.photos.length > 0 && (
        <ul aria-label="添付する写真" className="flex gap-2 overflow-x-auto px-3 pt-2">
          {draft.photos.map((photo) => (
            <li key={photo.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs (sample SVGs / downscaled uploads) */}
              <img
                src={photo.src}
                alt={photo.alt}
                className="size-14 rounded-xl object-cover ring-1 ring-slate-200"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label={`添付を取り消す：${photo.alt}`}
                className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-slate-800 text-white shadow ring-2 ring-white transition-colors hover:bg-slate-950"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* input row */}
      <div className="flex items-end gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={onOpenPhotoPicker}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={
            draft.photos.length > 0
              ? `写真を添付（${draft.photos.length}枚選択中・最大${MAX_ATTACHED_PHOTOS}枚）`
              : "写真を添付"
          }
          title="写真を添付"
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        >
          <ImagePlus className="size-6" aria-hidden />
          {draft.photos.length > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 flex size-4.5 items-center justify-center rounded-full bg-line-strong text-[10px] font-bold text-white ring-2 ring-white"
            >
              {draft.photos.length}
            </span>
          )}
        </button>

        <label className="min-w-0 flex-1">
          <span className="sr-only">{`メッセージ（${group.name}）`}</span>
          <textarea
            ref={textareaRef}
            value={draft.text}
            onChange={(e) => onDraftChange({ ...draft, text: e.target.value })}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            enterKeyHint="enter"
            autoComplete="off"
            maxLength={1000}
            placeholder={disabled ? "メンバーが登録されていません" : "メッセージを入力"}
            className="block max-h-32 min-h-11 w-full resize-none rounded-[1.375rem] border-0 bg-slate-100 px-4 py-2.5 text-base leading-6 text-slate-900 outline-none ring-1 ring-inset ring-transparent transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-brand-500 sm:text-[15px]"
          />
        </label>

        <span className="relative shrink-0">
          {highlightSend && !empty && (
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-line/60" />
          )}
          <button
            type="button"
            onClick={onSend}
            // Keep the focus (and the phone keyboard) in the text field when tapping send.
            onPointerDown={(e) => {
              if (document.activeElement === textareaRef.current) e.preventDefault();
            }}
            disabled={empty || disabled}
            aria-label="送信"
            title="送信"
            className={cn(
              "relative flex size-11 items-center justify-center rounded-full transition-colors",
              empty || disabled
                ? "bg-slate-100 text-slate-400"
                : "bg-line-strong text-white shadow-sm hover:bg-line-deep active:bg-line-deep",
              highlightSend && !empty && "ring-4 ring-line/30",
            )}
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </span>
      </div>
    </div>
  );
}
