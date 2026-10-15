"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CircleCheckBig, ClipboardList, NotebookPen, Play, StickyNote, Store as StoreIcon } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CategoryBadge,
  EmptyState,
  Select,
  Tabs,
  UrgencyBadge,
  toast,
} from "@/components/ui";
import { cn, formatRelative, formatTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { isToday, selectSender, useOpenIssues } from "@/lib/store/selectors";
import { type AnalysisRecord, type Issue, type IssueStatus, type Settings, type Urgency } from "@/lib/types";
import { ISSUE_STATUS_OPTIONS, IssueMemoModal } from "./IssueMemoModal";

type View = "open" | "resolved";

const STRIPE: Record<Urgency, string> = {
  urgent: "bg-red-500",
  attention: "bg-amber-400",
  normal: "bg-slate-300",
};

const STATUS_TOAST: Record<IssueStatus, string> = {
  open: "「未対応」に戻しました",
  in_progress: "「対応中」にしました",
  resolved: "「対応済み」にしました",
};

export function IssueList({ now }: { now: number }) {
  const open = useOpenIssues();
  const issues = useDemoStore((s) => s.issues);
  const records = useDemoStore((s) => s.records);
  const settings = useDemoStore((s) => s.settings);
  const setIssueStatus = useDemoStore((s) => s.setIssueStatus);
  const [view, setView] = useState<View>("open");
  const [editingId, setEditingId] = useState<string | null>(null);

  const resolvedToday = useMemo(
    () =>
      issues
        .filter((i) => i.status === "resolved" && isToday(i.updatedAt, now))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [issues, now],
  );
  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const editing = editingId ? issues.find((i) => i.id === editingId) : undefined;
  const list = view === "open" ? open : resolvedToday;

  const changeStatus = (issue: Issue, status: IssueStatus) => {
    if (status === issue.status) return;
    setIssueStatus(issue.id, status);
    toast(STATUS_TOAST[status], "success", {
      description:
        status === "resolved"
          ? `${issue.title}　—「本日対応済み」に移りました。`
          : status === "open" && issue.status === "resolved"
            ? `${issue.title}　— 要対応リストに戻しました。`
            : issue.title,
    });
  };

  return (
    <Card
      id="issues"
      title="要対応リスト"
      description="AIが「人の対応が必要」と判断した案件です。対応状況を変えると、日次レポートにも反映されます。"
      icon={ClipboardList}
      flush
      className="scroll-mt-14 lg:scroll-mt-0"
    >
      <div className="px-4 sm:px-5">
        <Tabs<View>
          variant="pill"
          size="sm"
          ariaLabel="表示する案件"
          value={view}
          onChange={setView}
          tabs={[
            { id: "open", label: "対応待ち", count: open.length },
            { id: "resolved", label: "本日対応済み", count: resolvedToday.length },
          ]}
        />
      </div>

      {list.length === 0 ? (
        view === "open" ? (
          <EmptyState
            compact
            icon={CircleCheckBig}
            title="対応待ちの案件はありません"
            description="洗濯物の放置・機械のエラー・緊急のトラブルなどの報告が届くと、ここに自動で登録されます。"
            action={
              <ButtonLink href="/demo?scenario=sc_machine" size="sm" variant="secondary" icon={Play}>
                機械エラーの報告を試す
              </ButtonLink>
            }
            className="pb-8 pt-6"
          />
        ) : (
          <EmptyState
            compact
            icon={CircleCheckBig}
            title="本日対応済みにした案件はまだありません"
            description="「対応待ち」の案件の対応状況を「対応済み」にすると、ここに移ります。"
            className="pb-8 pt-6"
          />
        )
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {list.map((issue) => (
            <IssueItem
              key={issue.id}
              issue={issue}
              record={recordById.get(issue.analysisId)}
              settings={settings}
              now={now}
              onStatus={(status) => changeStatus(issue, status)}
              onMemo={() => setEditingId(issue.id)}
            />
          ))}
        </ul>
      )}

      {editing && <IssueMemoModal key={editing.id} issue={editing} onClose={() => setEditingId(null)} />}
    </Card>
  );
}

interface IssueItemProps {
  issue: Issue;
  record?: AnalysisRecord;
  settings: Settings;
  now: number;
  onStatus: (status: IssueStatus) => void;
  onMemo: () => void;
}

function IssueItem({ issue, record, settings, now, onStatus, onMemo }: IssueItemProps) {
  const store = issue.storeId ? settings.stores.find((s) => s.id === issue.storeId) : undefined;
  const sender = record ? selectSender(settings, record.senderId) : undefined;
  const resolved = issue.status === "resolved";
  // Two issues can share a title (the same sample sent twice): the time keeps the labels unique.
  const issueLabel = `${issue.title}・${formatTime(issue.createdAt)}`;

  return (
    <li className="relative px-4 py-4 sm:px-5">
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", resolved ? "bg-emerald-400" : STRIPE[issue.urgency])} />
      <div className="flex flex-wrap items-center gap-1.5">
        <UrgencyBadge urgency={issue.urgency} size="sm" />
        <CategoryBadge category={issue.category} size="sm" />
        {store && (
          <Badge tone="gray" size="sm" icon={StoreIcon}>
            {store.name}
          </Badge>
        )}
        <span className="ml-auto text-xs tabular-nums text-slate-500">
          {resolved ? `${formatTime(issue.updatedAt)} 対応済み` : formatRelative(issue.createdAt, now)}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-bold leading-snug text-slate-900">{issue.title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">
        {sender && <span className="font-semibold text-slate-700">{sender.shortName}さん：</span>}
        {issue.detail}
      </p>

      {issue.note && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50/80 px-2.5 py-2 text-[13px] leading-relaxed text-amber-950 ring-1 ring-inset ring-amber-200/80">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0">
            <span className="sr-only">メモ：</span>
            {issue.note}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          aria-label={`対応状況（${issueLabel}）`}
          value={issue.status}
          onChange={(e) => onStatus(e.target.value as IssueStatus)}
          options={ISSUE_STATUS_OPTIONS}
          className="w-32"
        />
        <Button
          variant="secondary"
          icon={NotebookPen}
          onClick={onMemo}
          aria-label={`${issue.note ? "メモを編集" : "メモ"}（${issueLabel}）`}
        >
          {issue.note ? "メモを編集" : "メモ"}
        </Button>
        <ButtonLink
          href={`/admin/logs?record=${encodeURIComponent(issue.analysisId)}`}
          variant="ghost"
          iconRight={ArrowRight}
          className="ml-auto"
          aria-label={`判定ログを見る（${issueLabel}）`}
        >
          判定ログ
        </ButtonLink>
      </div>
    </li>
  );
}
