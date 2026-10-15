"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CircleCheck,
  ClipboardList,
  FileText,
  Gauge,
  ListChecks,
  Mail,
  MessagesSquare,
  Send,
  Settings,
  Store as StoreIcon,
} from "lucide-react";
import {
  BotAvatar,
  Button,
  ButtonLink,
  Callout,
  Card,
  CopyButton,
  PageHeader,
  Skeleton,
  toast,
} from "@/components/ui";
import { buildDailyReport } from "@/lib/engine";
import { formatDate, formatTime, isSameTokyoDay } from "@/lib/format";
import { useDemoStore, useHydrated } from "@/lib/store";
import { useNow, useStoreBoard, useTodayStats } from "@/lib/store/selectors";
import { BOT_ID } from "@/lib/seed";
import { CardSkeleton, HeaderSkeleton, LoadingStatus } from "../shell/AdminSkeleton";

/** First line of every report posted by the bot (see engine/report.ts). */
const REPORT_PREFIX = "📋 日次レポート";

/** /admin/report — today's summary as it will be posted to the managers' group. */
export function ReportScreen() {
  const hydrated = useHydrated();
  const now = useNow(15_000);
  if (!hydrated || now === null) return <ReportSkeleton />;
  return <ReportView now={now} />;
}

function ReportView({ now }: { now: number }) {
  const records = useDemoStore((s) => s.records);
  const issues = useDemoStore((s) => s.issues);
  const storeStatus = useDemoStore((s) => s.storeStatus);
  const settings = useDemoStore((s) => s.settings);
  const messages = useDemoStore((s) => s.messages);
  const postDailyReport = useDemoStore((s) => s.postDailyReport);
  const stats = useTodayStats(now);
  const board = useStoreBoard(now);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const text = useMemo(
    () => buildDailyReport({ records, issues, storeStatus, settings, now }),
    [records, issues, storeStatus, settings, now],
  );
  const alertsGroup = settings.groups.find((g) => g.kind === "alerts");
  const sentToday = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            m.senderId === BOT_ID &&
            m.groupId === alertsGroup?.id &&
            m.text.startsWith(REPORT_PREFIX) &&
            isSameTokyoDay(m.createdAt, now),
        )
        .reverse(),
    [messages, alertsGroup?.id, now],
  );
  const done = board?.filter((r) => r.status === "done").length ?? 0;
  const simulatorHref = alertsGroup ? `/demo?group=${encodeURIComponent(alertsGroup.id)}` : "/demo";

  const send = () => {
    if (!alertsGroup) return;
    postDailyReport();
    setSentAt(Date.now());
    toast("管理者グループに送信しました", "success", {
      description: `LINEシミュレーターの「${alertsGroup.name}」で確認できます。`,
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="日次レポート"
        icon={FileText}
        description="店舗ごとの清掃状況・本日のやりとり・対応待ちの案件を1通にまとめて、毎日決まった時刻に管理者グループへお送りします。"
      />

      {/* summary chips */}
      <dl className="grid grid-cols-3 gap-3">
        <Summary icon={StoreIcon} label="清掃完了" value={`${done}／${board?.length ?? 0}`} unit="店舗" />
        <Summary icon={ClipboardList} label="対応待ち" value={String(stats?.openIssues ?? 0)} unit="件" />
        <Summary
          icon={Gauge}
          label="自動対応率"
          value={stats?.autoRate == null ? "—" : String(Math.round(stats.autoRate * 100))}
          unit={stats?.autoRate == null ? "" : "%"}
        />
      </dl>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {sentAt !== null && (
            <Callout
              tone="success"
              title={`${formatTime(sentAt)} に管理者グループへ送信しました`}
              action={
                <ButtonLink href={simulatorHref} size="sm" variant="secondary" icon={MessagesSquare}>
                  シミュレーターで確認する
                </ButtonLink>
              }
            >
              「{alertsGroup?.name}」に、アシスタントからレポートが届いています。
            </Callout>
          )}

          <Card
            title="本日のレポート（プレビュー）"
            description={`${formatDate(now)} ${formatTime(now)} 時点の内容です。報告が届くたびに自動で更新されます。`}
            icon={ListChecks}
            footer={
              <>
                <CopyButton text={text} label="文章をコピー" />
                <Button variant="line" icon={Send} onClick={send} disabled={!alertsGroup}>
                  管理者グループに送信（デモ）
                </Button>
              </>
            }
          >
            {/* LINE-like preview of the post */}
            <div className="rounded-xl bg-chat p-3 sm:p-4">
              <p className="mb-3 text-center text-[11px] font-medium text-white/85">
                {alertsGroup?.name ?? "管理者グループ"}
              </p>
              <div className="flex items-start gap-2">
                <BotAvatar size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[11px] font-medium text-white/90">{settings.behavior.botName}</p>
                  <div className="flex items-end gap-1.5">
                    <p className="min-w-0 max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm">
                      {text}
                    </p>
                    <span className="shrink-0 pb-0.5 text-[10px] tabular-nums text-white/80">{formatTime(now)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title="本番での送信" icon={CalendarClock}>
            <p className="text-sm text-slate-600">毎日</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">
              {settings.behavior.dailyReportTime}
              <span className="ml-1 text-base font-semibold text-slate-600">に自動送信</span>
            </p>
            <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-slate-600">
              <li className="flex gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                <span>
                  送信先：<strong className="font-semibold text-slate-800">{alertsGroup?.name ?? "管理者グループ"}</strong>
                  （LINEグループ）
                </span>
              </li>
              <li className="flex gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                <span>ご希望があれば、メールやChatworkでも同じ内容を受け取れます。</span>
              </li>
              <li className="flex gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                <span>デモ版では自動送信はしていません。左のボタンから、いつでも送信を試せます。</span>
              </li>
            </ul>
            <Link
              href="/admin/settings"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-800 hover:underline"
            >
              <Settings className="size-4" aria-hidden />
              送信時刻を変更する（設定 → 動作設定）
            </Link>
          </Card>

          <Card title="レポートの内容" icon={ClipboardList}>
            <ol className="space-y-3 text-[13px] leading-relaxed text-slate-600">
              {[
                ["清掃状況", "店舗ごとに「完了・写真待ち・清掃中・未着手」と、報告の時刻・担当者"],
                ["本日のやりとり", "受信・自動返信・転送の件数、緊急の件数と自動対応率"],
                ["対応待ちの案件", "未対応・対応中の案件（最大10件）と、管理画面で残したメモ"],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-800 ring-1 ring-inset ring-brand-200"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <strong className="block font-semibold text-slate-800">{title}</strong>
                    {body}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {sentToday.length > 0 && (
            <Card title="本日の送信履歴" icon={Send}>
              <ul className="space-y-1.5 text-[13px] text-slate-700">
                {sentToday.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                    <span className="tabular-nums">{formatTime(m.createdAt)}</span>
                    <span className="text-slate-500">管理者グループへ送信済み</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: typeof StoreIcon;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3 sm:px-4">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 text-2xl font-bold text-slate-900">
        {value}
        {unit && <span className="ml-0.5 text-sm font-semibold text-slate-500">{unit}</span>}
      </dd>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingStatus />
      <HeaderSkeleton withActions={false} />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <CardSkeleton rows={6} />
        <div className="space-y-6">
          <CardSkeleton rows={2} />
          <CardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
