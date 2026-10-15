"use client";

import { useMemo, useState } from "react";
import { Ban, Pencil, Plus, Search, ShieldAlert, Trash2, Users } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  CategoryBadge,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Toggle,
  UrgencyBadge,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import type { KeywordRule } from "@/lib/types";
import { matchesQuery } from "../settings/shared/words";
import { KeywordRuleModal, emptyRule } from "./KeywordRuleModal";
import { ROLE_SCOPE_LABELS, roleScopeOf, ruleTitle, sortRules } from "./ruleUtils";

const VISIBLE_WORDS = 12;

/** 判定ルール（キーワード） tab. */
export function KeywordRulesPanel() {
  const rules = useDemoStore((s) => s.settings.keywordRules);
  const upsert = useDemoStore((s) => s.upsertKeywordRule);
  const remove = useDemoStore((s) => s.deleteKeywordRule);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<KeywordRule | null>(null);
  const [deleting, setDeleting] = useState<KeywordRule | null>(null);
  const [disablingEmergency, setDisablingEmergency] = useState<KeywordRule | null>(null);

  const sorted = useMemo(() => sortRules(rules), [rules]);
  const visible = sorted.filter((r) => matchesQuery(query, [ruleTitle(r), ...r.keywords, ...r.excludes]));
  const emergencyActive = rules.some((r) => r.category === "emergency" && r.enabled && r.keywords.length > 0);

  const setEnabled = (rule: KeywordRule, enabled: boolean) => {
    upsert({ ...rule, enabled });
    toast(enabled ? "判定ルールを使う設定にしました" : "判定ルールを停止しました", enabled ? "success" : "info", {
      description: ruleTitle(rule),
    });
  };

  const onToggle = (rule: KeywordRule, enabled: boolean) => {
    if (!enabled && rule.category === "emergency") setDisablingEmergency(rule);
    else setEnabled(rule, enabled);
  };

  return (
    <div className="space-y-5">
      <Callout tone="brand" title="この言葉が含まれていたら、この種類・緊急度と判断します">
        複数のルールに当てはまったときは、緊急度の高いものが優先されます。
        <strong className="font-semibold">「緊急」のルールに当てはまったものは、AIの判断にかかわらず必ず緊急として通知します。</strong>
        本番ではAIが言い回しの違いも読み取るので、ここには「これだけは見逃したくない言葉」を登録しておくのがおすすめです。
      </Callout>

      {!emergencyActive && (
        <Callout tone="danger" title="使用中の「緊急」のルールがありません">
          水漏れや火災などの緊急トラブルを見逃すおそれがあります。緊急トラブルのルールを「使う」にしてください。
        </Callout>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leading={<Search />}
          placeholder="言葉やルール名で探す"
          aria-label="判定ルールを検索"
          className="sm:max-w-xs sm:flex-1"
        />
        <Button icon={Plus} onClick={() => setEditing(emptyRule())} className="sm:ml-auto">
          判定ルールを追加
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title={rules.length === 0 ? "判定ルールがありません" : "当てはまるルールがありません"}
          description={rules.length === 0 ? "「判定ルールを追加」から登録できます。" : "別の言葉で探すか、検索をクリアしてください。"}
          action={
            query ? (
              <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                検索をクリア
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((rule) => (
            <li key={rule.id}>
              <RuleCard
                rule={rule}
                onEdit={() => setEditing(rule)}
                onDelete={() => setDeleting(rule)}
                onToggle={(enabled) => onToggle(rule, enabled)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && <KeywordRuleModal rule={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title="この判定ルールを削除しますか？"
        description={
          deleting
            ? deleting.category === "emergency"
              ? `「${ruleTitle(deleting)}」は緊急トラブルのルールです。削除すると、これらの言葉を含む緊急トラブルを見逃すおそれがあります。元に戻すことはできません。`
              : `「${ruleTitle(deleting)}」を削除します。元に戻すことはできません。一時的に止めたいときは「使う」をオフにしてください。`
            : undefined
        }
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          remove(deleting.id);
          toast("判定ルールを削除しました", "info", { description: ruleTitle(deleting) });
        }}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={disablingEmergency !== null}
        tone="danger"
        title="緊急のルールを停止しますか？"
        description={
          disablingEmergency
            ? `「${ruleTitle(disablingEmergency)}」を停止すると、これらの言葉を含む緊急トラブルが、すぐに通知されなくなるおそれがあります。`
            : undefined
        }
        confirmLabel="停止する"
        onConfirm={() => {
          if (disablingEmergency) setEnabled(disablingEmergency, false);
        }}
        onClose={() => setDisablingEmergency(null)}
      />
    </div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: KeywordRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scope = roleScopeOf(rule.roles);
  const words = expanded ? rule.keywords : rule.keywords.slice(0, VISIBLE_WORDS);
  const hidden = rule.keywords.length - words.length;
  const emergency = rule.category === "emergency";

  return (
    <article
      aria-label={ruleTitle(rule)}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        rule.enabled ? "border-slate-200/80" : "border-slate-200 bg-slate-50/80",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          !rule.enabled ? "bg-slate-200" : emergency ? "bg-red-500" : rule.urgency === "attention" ? "bg-amber-400" : "bg-emerald-400",
        )}
      />
      <div className="space-y-3 py-3.5 pl-5 pr-3 sm:pr-4">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={rule.category} size="sm" />
              <UrgencyBadge urgency={emergency ? "urgent" : rule.urgency} size="sm" />
              {scope !== "all" && (
                <Badge tone="blue" size="sm" icon={Users}>
                  {ROLE_SCOPE_LABELS[scope]}
                </Badge>
              )}
              {!rule.enabled && (
                <Badge tone="gray" size="sm">
                  停止中
                </Badge>
              )}
            </div>
            <h3 className={cn("text-sm font-bold leading-snug", rule.enabled ? "text-slate-900" : "text-slate-500")}>
              {emergency && <ShieldAlert className="mr-1 inline size-4 -translate-y-px text-red-600" aria-hidden />}
              {ruleTitle(rule)}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Toggle
              size="sm"
              label={
                <>
                  使う<span className="sr-only">（{ruleTitle(rule)}）</span>
                </>
              }
              checked={rule.enabled}
              onChange={onToggle}
              className="items-center [&_label]:text-xs [&_label]:font-medium [&_label]:text-slate-600"
            />
            <IconButton label={`「${ruleTitle(rule)}」を編集`} icon={Pencil} size="sm" onClick={onEdit} />
            <IconButton
              label={`「${ruleTitle(rule)}」を削除`}
              icon={Trash2}
              size="sm"
              onClick={onDelete}
              className="hover:text-red-600"
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-500">反応する言葉（{rule.keywords.length}）</p>
          {rule.keywords.length === 0 ? (
            <p className="text-xs text-amber-800">言葉が登録されていないため、このルールは反応しません。</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" aria-label="反応する言葉">
              {words.map((w, i) => (
                <li
                  key={`${w}-${i}`}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                    emergency ? "bg-red-50 text-red-800 ring-red-200" : "bg-brand-50 text-brand-900 ring-brand-200",
                  )}
                >
                  {w}
                </li>
              ))}
              {(hidden > 0 || expanded) && rule.keywords.length > VISIBLE_WORDS && (
                <li>
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                  >
                    {expanded ? "閉じる" : `ほか${hidden}語を表示`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {rule.excludes.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
              <Ban className="size-3.5" aria-hidden />
              除外：
            </span>
            {rule.excludes.map((w, i) => (
              <span key={`${w}-${i}`} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                {w}
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
