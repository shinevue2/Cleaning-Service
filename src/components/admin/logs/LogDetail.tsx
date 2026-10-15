"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  BookOpen,
  Bot,
  ClipboardList,
  Forward,
  GraduationCap,
  Lightbulb,
  MessagesSquare,
  PenLine,
  Reply,
  ScanSearch,
  Store as StoreIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  CHANNEL_ICONS,
  CategoryBadge,
  ConfidenceMeter,
  DecisionSourceBadge,
  IssueStatusBadge,
  UrgencyBadge,
} from "@/components/ui";
import { faqById, findFaq, normalize } from "@/lib/engine";
import { cn, formatDateTime, formatPercent, formatTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { cleanAlertTitle } from "@/lib/store/pipeline";
import { selectMessagesByIds, useRecordActions, type SenderInfo } from "@/lib/store/selectors";
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  CLEANING_STATUS_LABELS,
  ROLE_LABELS,
  type AnalysisRecord,
  type Group,
} from "@/lib/types";
import type { LogJudgement } from "./logUtils";

export interface LogDetailProps {
  id: string;
  record: AnalysisRecord;
  judgement: LogJudgement;
  sender: SenderInfo;
  group?: Group;
  onCorrect: () => void;
  onRegisterFaq: () => void;
}

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl bg-white p-3.5 ring-1 ring-slate-200/80 sm:p-4", className)}>
      <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
        <Icon className="size-4 text-brand-700" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-1.5 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  done,
  children,
}: {
  icon: LucideIcon;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          done ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200" : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-bold", done ? "text-slate-900" : "text-slate-500")}>
          {title}
          <span className="sr-only">{done ? "（実行済み）" : "（実行なし）"}</span>
        </p>
        <div className="mt-1 text-[13px] leading-relaxed text-slate-600">{children}</div>
      </div>
    </li>
  );
}

