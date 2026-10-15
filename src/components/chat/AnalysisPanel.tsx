"use client";

import { useId, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Camera,
  CircleCheck,
  CircleMinus,
  ClipboardList,
  Cpu,
  Forward,
  GraduationCap,
  Hash,
  History,
  Hourglass,
  Info,
  KeyRound,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareReply,
  MessageSquareText,
  MessagesSquare,
  Phone,
  Sparkles,
  Store,
  TriangleAlert,
  WashingMachine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Avatar,
  BotAvatar,
  ButtonLink,
  CategoryBadge,
  ConfidenceMeter,
  DecisionSourceBadge,
  EmptyState,
  SampleAiBadge,
  UrgencyBadge,
} from "@/components/ui";
import { cn, formatPercent, formatTime } from "@/lib/format";
import { bufferKey, useDemoStore, type PendingEntry } from "@/lib/store";
import { effectiveCategory, effectiveUrgency, selectSender, useRecordActions } from "@/lib/store/selectors";
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  type AnalysisRecord,
  type DecisionSource,
  type Group,
  type Settings,
} from "@/lib/types";
import { describeActions, extraNotes, type ActionKind } from "./chatModel";

const ACTION_ICONS: Record<ActionKind, LucideIcon> = {
  reply: MessageSquareReply,
  forward: Forward,
  issue: ClipboardList,
  email: Mail,
  phone: Phone,
  chatwork: MessageSquareText,
  line: MessagesSquare,
  store: Store,
};

const SOURCE_EXPLANATIONS: Record<DecisionSource, string> = {
  ai: "文章の言い回しや店舗名・機械の番号などから、内容と緊急度を判断しました。",
  rule: "登録されている判定ルール（キーワード）に一致しました。",
  learned: "管理者が以前に修正した判定（手本）とよく似た内容のため、その判定に合わせました。",
  faq: "登録されている「よくある質問」に一致したため、登録済みの回答で返信しました。",
  fallback: "判断できる手がかりが少ないため、推測で返信せず、人に確認を回しました。",
};

/* ------------------------------------------------------------------ */
/* Small parts                                                         */
/* ------------------------------------------------------------------ */

function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-slate-500">
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </h3>
  );
}

function FactChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-[12px] ring-1 ring-inset ring-slate-200">
      <Icon className="size-3.5 shrink-0 text-slate-500" aria-hidden />
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-semibold text-slate-800">{value}</span>
    </li>
  );
}

