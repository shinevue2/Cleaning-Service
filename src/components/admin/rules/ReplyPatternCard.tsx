"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Camera, CameraOff, Clock, Moon, Save, Trash2, Undo2, UserRound, type LucideIcon } from "lucide-react";
import { Badge, Button, IconButton, Select, Toggle, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { CATEGORY_LABELS, type ReplyPattern, type Settings } from "@/lib/types";
import { useUnsavedGuard } from "../settings/shared/useUnsavedGuard";
import { ReplyTextsEditor } from "./ReplyTextsEditor";
import {
  PATTERN_SCOPE_BADGES,
  PATTERN_SCOPE_DESCRIPTIONS,
  ROLE_SCOPE_LABELS,
  WHEN_DESCRIPTIONS,
  WHEN_LABELS,
  WHEN_ORDER,
  checkPatternTexts,
  cleanPatternTexts,
  isFaqPattern,
  patternConditionLabel,
  patternRolesFromScope,
  patternScopeOf,
  whenOf,
  winningPattern,
  type PatternWhen,
  type RoleScope,
} from "./ruleUtils";

const WHEN_ICONS: Record<PatternWhen, LucideIcon> = {
  any: Clock,
  with_photo: Camera,
  without_photo: CameraOff,
  night: Moon,
};

interface Draft {
  when: PatternWhen;
  scope: RoleScope;
  texts: string[];
}

const SCOPE_ORDER: readonly RoleScope[] = ["all", "staff", "callcenter"];

function sameTexts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

export interface ReplyPatternCardProps {
  pattern: ReplyPattern;
  settings: Settings;
  onDelete: () => void;
}

/** One reply pattern: condition, enable switch and its text variants (edited in place, saved explicitly). */
export function ReplyPatternCard({ pattern, settings, onDelete }: ReplyPatternCardProps) {
  const upsert = useDemoStore((s) => s.upsertReplyPattern);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const stored: Draft = {
    when: whenOf(pattern),
    scope: patternScopeOf(pattern),
    texts: pattern.texts.length > 0 ? pattern.texts : [""],
  };
  const view = draft ?? stored;
  const dirty =
    draft !== null && (draft.when !== stored.when || draft.scope !== stored.scope || !sameTexts(draft.texts, stored.texts));
  const check = checkPatternTexts(view.texts, pattern.category);
  const faq = pattern.category === "question" && isFaqPattern({ texts: view.texts });
  const label = patternConditionLabel({ ...pattern, when: view.when, texts: view.texts });
  const Icon = faq ? BookOpen : WHEN_ICONS[view.when];
  const winner = pattern.enabled ? winningPattern(settings.replyPatterns, pattern) : undefined;
  const shadowed =
    winner !== undefined && settings.replyPatterns.indexOf(winner) < settings.replyPatterns.indexOf(pattern);
  const idPrefix = `pattern-${pattern.id}`;
  useUnsavedGuard(dirty);

  const save = () => {
    setShowErrors(true);
    if (check.error) return;
    // Keep the stored roles untouched unless the scope was changed here (imported JSON may list several).
    const roles = view.scope === stored.scope ? pattern.roles : patternRolesFromScope(view.scope);
    upsert({ ...pattern, when: view.when, roles, texts: cleanPatternTexts(view.texts) });
    setDraft(null);
    setShowErrors(false);
    toast("返信パターンを保存しました", "success", {
      description: `「${CATEGORY_LABELS[pattern.category]}（${label}）」の返信に、すぐ反映されます。`,
    });
  };

  const revert = () => {
    setDraft(null);
    setShowErrors(false);
  };

  const toggle = (enabled: boolean) => {
    upsert({ ...pattern, enabled });
    toast(enabled ? "返信パターンを使う設定にしました" : "返信パターンを停止しました", enabled ? "success" : "info", {
      description: `${CATEGORY_LABELS[pattern.category]}（${label}）`,
    });
  };

  return (
    <article
      aria-label={`${CATEGORY_LABELS[pattern.category]}の返信パターン（${label}）`}
      className={cn(
        "min-w-0 rounded-2xl border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow",
        dirty ? "border-amber-300 ring-2 ring-amber-200/70" : "border-slate-200/80",
        !pattern.enabled && !dirty && "bg-slate-50/80",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Badge tone={view.when === "night" ? "purple" : faq ? "blue" : "gray"} icon={Icon}>
          {label}
        </Badge>
        {view.scope !== "all" && (
          <Badge tone="teal" size="sm" icon={UserRound}>
            {PATTERN_SCOPE_BADGES[view.scope]}
          </Badge>
        )}
        {!pattern.enabled && (
          <Badge tone="gray" size="sm">
            停止中
          </Badge>
        )}
        {shadowed && (
          <Badge tone="amber" size="sm">
            使われていません
          </Badge>
        )}
        {dirty && (
          <Badge tone="amber" size="sm" dot>
            未保存
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Toggle
            size="sm"
            label={
              <>
                使う<span className="sr-only">（{CATEGORY_LABELS[pattern.category]}・{label}の返信）</span>
              </>
            }
            checked={pattern.enabled}
            onChange={toggle}
            className="items-center [&_label]:text-xs [&_label]:font-medium [&_label]:text-slate-600"
          />
          <IconButton label="この返信パターンを削除" icon={Trash2} size="sm" onClick={onDelete} className="hover:text-red-600" />
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {shadowed && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 ring-1 ring-inset ring-amber-200">
            同じ条件の返信パターン（「{winner.texts[0]}」など）が先に登録されているため、この文面は使われていません。
            文面を増やしたいときは、そちらの「言い回しを追加」をお使いください。
          </p>
        )}

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor={`${idPrefix}-when`} className="shrink-0 text-[13px] font-semibold text-slate-700">
            使う条件
          </label>
          <Select
            id={`${idPrefix}-when`}
            value={view.when}
            onChange={(e) => setDraft({ ...view, when: e.target.value as PatternWhen })}
            options={WHEN_ORDER.map((w) => ({ value: w, label: WHEN_LABELS[w] }))}
            className="sm:w-52"
            aria-describedby={`${idPrefix}-when-hint`}
          />
          <p id={`${idPrefix}-when-hint`} className="text-xs leading-relaxed text-slate-500">
            {WHEN_DESCRIPTIONS[view.when]}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor={`${idPrefix}-scope`} className="shrink-0 text-[13px] font-semibold text-slate-700">
            送った人
          </label>
          <Select
            id={`${idPrefix}-scope`}
            value={view.scope}
            onChange={(e) => setDraft({ ...view, scope: e.target.value as RoleScope })}
            options={SCOPE_ORDER.map((r) => ({ value: r, label: ROLE_SCOPE_LABELS[r] }))}
            className="sm:w-52"
            aria-describedby={`${idPrefix}-scope-hint`}
          />
          <p id={`${idPrefix}-scope-hint`} className="text-xs leading-relaxed text-slate-500">
            {PATTERN_SCOPE_DESCRIPTIONS[view.scope]}
          </p>
        </div>

        {faq && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 ring-1 ring-inset ring-sky-200">
            <code className="font-mono font-semibold">{"{answer}"}</code>
            の部分に、よくある質問に登録した回答が入ります。回答の内容は
            <Link href="/admin/faq" className="mx-0.5 font-semibold text-sky-800 underline underline-offset-2">
              よくある質問
            </Link>
            の画面で編集できます。
          </p>
        )}

        <ReplyTextsEditor
          category={pattern.category}
          texts={view.texts}
          onChange={(texts) => setDraft({ ...view, texts })}
          settings={settings}
          idPrefix={idPrefix}
          error={showErrors ? check.error : undefined}
          warnings={check.warnings}
        />
      </div>

      {dirty && (
        <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-amber-100 bg-amber-50/60 px-4 py-3">
          <span className="mr-auto text-xs font-medium text-amber-900">保存するまで、返信には反映されません。</span>
          <Button variant="ghost" size="sm" icon={Undo2} onClick={revert}>
            元に戻す
          </Button>
          <Button size="sm" icon={Save} onClick={save}>
            保存する
          </Button>
        </footer>
      )}
    </article>
  );
}
