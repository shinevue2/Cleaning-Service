"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/format";
import { TagInput } from "../settings/shared/TagInput";

export const MAX_GROUPS = 10;

/** The rule in one sentence, shown wherever FAQ conditions are edited. */
export function PatternRuleExplainer({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl bg-sky-50 px-3.5 py-3 text-[13px] leading-relaxed text-sky-950 ring-1 ring-inset ring-sky-200", className)}>
      <p className="font-semibold">すべて含む言葉のグループを、いずれか1つでも満たせば一致</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-sky-800">例：</span>
        <WordChip>洗剤</WordChip>＋<WordChip>補充</WordChip>
        <span className="mx-1 text-xs font-semibold text-sky-700">または</span>
        <WordChip>洗剤</WordChip>＋<WordChip>どこ</WordChip>
      </p>
      <p className="mt-1.5 text-sky-900">
        →「洗剤の補充はどうすれば？」にも「洗剤はどこにありますか？」にも回答します。「洗剤を使いました」には回答しません。
      </p>
    </div>
  );
}

function WordChip({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-semibold text-sky-900 ring-1 ring-inset ring-sky-300">
      {children}
    </span>
  );
}

export interface PatternGroupsEditorProps {
  groups: string[][];
  onChange: (groups: string[][]) => void;
  /** groups that match the sample question (index → true) */
  matched?: readonly boolean[];
  invalid?: boolean;
}

/** Edits FAQ keyword groups: each group is a word list (all must appear); groups are alternatives. */
export function PatternGroupsEditor({ groups, onChange, matched = [], invalid = false }: PatternGroupsEditorProps) {
  const id = useId();
  const list = groups.length > 0 ? groups : [[]];

  const update = (index: number, words: string[]) => onChange(list.map((g, i) => (i === index ? words : g)));
  const remove = (index: number) => onChange(list.filter((_, i) => i !== index));
  const add = () => onChange([...list, []]);

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {list.map((group, index) => {
          const inputId = `${id}-group-${index}`;
          return (
            <li key={index}>
              {index > 0 && (
                <div aria-hidden className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wider text-slate-500">
                  <span className="h-px flex-1 bg-slate-200" />
                  または
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-xl p-2.5 ring-1 ring-inset",
                  matched[index] ? "bg-emerald-50/70 ring-emerald-200" : "bg-slate-50 ring-slate-200",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-xs font-semibold text-slate-600">
                    条件{index + 1}
                    <span className="ml-1.5 font-normal text-slate-500">（この言葉がすべて含まれていれば一致）</span>
                  </label>
                  <span className="flex items-center gap-1">
                    {matched[index] && <span className="text-[11px] font-semibold text-emerald-700">一致</span>}
                    {list.length > 1 && (
                      <IconButton
                        label={`条件${index + 1}を削除`}
                        icon={Trash2}
                        size="sm"
                        onClick={() => remove(index)}
                        className="size-7 hover:text-red-600"
                      />
                    )}
                  </span>
                </div>
                <TagInput
                  id={inputId}
                  value={group}
                  onChange={(words) => update(index, words)}
                  placeholder={index === 0 ? "例：洗剤（Enter）、補充（Enter）" : "言葉を入力して Enter"}
                  tone="blue"
                  max={8}
                  invalid={invalid && group.length === 0}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <Button variant="ghost" size="sm" icon={Plus} onClick={add} disabled={list.length >= MAX_GROUPS}>
        条件を追加（「または」）
      </Button>
    </div>
  );
}

/** Read-only display: 「洗剤＋補充」 または 「洗剤＋どこ」. */
export function PatternGroupsView({ groups, highlight = [] }: { groups: readonly string[][]; highlight?: readonly boolean[] }) {
  if (groups.length === 0) {
    return <p className="text-xs text-amber-800">反応する言葉が登録されていないため、自動回答はしません。</p>;
  }
  return (
    <ul className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5" aria-label="反応する言葉の組み合わせ">
      {groups.map((group, i) => (
        <li key={`${i}-${group.join("|")}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[11px] font-semibold text-slate-500">または</span>}
          <span
            className={cn(
              "inline-flex flex-wrap items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
              highlight[i] ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : "bg-sky-50 text-sky-900 ring-sky-200",
            )}
          >
            {group.map((w, j) => (
              <span key={`${w}-${j}`}>
                {j > 0 && <span className="mx-0.5 text-slate-500">＋</span>}
                {w}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
