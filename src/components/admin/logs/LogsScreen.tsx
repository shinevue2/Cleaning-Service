"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilterX, GraduationCap, ListChecks, MessagesSquare, ScrollText, Search, SearchX } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
} from "@/components/ui";
import { cn, isSameTokyoDay } from "@/lib/format";
import { useDemoStore, useHydrated } from "@/lib/store";
import { selectSender, useNow } from "@/lib/store/selectors";
import { CATEGORY_LABELS, CATEGORY_ORDER, URGENCY_LABELS, type Category, type Urgency } from "@/lib/types";
import { CardSkeleton, HeaderSkeleton, LoadingStatus } from "../shell/AdminSkeleton";
import { CorrectModal } from "./CorrectModal";
import { FaqFromRecordModal } from "./FaqFromRecordModal";
import { LearnedList } from "./LearnedList";
import { LogRow } from "./LogRow";
import {
  EMPTY_FILTER,
  indexLearned,
  isFilterActive,
  judgementOf,
  matchesFilter,
  queryTerms,
  type LogFilter,
} from "./logUtils";

const PAGE_SIZE = 30;
type View = "logs" | "learned";

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
const URGENCY_OPTIONS = (["urgent", "attention", "normal"] as const).map((u) => ({ value: u, label: URGENCY_LABELS[u] }));

/**
 * /admin/logs. Reads `?record=<id>` (open and highlight one record — used by links from the dashboard
 * and the simulator) and `?q=<text>` (prefilled search). Must be rendered inside <Suspense>.
 */
export function LogsScreen() {
  const params = useSearchParams();
  const focusId = params.get("record");
  const query = params.get("q") ?? "";
  const hydrated = useHydrated();
  const now = useNow(30_000);
  if (!hydrated || now === null) return <LogsSkeleton />;
  return <LogsView key={`${focusId ?? ""}|${query}`} now={now} focusId={focusId} initialQuery={query} />;
}

interface LogsViewProps {
  now: number;
  focusId: string | null;
  initialQuery: string;
}