/** 「判断の理由」 labelled 「AI判定（サンプル）」, with an explanation toggle (sample now, Claude in production). */
function Reasoning({ record }: { record: AnalysisRecord }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { source, sample, reasoning } = record.analysis;
  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-slate-500">
          <Sparkles className="size-3.5" aria-hidden />
          判断の理由
        </h3>
        {sample ? <SampleAiBadge size="sm" /> : <DecisionSourceBadge source="ai" size="sm" />}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${id}-about`}
          title="AI判定（サンプル）について"
          className="ml-auto inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <Info className="size-3.5" aria-hidden />
          {open ? "閉じる" : "この判定について"}
        </button>
      </div>
      <div
        id={`${id}-about`}
        hidden={!open}
        className="mb-2 space-y-1.5 rounded-xl bg-violet-50 p-3 text-[12px] leading-relaxed text-violet-950 ring-1 ring-inset ring-violet-100"
      >
        <p>{SOURCE_EXPLANATIONS[source]}</p>
        {sample ? (
          <p className="flex gap-1.5">
            <Cpu className="mt-0.5 size-3.5 shrink-0 text-violet-600" aria-hidden />
            <span>
              このデモでは、本番のAIにつなぐ前でも動きを確かめられるよう、用意した判定ルールでAIの判定を再現しています（サンプル）。本番では、Anthropic社のAI「Claude」が文章の意味を読み取って判定します。迷ったときは必ず人に回します。
            </span>
          </p>
        ) : (
          <p>本番のAI（Claude）による判定です。</p>
        )}
      </div>
      <p className="rounded-xl bg-linear-to-br from-violet-50 to-white p-3 text-[13px] leading-relaxed text-slate-800 ring-1 ring-inset ring-violet-100">
        {reasoning}
      </p>
    </section>
  );
}

function storeName(settings: Settings, storeId: string | undefined): string | undefined {
  return storeId ? settings.stores.find((s) => s.id === storeId)?.name : undefined;
}

/* ------------------------------------------------------------------ */
/* In-progress states                                                  */
/* ------------------------------------------------------------------ */

function Judging() {
  return (
    <div role="status" className="animate-pop-in rounded-2xl bg-violet-50 p-3.5 ring-1 ring-inset ring-violet-100">
      <p className="flex items-center gap-2 text-[13px] font-bold text-violet-900">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        AIが内容を読み取っています…
      </p>
      <ol className="mt-2 space-y-1 text-[12px] text-violet-800/90">
        <li className="flex items-center gap-1.5">
          <CircleCheck className="size-3.5" aria-hidden />
          内容と緊急度を判定
        </li>
        <li className="flex items-center gap-1.5">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          返信文と通知先を決めています
        </li>
      </ol>
    </div>
  );
}

function Waiting({ entries }: { entries: readonly PendingEntry[] }) {
  const flushPending = useDemoStore((s) => s.flushPending);
  return (
    <div className="animate-pop-in rounded-2xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-100">
      <p className="flex items-center gap-2 text-[13px] font-bold text-amber-900">
        <Hourglass className="size-4" aria-hidden />
        続けて写真やコメントが届くのを待っています
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-amber-900/80">
        別々に届いた写真とコメントを、ひとつの報告として判定するためです。
      </p>
      <button
        type="button"
        onClick={() => entries.forEach((e) => flushPending(bufferKey(e.groupId, e.senderId)))}
        className="mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-brand-700 px-3 text-[12px] font-bold text-white transition-colors hover:bg-brand-800"
      >
        <Zap className="size-3.5" aria-hidden />
        すぐ判定する
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record                                                              */
/* ------------------------------------------------------------------ */

function RecordDetails({ record }: { record: AnalysisRecord }) {
  // The panel is rendered twice (desktop column + phone sheet), so ids must be unique per instance.
  const uid = useId();
  const settings = useDemoStore((s) => s.settings);
  const actions = useRecordActions(record);
  const { analysis } = record;
  const sender = selectSender(settings, record.senderId);
  const group = settings.groups.find((g) => g.id === record.groupId);
  const category = analysis.category;
  const facts = analysis.extracted;
  const store = storeName(settings, facts.storeId);
  const items = actions ? describeActions(actions, settings) : [];
  const notes = extraNotes(record);
  const threshold = settings.behavior.confidenceThreshold;
  const secondary = analysis.secondary.filter((c) => c !== category);
  // 「?」 alone is a valid trigger but means nothing to the owner as a chip.
  const keywords = facts.keywords.filter((kw) => !/^[\p{P}\p{S}\s]+$/u.test(kw));

  return (
    <div key={record.id} className="animate-pop-in space-y-5">
      {/* the message */}
      <section aria-label="判定したメッセージ" className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/70">
        <div className="flex items-center gap-2">
          {sender.isBot ? <BotAvatar size="xs" /> : <Avatar name={sender.name} color={sender.color} size="xs" />}
          <p className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
            <span className="font-bold text-slate-800">{sender.name}</span>
            {group && <span>・{group.name}</span>}
          </p>
          <time className="shrink-0 text-[11px] tabular-nums text-slate-500">{formatTime(record.createdAt)}</time>
        </div>
        {record.combinedText ? (
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
            {record.combinedText}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-slate-500">（写真のみの投稿）</p>
        )}
        {(record.photoCount > 0 || record.messageIds.length > 1) && (
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-medium text-slate-500">
            {record.photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="size-3.5" aria-hidden />
                写真{record.photoCount}枚
              </span>
            )}
            {record.messageIds.length > 1 && (
              <span className="inline-flex items-center gap-1 text-violet-700">
                <Sparkles className="size-3.5" aria-hidden />
                {record.messageIds.length}件の投稿をまとめて判定
              </span>
            )}
          </p>
        )}
      </section>

      {/* result */}
      <section aria-label="判定結果" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={category} />
          <UrgencyBadge urgency={analysis.urgency} />
          {secondary.length > 0 && (
            <span className="text-[11.5px] text-slate-500">
              ほかに検出：{secondary.map((c) => CATEGORY_LABELS[c]).join("・")}
            </span>
          )}
        </div>
        {record.correctedCategory && record.correctedCategory !== category && (
          <p className="flex items-start gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-[12px] leading-relaxed text-brand-900 ring-1 ring-inset ring-brand-100">
            <GraduationCap className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              管理者が「{CATEGORY_LABELS[record.correctedCategory]}」に修正しました。次回から、同じような内容はこの判定になります。
            </span>
          </p>
        )}
        {analysis.source !== "ai" && (
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
            判定の根拠：
            <DecisionSourceBadge source={analysis.source} sample={analysis.sample} size="sm" />
          </p>
        )}
        <div>
          <ConfidenceMeter value={analysis.confidence} threshold={threshold} />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            確信度が{formatPercent(threshold)}を下回るときは、無理に判断せず「判定保留」として人に回します。
          </p>
        </div>
      </section>

      <Reasoning record={record} />

      {/* extracted facts */}
      {(store || facts.machine || facts.errorCode || facts.days !== undefined || facts.hasPhoto || keywords.length > 0) && (
        <section aria-labelledby={`${uid}-facts`}>
          <SectionTitle icon={KeyRound}>
            <span id={`${uid}-facts`}>読み取った情報</span>
          </SectionTitle>
          <ul className="flex flex-wrap gap-1.5">
            {store && <FactChip icon={MapPin} label="店舗" value={store} />}
            {facts.machine && <FactChip icon={WashingMachine} label="機械" value={facts.machine} />}
            {facts.errorCode && <FactChip icon={TriangleAlert} label="エラー" value={facts.errorCode} />}
            {facts.days !== undefined && <FactChip icon={History} label="期間" value={`${facts.days}日`} />}
            {facts.hasPhoto && <FactChip icon={Camera} label="写真" value={`${record.photoCount || 1}枚`} />}
            {keywords.slice(0, 8).map((kw) => (
              <FactChip key={kw} icon={Hash} label="反応した言葉" value={`「${kw}」`} />
            ))}
          </ul>
        </section>
      )}

      {/* actions */}
      <section aria-labelledby={`${uid}-actions`}>
        <SectionTitle icon={CircleCheck}>
          <span id={`${uid}-actions`}>アシスタントが行った対応</span>
        </SectionTitle>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {items.map((item, i) => {
            const Icon = ACTION_ICONS[item.kind];
            return (
              <li key={`${item.kind}-${i}`} className={cn("flex items-start gap-2.5 px-3 py-2.5", !item.done && "bg-slate-50/70")}>
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                    item.done
                      ? item.kind === "forward" || item.kind === "phone"
                        ? analysis.urgency === "urgent"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("flex items-center gap-1.5 text-[13px] font-bold", item.done ? "text-slate-900" : "text-slate-500")}>
                    {item.label}
                    {item.done ? (
                      <CircleCheck className="size-3.5 text-emerald-600" aria-hidden />
                    ) : (
                      <CircleMinus className="size-3.5 text-slate-300" aria-hidden />
                    )}
                    <span className="sr-only">{item.done ? "（実行済み）" : "（なし）"}</span>
                  </p>
                  {item.detail && (
                    <p className={cn("mt-0.5 text-[12px] leading-relaxed", item.done ? "text-slate-600" : "text-slate-500")}>
                      {item.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-slate-500">
            {notes.map((note) => (
              <li key={note} className="flex gap-1.5">
                <span aria-hidden>・</span>
                {note}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* links */}
      <section className="space-y-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/admin/logs?record=${encodeURIComponent(record.id)}`} variant="secondary" size="sm" icon={History}>
            判定ログで見る
          </ButtonLink>
          {actions?.issue && (
            <ButtonLink href="/admin" variant="secondary" size="sm" icon={ClipboardList} iconRight={ArrowRight}>
              要対応リストを見る
            </ButtonLink>
          )}
        </div>
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          判定が違うときは、管理画面の「判定ログ」から直せます。直した内容は、次回からの判断の手本になります。
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export interface AnalysisPanelProps {
  group: Group;
  record: AnalysisRecord | undefined;
  /** true while showing the group's latest judgement (false = a message the visitor clicked) */
  following: boolean;
  onShowLatest?: () => void;
  /** the assistant is preparing an answer in this group */
  typing: boolean;
  /** buffers waiting for a follow-up photo / comment in this group */
  pending: readonly PendingEntry[];
  /** "sheet" = inside the phone bottom sheet (the sheet provides the title) */
  variant?: "aside" | "sheet";
  className?: string;
}

