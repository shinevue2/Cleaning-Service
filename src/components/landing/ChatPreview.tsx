import type { ReactNode } from "react";
import { BellRing, Camera, ChevronLeft, CircleCheck, Menu, Plus, Search, SendHorizontal, Sparkles } from "lucide-react";
import { Avatar, BotAvatar, CategoryBadge, ConfidenceMeter, UrgencyBadge } from "@/components/ui";
import { cn } from "@/lib/format";

/*
 * Static, "live-looking" preview of the simulator for the landing hero.
 * Messages fade in one after another with pure CSS (no JS); reduced-motion users see the final state.
 */

const BOT_NAME = "ランドリーアシスタント";

function Reveal({ delay, children, className }: { delay: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-msg-in", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Meta({ time, read }: { time: string; read?: string }) {
  return (
    <span className="flex shrink-0 flex-col items-end justify-end pb-0.5 text-[9px] leading-tight text-white/85">
      {read && <span>{read}</span>}
      <span>{time}</span>
    </span>
  );
}

function OwnBubble({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex items-end justify-end gap-1.5 pl-10">
      <Meta time={time} read="既読 3" />
      <p className="rounded-2xl rounded-tr-md bg-line px-3 py-2 text-[12.5px] leading-relaxed text-slate-950 shadow-sm">
        {text}
      </p>
    </div>
  );
}

function OtherBubble({
  name,
  avatar,
  time,
  children,
}: {
  name: string;
  avatar: ReactNode;
  time: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 pr-8">
      <span className="pt-0.5">{avatar}</span>
      <div className="min-w-0">
        <p className="mb-0.5 text-[10px] font-medium text-white/90">{name}</p>
        <div className="flex items-end gap-1.5">
          <div className="min-w-0 space-y-1">{children}</div>
          <Meta time={time} />
        </div>
      </div>
    </div>
  );
}

function TextBubble({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[12.5px] leading-relaxed text-slate-800 shadow-sm">
      {children}
    </p>
  );
}

/** Simple illustration of laundry left in a washer (no external images). */
function LeftoverPhoto() {
  return (
    <svg viewBox="0 0 160 104" className="block h-auto w-36 rounded-xl shadow-sm" aria-hidden>
      <rect width="160" height="104" fill="#e2e8f0" />
      <rect y="86" width="160" height="18" fill="#cbd5e1" />
      <rect x="40" y="10" width="80" height="84" rx="8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      <rect x="46" y="16" width="68" height="11" rx="3" fill="#e2e8f0" />
      <circle cx="106" cy="21.5" r="3" fill="#06b6a4" />
      <rect x="50" y="18" width="16" height="7" rx="2" fill="#0f172a" />
      <text x="58" y="23.6" fontSize="6" fill="#fde68a" textAnchor="middle" fontFamily="sans-serif" fontWeight="700">
        No.4
      </text>
      <circle cx="80" cy="60" r="25" fill="#cbd5e1" stroke="#64748b" strokeWidth="3" />
      <circle cx="80" cy="60" r="19" fill="#dbeafe" />
      <path d="M63 66c6-12 15-7 18-3 4-8 14-7 16 3-3 8-12 9-17 6-6 6-14 3-17-6z" fill="#f472b6" />
      <path d="M66 53c8-7 17-6 22 0-7 5-15 5-22 0z" fill="#fbbf24" />
      <path d="M78 47c6-3 12-2 15 3-5 2-10 2-15-3z" fill="#60a5fa" />
      <circle cx="73" cy="52" r="5" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" />
      <rect x="112" y="64" width="34" height="16" rx="3" fill="#fef3c7" stroke="#f59e0b" />
      <text x="129" y="75" fontSize="8" fill="#92400e" textAnchor="middle" fontFamily="sans-serif" fontWeight="700">
        3日目
      </text>
    </svg>
  );
}

export function ChatPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[22rem] lg:mr-0">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] bg-linear-to-br from-brand-200/70 via-sky-100/60 to-transparent blur-2xl"
      />

      <figure
        role="img"
        aria-label="デモ画面のイメージ：スタッフの「清掃に入ります」にアシスタントが自動で返信し、洗濯物の放置の報告は「要対応」として管理者へ転送されています。"
        className="relative rounded-[2.4rem] bg-slate-900 p-2.5 shadow-2xl shadow-slate-900/25"
      >
        <div className="overflow-hidden rounded-[1.9rem] bg-chat">
          {/* chat header */}
          <div className="flex items-center gap-2 bg-white/95 px-3 py-2.5 text-slate-800">
            <ChevronLeft className="size-5 text-slate-500" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold">【清掃】スタッフ連絡（5）</p>
            <Search className="size-4 text-slate-500" />
            <Menu className="size-4 text-slate-500" />
          </div>

          {/* messages */}
          <div className="relative flex h-[25rem] flex-col justify-end gap-3 overflow-hidden px-3 pb-3 pt-4">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-linear-to-b from-chat to-transparent" />
            <Reveal delay={150} className="self-center">
              <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-[10px] font-medium text-white">今日</span>
            </Reveal>

            <Reveal delay={400}>
              <OwnBubble text="駅前店、これから清掃に入ります" time="8:02" />
            </Reveal>

            <Reveal delay={1300}>
              <OtherBubble name={BOT_NAME} avatar={<BotAvatar size="sm" />} time="8:02">
                <TextBubble>田中さん、よろしくお願いします！駅前店の清掃、お気をつけて🙏</TextBubble>
              </OtherBubble>
            </Reveal>

            <Reveal delay={2300}>
              <OtherBubble name="佐藤" avatar={<Avatar name="佐藤" color="#10b981" size="sm" />} time="9:15">
                <LeftoverPhoto />
                <TextBubble>北口店、4番の洗濯機に洗濯物が3日間出しっぱなしです</TextBubble>
              </OtherBubble>
            </Reveal>

            <Reveal delay={3300}>
              <OtherBubble name={BOT_NAME} avatar={<BotAvatar size="sm" />} time="9:15">
                <TextBubble>
                  ご報告ありがとうございます。北口店の洗濯機4番の件、担当者に共有しました。対応方法が決まり次第お知らせします。
                </TextBubble>
              </OtherBubble>
            </Reveal>
          </div>

          {/* composer (decorative) */}
          <div className="flex items-center gap-2 bg-white px-3 py-2.5">
            <Plus className="size-5 text-slate-400" />
            <Camera className="size-5 text-slate-400" />
            <span className="flex h-8 flex-1 items-center rounded-full bg-slate-100 px-3 text-[11px] text-slate-500">
              メッセージを入力
            </span>
            <SendHorizontal className="size-5 text-slate-300" />
          </div>
        </div>
      </figure>

      {/* floating: forwarded alert, shown like a push-notification banner over the phone header */}
      <Reveal delay={3900} className="absolute inset-x-3 -top-4 z-10 sm:-right-14 sm:-top-12 sm:left-auto sm:w-60">
        <div
          aria-hidden
          className="flex animate-float items-start gap-2.5 rounded-2xl bg-white/95 p-3 shadow-xl shadow-slate-900/20 ring-1 ring-slate-200 backdrop-blur"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <BellRing className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-500">【管理者】緊急・要対応通知 ・ 今</p>
            <p className="mt-0.5 truncate text-[12px] font-bold text-slate-900">⚠️ 要対応：北口店 洗濯機4番</p>
            <p className="truncate text-[10.5px] text-slate-600">報告者：佐藤 ／ 放置・忘れ物</p>
          </div>
        </div>
      </Reveal>

      {/* floating: AI judgement card — overlaps only the (decorative) composer */}
      <Reveal delay={2900} className="relative z-10 mx-auto -mt-14 w-[90%] sm:-ml-10 sm:w-72 lg:-ml-16">
        <div aria-hidden className="rounded-2xl bg-white/95 p-3.5 shadow-xl shadow-slate-900/15 ring-1 ring-slate-200 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700">
              <Sparkles className="size-3.5" />
              AI判定（サンプル）
            </p>
            <span className="text-[10px] text-slate-500">9:15</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CategoryBadge category="leftover" size="sm" />
            <UrgencyBadge urgency="attention" size="sm" />
          </div>
          <ConfidenceMeter value={0.91} className="mt-2.5" />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            「出しっぱなし」「3日間」という表現から、洗濯物が長期間放置されていると判断しました。
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-700">
            {["自動返信", "管理者へ転送", "要対応リストに登録"].map((label) => (
              <li key={label} className="flex items-center gap-1">
                <CircleCheck className="size-3.5 text-emerald-600" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}