function LogsView({ now, focusId, initialQuery }: LogsViewProps) {
  const records = useDemoStore((s) => s.records);
  const issues = useDemoStore((s) => s.issues);
  const settings = useDemoStore((s) => s.settings);

  const [view, setView] = useState<View>("logs");
  const [filter, setFilter] = useState<LogFilter>(() => ({ ...EMPTY_FILTER, text: initialQuery }));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(focusId ? [focusId] : []));
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [faqRecordId, setFaqRecordId] = useState<string | null>(null);

  const learnedByText = useMemo(() => indexLearned(settings.learned), [settings.learned]);
  const issueByRecord = useMemo(() => new Map(issues.map((i) => [i.analysisId, i])), [issues]);

  const items = useMemo(
    () =>
      [...records]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((record) => {
          const issue = issueByRecord.get(record.id);
          const sender = selectSender(settings, record.senderId);
          const group = settings.groups.find((g) => g.id === record.groupId);
          const store = settings.stores.find((s) => s.id === record.analysis.extracted.storeId);
          return {
            record,
            issue,
            sender,
            group,
            judgement: judgementOf(record, learnedByText, issue),
            extra: [sender.name, group?.name ?? "", store?.name ?? "", record.analysis.extracted.machine ?? ""],
          };
        }),
    [records, settings, learnedByText, issueByRecord],
  );

  const terms = useMemo(() => queryTerms(filter.text), [filter.text]);
  const filtered = useMemo(() => items.filter((it) => matchesFilter(it, filter, terms)), [items, filter, terms]);
  const [limit, setLimit] = useState(() => {
    const index = focusId ? items.findIndex((it) => it.record.id === focusId) : -1;
    return Math.max(PAGE_SIZE, index + 1);
  });

  const focusMissing = focusId !== null && !items.some((it) => it.record.id === focusId);
  const todayCount = useMemo(() => items.filter((it) => isSameTokyoDay(it.record.createdAt, now)).length, [items, now]);
  const correctedCount = useMemo(() => items.filter((it) => it.judgement.corrected).length, [items]);
  const correcting = correctingId ? items.find((it) => it.record.id === correctingId) : undefined;
  const faqItem = faqRecordId ? items.find((it) => it.record.id === faqRecordId) : undefined;
  const active = isFilterActive(filter);
  const visible = filtered.slice(0, limit);

  // Bring a record opened from a link into view once.
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`log-${focusId}`);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusId]);

  const update = (patch: Partial<LogFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setLimit(PAGE_SIZE);
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groupOptions = settings.groups
    .filter((g) => g.kind !== "alerts")
    .map((g) => ({ value: g.id, label: g.name }));

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="判定ログ"
        icon={ScrollText}
        description="届いたメッセージをAIがどう判断し、何をしたかの記録です。判定が違っていたら、その場で直せます。"
        actions={
          <ButtonLink href="/demo" variant="secondary" icon={MessagesSquare}>
            シミュレーターを開く
          </ButtonLink>
        }
      />

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "本日の判定", value: todayCount },
          { label: "修正した判定", value: correctedCount },
          { label: "判定の手本", value: settings.learned.length },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3 sm:px-4">
            <dt className="text-xs font-semibold text-slate-500">{s.label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">
              {s.value}
              <span className="ml-0.5 text-sm font-semibold text-slate-500">件</span>
            </dd>
          </div>
        ))}
      </dl>

      <Callout tone="brand" icon={GraduationCap} title="判定が違っていたら、直すだけでAIが覚えます">
        記録を開いて「判定を修正」から正しい分類を選ぶと、その内容が「判定の手本」として保存され、次回から同じような内容はその判定になります。登録されていない質問には、AIが勝手に答えず人に回します。
      </Callout>

      <Tabs<View>
        ariaLabel="表示の切り替え"
        value={view}
        onChange={setView}
        tabs={[
          { id: "logs", label: "ログ一覧", count: items.length, icon: ListChecks },
          { id: "learned", label: "判定の手本", count: settings.learned.length, icon: GraduationCap },
        ]}
      />

      {view === "learned" ? (
        <LearnedList />
      ) : (
        <>
          {focusMissing && (
            <Callout tone="warning" title="指定された記録が見つかりませんでした">
              デモをリセットしたか、古い記録が整理された可能性があります。
            </Callout>
          )}

          {/* filters */}
          <search className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-5">
            <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:gap-x-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
              <Field label="キーワード" className="col-span-3 lg:col-span-1">
                <Input
                  type="search"
                  value={filter.text}
                  onChange={(e) => update({ text: e.target.value })}
                  placeholder="本文・名前・店舗で検索"
                  leading={<Search />}
                  enterKeyHint="search"
                />
              </Field>
              <Field label="グループ">
                <Select
                  value={filter.groupId}
                  onChange={(e) => update({ groupId: e.target.value })}
                  placeholder="すべて"
                  options={groupOptions}
                />
              </Field>
              <Field label="分類">
                <Select
                  value={filter.category}
                  onChange={(e) => update({ category: e.target.value as Category | "" })}
                  placeholder="すべて"
                  options={CATEGORY_OPTIONS}
                />
              </Field>
              <Field label="緊急度">
                <Select
                  value={filter.urgency}
                  onChange={(e) => update({ urgency: e.target.value as Urgency | "" })}
                  placeholder="すべて"
                  options={URGENCY_OPTIONS}
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Checkbox
                checked={filter.correctedOnly}
                onChange={(checked) => update({ correctedOnly: checked })}
                label="修正済みのみ表示"
              />
              <p className="ml-auto text-xs text-slate-500" aria-live="polite">
                {active ? `${filtered.length}件が見つかりました（全${items.length}件）` : `全${items.length}件（新しい順）`}
              </p>
              {active && (
                <Button variant="ghost" size="sm" icon={FilterX} onClick={() => update(EMPTY_FILTER)}>
                  条件をクリア
                </Button>
              )}
            </div>
          </search>

          {/* list */}
          {items.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="まだ判定の記録がありません"
              description="シミュレーターでメッセージを送ると、AIの判定がここに記録されます。"
              action={
                <ButtonLink href="/demo" icon={MessagesSquare}>
                  シミュレーターを開く
                </ButtonLink>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="条件に合う記録はありません"
              description="キーワードを短くするか、絞り込みの条件を変えてみてください。"
              action={
                <Button variant="secondary" icon={FilterX} onClick={() => update(EMPTY_FILTER)}>
                  条件をクリア
                </Button>
              }
            />
          ) : (
            <Card flush className="overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {visible.map((it) => (
                  <LogRow
                    key={it.record.id}
                    record={it.record}
                    judgement={it.judgement}
                    sender={it.sender}
                    group={it.group}
                    now={now}
                    expanded={expanded.has(it.record.id)}
                    focused={it.record.id === focusId}
                    onToggle={() => toggle(it.record.id)}
                    onCorrect={() => setCorrectingId(it.record.id)}
                    onRegisterFaq={() => setFaqRecordId(it.record.id)}
                  />
                ))}
              </ul>
              {filtered.length > visible.length && (
                <div className="border-t border-slate-100 p-3 text-center">
                  <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                    さらに表示（残り {filtered.length - visible.length}件）
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {correcting && (
        <CorrectModal
          key={correcting.record.id}
          record={correcting.record}
          current={correcting.judgement}
          onClose={() => setCorrectingId(null)}
        />
      )}
      {faqItem && (
        <FaqFromRecordModal
          key={faqItem.record.id}
          record={faqItem.record}
          openIssue={faqItem.issue && faqItem.issue.status !== "resolved" ? faqItem.issue : undefined}
          onClose={() => setFaqRecordId(null)}
        />
      )}
    </div>
  );
}

export function LogsSkeleton() {
  return (
    <div className="space-y-6">
      <LoadingStatus />
      <HeaderSkeleton />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5")}>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
          <Skeleton className="col-span-3 h-10 lg:col-span-1" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      <CardSkeleton rows={5} />
    </div>
  );
}
