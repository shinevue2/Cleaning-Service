"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, MessagesSquare } from "lucide-react";
import { ButtonLink, CHANNEL_ICONS, Card, EmptyState, UrgencyBadge } from "@/components/ui";
import { cn, formatRelative } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { cleanAlertTitle } from "@/lib/store/pipeline";
import { selectRecordIndex, selectRecordForMessage, selectSender, useRecentAlerts } from "@/lib/store/selectors";
import { CHANNEL_LABELS, type Delivery } from "@/lib/types";

const ALERT_LIMIT = 5;

export function RecentAlerts({ now }: { now: number }) {
  const alerts = useRecentAlerts(ALERT_LIMIT);
  const records = useDemoStore((s) => s.records);
  const deliveries = useDemoStore((s) => s.deliveries);
  const settings = useDemoStore((s) => s.settings);

  const recordIndex = useMemo(() => selectRecordIndex(records), [records]);
  const deliveriesByRecord = useMemo(() => {
    const map = new Map<string, Delivery[]>();
    for (const d of deliveries) map.set(d.recordId, [...(map.get(d.recordId) ?? []), d]);
    return map;
  }, [deliveries]);
  const alertsGroup = settings.groups.find((g) => g.kind === "alerts");

  return (
    <Card
      title="最近の転送"
      description="管理者グループに届いた内容です。"
      icon={BellRing}
      flush
      footer={
        <ButtonLink
          href={alertsGroup ? `/demo?group=${encodeURIComponent(alertsGroup.id)}` : "/demo"}
          variant="ghost"
          size="sm"
          icon={MessagesSquare}
        >
          管理者グループを開く
        </ButtonLink>
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          compact
          icon={BellRing}
          title="転送はまだありません"
          description="「要対応」「緊急」と判断した連絡は、管理者グループへ自動で転送されます。"
          className="pb-6"
        />
      ) : (
        <ul className="space-y-2.5 px-4 pb-4 sm:px-5 sm:pb-5">
          {alerts.map((message) => {
            if (!message.alert) return null;
            const { urgency, title, sourceGroupId } = message.alert;
            const record = selectRecordForMessage(records, message, recordIndex);
            const sender = record ? selectSender(settings, record.senderId) : undefined;
            const group = settings.groups.find((g) => g.id === sourceGroupId);
            const sent = record ? (deliveriesByRecord.get(record.id) ?? []) : [];
            const urgent = urgency === "urgent";
            return (
              <li
                key={message.id}
                className={cn(
                  "relative rounded-xl border p-3 pl-4",
                  urgent ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/50",
                )}
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", urgent ? "bg-red-500" : "bg-amber-400")}
                />
                <div className="flex items-center gap-2">
                  <UrgencyBadge urgency={urgency} size="sm" />
                  <span className="ml-auto text-xs tabular-nums text-slate-500">
                    {formatRelative(message.createdAt, now)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold leading-snug text-slate-900">{cleanAlertTitle(title)}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {[group?.name, sender ? `${sender.shortName}さん` : undefined].filter(Boolean).join("・")}
                </p>
                {sent.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="ほかの通知先">
                    {sent.map((d) => {
                      const Icon = CHANNEL_ICONS[d.channel];
                      const target = settings.notifyTargets.find((t) => t.id === d.targetId);
                      return (
                        <li
                          key={d.id}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"
                        >
                          <Icon className="size-3 text-slate-500" aria-hidden />
                          {target?.name ?? CHANNEL_LABELS[d.channel]}にも通知
                        </li>
                      );
                    })}
                  </ul>
                )}
                {record && (
                  <Link
                    href={`/admin/logs?record=${encodeURIComponent(record.id)}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-800 hover:underline"
                  >
                    判定の詳細を見る
                    <span className="sr-only">（{cleanAlertTitle(title)}）</span>
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