/** 「AI判定パネル」: how the latest (or the selected) message was judged and what the assistant did. */
export function AnalysisPanel({
  group,
  record,
  following,
  onShowLatest,
  typing,
  pending,
  variant = "aside",
  className,
}: AnalysisPanelProps) {
  const busy = typing || pending.length > 0;
  const latestLabel =
    group.kind === "alerts" ? "最新の通知の判定を表示しています" : "このグループの最新の判定を表示しています";
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {variant === "aside" && (
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 pb-3.5 pt-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-brand-600 text-white shadow-sm">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-900">AI判定パネル</h2>
            <p className="text-[12px] text-slate-500">
              {following ? latestLabel : "選択したメッセージの判定を表示しています"}
            </p>
          </div>
        </header>
      )}

      <div className={cn("relative min-h-0 flex-1 space-y-4", variant === "aside" && "overflow-y-auto overscroll-contain px-5 py-4")}>
        {variant === "sheet" && (
          <p className="text-[12px] text-slate-500">
            {following ? `${latestLabel}。` : "選択したメッセージの判定を表示しています。"}
          </p>
        )}
        {!following && onShowLatest && (
          <button
            type="button"
            onClick={onShowLatest}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-slate-100 px-3 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            <ArrowRight className="size-3.5" aria-hidden />
            最新の判定に戻る
          </button>
        )}

        {typing ? <Judging /> : pending.length > 0 ? <Waiting entries={pending} /> : null}

        {record ? (
          <div className={cn(busy && following && "opacity-60 transition-opacity")}>
            {busy && following && (
              <p className="mb-2 text-[11px] font-semibold text-slate-500">ひとつ前の判定</p>
            )}
            <RecordDetails record={record} />
          </div>
        ) : (
          !busy && (
            <EmptyState
              compact
              icon={Sparkles}
              title={group.kind === "alerts" ? "まだ転送された通知はありません" : "まだ判定はありません"}
              description={
                group.kind === "alerts"
                  ? "清掃スタッフやコールセンターのグループで緊急・要対応の内容を送ると、ここに判定結果が表示されます。"
                  : "メッセージを送ると、AIがどう判断したか（分類・緊急度・理由・行った対応）がここに表示されます。"
              }
            />
          )
        )}

        {record && (
          <p className="sr-only" aria-live="polite">
            {`判定結果：${CATEGORY_LABELS[effectiveCategory(record)]}、${URGENCY_LABELS[effectiveUrgency(record)]}`}
          </p>
        )}
      </div>
    </div>
  );
}