export function LogDetail({ id, record, judgement, sender, group, onCorrect, onRegisterFaq }: LogDetailProps) {
  const actions = useRecordActions(record);
  const messages = useDemoStore((s) => s.messages);
  const settings = useDemoStore((s) => s.settings);
  const { analysis, plan } = record;
  const ex = analysis.extracted;

  const photos = useMemo(
    () => selectMessagesByIds(messages, record.messageIds).flatMap((m) => m.photos),
    [messages, record.messageIds],
  );
  const store = ex.storeId ? settings.stores.find((s) => s.id === ex.storeId) : undefined;
  const usedFaq = analysis.faqId ? faqById(settings, analysis.faqId) : undefined;
  const statusStore = plan.storeStatus ? settings.stores.find((s) => s.id === plan.storeStatus?.storeId) : undefined;
  const alertsGroupNames = (actions?.alerts ?? [])
    .map((a) => settings.groups.find((g) => g.id === a.groupId)?.name)
    .filter((n): n is string => Boolean(n));
  const threshold = settings.behavior.confidenceThreshold;

  const isQuestion = judgement.category === "question" || analysis.category === "question";
  const hasText = normalize(record.combinedText) !== "";
  const existingFaq = isQuestion && hasText && !analysis.faqId ? findFaq(normalize(record.combinedText), settings.faqs) : undefined;
  const canRegisterFaq = isQuestion && hasText && !analysis.faqId && !existingFaq;

  return (
    <div id={id} className="border-t border-slate-100 bg-slate-50/80 px-3 py-4 sm:px-5">
      {judgement.corrected && (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-[13px] leading-relaxed text-brand-950 ring-1 ring-inset ring-brand-200">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          <p>
            管理者が「{CATEGORY_LABELS[analysis.category]}」から「{CATEGORY_LABELS[judgement.category]}」に修正しました
            {record.correctedAt !== undefined && `（${formatDateTime(record.correctedAt)}）`}。
            {hasText
              ? "同じような内容は、次回からこの判定になります。"
              : "写真のみの投稿のため、判定の手本には保存していません。"}
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---- judgement ---- */}
        <Section title={judgement.corrected ? "AIの判定（修正前）" : "AIの判定"} icon={Bot}>
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={analysis.category} size="sm" />
            <UrgencyBadge urgency={analysis.urgency} size="sm" />
            <DecisionSourceBadge source={analysis.source} sample={analysis.sample} size="sm" />
          </div>
          <ConfidenceMeter value={analysis.confidence} threshold={threshold} className="mt-3" />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            確信度が {formatPercent(threshold)} を下回ると「判定保留」として人に回します（線の位置）。
          </p>
          <div className="mt-3 rounded-lg bg-violet-50/60 px-3 py-2.5 ring-1 ring-inset ring-violet-100">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-violet-800">
              <Lightbulb className="size-3.5" aria-hidden />
              判断の理由
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-800">{analysis.reasoning || "—"}</p>
          </div>
          {analysis.secondary.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">ほかに読み取った内容</span>
              {analysis.secondary.map((c) => (
                <CategoryBadge key={c} category={c} size="sm" />
              ))}
            </div>
          )}
          {usedFaq && !plan.notes.some((n) => n.includes(usedFaq.question)) && (
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
              <BookOpen className="mt-px size-3.5 shrink-0 text-sky-700" aria-hidden />
              よくある質問「{usedFaq.question}」の回答を使いました。
            </p>
          )}
        </Section>

        {/* ---- extracted facts ---- */}
        <Section title="読み取った情報" icon={ScanSearch}>
          <dl className="divide-y divide-slate-100">
            <Fact label="送信者">
              {sender.shortName}
              <span className="ml-1 text-xs font-normal text-slate-500">
                （{sender.role === "bot" ? "アシスタント" : ROLE_LABELS[sender.role]}）
              </span>
            </Fact>
            <Fact label="グループ">{group?.name ?? "（削除されたグループ）"}</Fact>
            <Fact label="店舗">{store?.name ?? <span className="text-slate-500">特定できませんでした</span>}</Fact>
            {ex.machine && <Fact label="機械">{ex.machine}</Fact>}
            {ex.errorCode && <Fact label="エラーコード">{ex.errorCode}</Fact>}
            {ex.days !== undefined && <Fact label="日数">{ex.days}日</Fact>}
            <Fact label="写真">{record.photoCount > 0 ? `${record.photoCount}枚` : "なし"}</Fact>
            {ex.keywords.length > 0 && (
              <Fact label="反応した言葉">
                <span className="flex flex-wrap gap-1">
                  {ex.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"
                    >
                      {k === "?" ? "？（質問の形）" : k}
                    </span>
                  ))}
                </span>
              </Fact>
            )}
          </dl>
          {photos.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="添付された写真">
              {photos.map((p) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs from the simulator; next/image adds nothing here */}
                  <img
                    src={p.src}
                    alt={p.alt}
                    loading="lazy"
                    className="h-20 w-28 rounded-lg object-cover ring-1 ring-slate-200 sm:h-24 sm:w-32"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ---- what the assistant did ---- */}
        <Section title="アシスタントが行ったこと" icon={ClipboardList} className="lg:col-span-2">
          <ul className="grid gap-4 md:grid-cols-2">
            <ActionRow icon={Reply} title="自動返信" done={Boolean(actions?.reply ?? plan.reply)}>
              {actions?.reply || plan.reply ? (
                <div className="space-y-1">
                  <p className="w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2 text-[13px] text-slate-800">
                    {actions?.reply?.text ?? plan.reply}
                  </p>
                  {actions?.reply && (
                    <p className="text-[11px] text-slate-500">{formatTime(actions.reply.createdAt)} にグループへ返信</p>
                  )}
                </div>
              ) : plan.notes.some((n) => n.includes("重ねての返信は省略")) ? (
                "返信していません（同じ完了報告の写真に、すでにお礼を返信しています）。"
              ) : (
                "返信していません（返信が不要な内容と判断しました）。"
              )}
            </ActionRow>

            <ActionRow icon={Forward} title="管理者へ転送" done={plan.forward !== null}>
              {plan.forward ? (
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <UrgencyBadge urgency={plan.forward.urgency} size="sm" />
                    <span className="font-semibold text-slate-800">{cleanAlertTitle(plan.forward.title)}</span>
                  </p>
                  {alertsGroupNames.length > 0 && <p>送信先：{alertsGroupNames.join("、")}</p>}
                  {actions && actions.deliveries.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 pt-0.5">
                      {actions.deliveries.map((d) => {
                        const Icon = CHANNEL_ICONS[d.channel];
                        const target = settings.notifyTargets.find((t) => t.id === d.targetId);
                        return (
                          <li key={d.id}>
                            <Badge tone="gray" size="sm" icon={Icon}>
                              {target?.name ?? CHANNEL_LABELS[d.channel]}にも通知
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                "転送していません（担当者の対応は不要と判断しました）。"
              )}
            </ActionRow>

            <ActionRow icon={ClipboardList} title="要対応リストに登録" done={Boolean(actions?.issue)}>
              {actions?.issue ? (
                <p className="flex flex-wrap items-center gap-1.5">
                  <IssueStatusBadge status={actions.issue.status} size="sm" />
                  <span>{actions.issue.title}</span>
                  {actions.issue.status !== "resolved" && (
                    <Link href="/admin#issues" className="font-semibold text-brand-800 hover:underline">
                      要対応リストへ
                    </Link>
                  )}
                </p>
              ) : (
                "登録していません。"
              )}
            </ActionRow>

            <ActionRow icon={StoreIcon} title="店舗の清掃状況" done={Boolean(plan.storeStatus)}>
              {plan.storeStatus
                ? `${statusStore?.name ?? "店舗"}を「${CLEANING_STATUS_LABELS[plan.storeStatus.status]}」に更新しました。`
                : "変更していません。"}
            </ActionRow>
          </ul>
          {plan.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
              {plan.notes.map((note) => (
                <li key={note} className="flex gap-1.5">
                  <span aria-hidden className="text-brand-600">
                    ●
                  </span>
                  {note}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={PenLine} onClick={onCorrect}>
          判定を修正
        </Button>
        {canRegisterFaq && (
          <Button variant="secondary" icon={BookmarkPlus} onClick={onRegisterFaq}>
            この質問をFAQに登録
          </Button>
        )}
        {existingFaq && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <BookOpen className="size-3.5 text-sky-700" aria-hidden />
            よくある質問「{existingFaq.faq.question}」で、次回から自動で回答します
          </span>
        )}
        <ButtonLink
          href={`/demo?group=${encodeURIComponent(record.groupId)}`}
          variant="ghost"
          icon={MessagesSquare}
          className="sm:ml-auto"
        >
          シミュレーターで見る
        </ButtonLink>
      </div>
    </div>
  );
}
