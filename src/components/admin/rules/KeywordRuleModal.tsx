"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, CircleSlash, Info, Save } from "lucide-react";
import { Button, Callout, Field, Input, Modal, Select, URGENCY_ICONS, toast } from "@/components/ui";
import { displayKeyword, normalize, scanRules } from "@/lib/engine";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import { CATEGORY_LABELS, CATEGORY_ORDER, URGENCY_LABELS, type Category, type KeywordRule, type Urgency } from "@/lib/types";
import { ChoiceGroup } from "../settings/shared/Controls";
import { TagInput } from "../settings/shared/TagInput";
import { ROLE_SCOPE_LABELS, checkRule, finalizeRule, roleScopeOf, rolesFromScope, ruleTitle, type RoleScope } from "./ruleUtils";

/** Categories a keyword rule can point to (判定保留 is what happens when no rule matches). */
const RULE_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "unknown");

const URGENCY_HELP: Record<Urgency, string> = {
  normal: "自動で返信して終わり",
  attention: "管理者へ転送し、要対応リストに登録",
  urgent: "すぐに管理者へ転送（夜間は電話も）",
};

const DEFAULT_URGENCY: Record<Category, Urgency> = {
  cleaning_start: "normal",
  cleaning_done: "normal",
  leftover: "attention",
  machine_error: "attention",
  question: "attention",
  info: "normal",
  emergency: "urgent",
  chat: "normal",
  unknown: "attention",
};

export function emptyRule(): KeywordRule {
  return {
    id: "",
    category: "machine_error",
    urgency: "attention",
    keywords: [],
    excludes: [],
    roles: [],
    enabled: true,
  };
}

export interface KeywordRuleModalProps {
  /** the rule to edit; `id: ""` = a new rule */
  rule: KeywordRule;
  onClose: () => void;
}

/** Add / edit a keyword rule. Mount only while open. */
export function KeywordRuleModal({ rule, onClose }: KeywordRuleModalProps) {
  const rules = useDemoStore((s) => s.settings.keywordRules);
  const upsert = useDemoStore((s) => s.upsertKeywordRule);
  const [draft, setDraft] = useState<KeywordRule>(rule);
  const [submitted, setSubmitted] = useState(false);
  const [sample, setSample] = useState("");
  const formId = useId();
  const isNew = rule.id === "";

  const check = checkRule(draft, rules);
  const scope = roleScopeOf(draft.roles);
  const emergency = draft.category === "emergency";
  const urgency: Urgency = emergency ? "urgent" : draft.urgency;

  const sampleHit = useMemo(() => {
    const norm = normalize(sample);
    if (!norm) return null;
    const testRule = { ...finalizeRule(draft), enabled: true };
    const role = scope === "callcenter" ? "callcenter" : "staff";
    const scan = scanRules(sample, [testRule], role);
    if (scan.hits.length > 0) {
      return { matched: true, words: [...new Set(scan.hits[0].matches.map((m) => displayKeyword(m.keyword)))] };
    }
    const excluded = scan.excluded[0]?.exclude;
    const negated = scan.negated[0] ? displayKeyword(scan.negated[0].keyword) : undefined;
    return { matched: false, excluded, negated };
  }, [sample, draft, scope]);

  const set = (patch: Partial<KeywordRule>) => setDraft((d) => ({ ...d, ...patch }));

  const changeCategory = (category: Category) => {
    // Suggest the usual urgency for the new category, unless the owner already chose one on purpose.
    const suggested = DEFAULT_URGENCY[category];
    set({ category, urgency: draft.urgency === DEFAULT_URGENCY[draft.category] ? suggested : draft.urgency });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (check.errors.keywords || check.errors.excludes) return;
    const saved = finalizeRule({ ...draft, id: isNew ? newId("rule") : draft.id });
    upsert(saved);
    toast(isNew ? "判定ルールを追加しました" : "判定ルールを保存しました", "success", {
      description: `「${ruleTitle(saved)}」は、次に届くメッセージから使われます。`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      persistent
      title={isNew ? "判定ルールを追加" : "判定ルールを編集"}
      description="メッセージにここで登録した言葉が含まれていると、選んだ種類・緊急度として扱います。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form={formId} icon={Save}>
            {isNew ? "追加する" : "保存する"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="判定する種類">
            <Select
              value={draft.category}
              onChange={(e) => changeCategory(e.target.value as Category)}
              options={RULE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            />
          </Field>
          <Field label="ルールの名前（メモ）" optional hint="一覧で見分けるための名前です。">
            <Input
              value={draft.memo ?? ""}
              onChange={(e) => set({ memo: e.target.value })}
              maxLength={40}
              placeholder="例：両替機のトラブル"
            />
          </Field>
        </div>

        <Field
          as="fieldset"
          label="緊急度"
          hint={emergency ? "「緊急トラブル」のルールは、必ず「緊急」として扱います。" : undefined}
        >
          <ChoiceGroup
            value={urgency}
            onChange={(u) => set({ urgency: u })}
            columns={3}
            options={(["normal", "attention", "urgent"] as const).map((u) => {
              const Icon = URGENCY_ICONS[u];
              return {
                value: u,
                label: URGENCY_LABELS[u],
                description: URGENCY_HELP[u],
                icon: (
                  <Icon
                    className={cn(
                      "size-4",
                      u === "urgent" ? "text-red-600" : u === "attention" ? "text-amber-600" : "text-emerald-600",
                    )}
                    aria-hidden
                  />
                ),
                disabled: emergency && u !== "urgent",
              };
            })}
          />
        </Field>

        <Field
          label="反応する言葉"
          required
          error={submitted ? check.errors.keywords : undefined}
          hint="Enterキーか「、」で区切って追加します。全角・半角や空白、ひらがな・カタカナの違いは気にしなくて大丈夫です。「動かない」と登録すれば「動きません」「動いてない」にも反応します。「残って+洗濯物」のように「+」でつなぐと、同じ文に両方あるときだけ反応します。"
        >
          <TagInput
            value={draft.keywords}
            onChange={(keywords) => set({ keywords })}
            placeholder="例：水漏れ"
            tone={emergency ? "red" : "brand"}
          />
        </Field>

        {check.shared.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 ring-1 ring-inset ring-sky-200">
            <Info className="mt-px size-3.5 shrink-0 text-sky-600" aria-hidden />
            <span>
              {check.shared
                .slice(0, 3)
                .map(({ word, rule: other }) => `「${word}」は「${ruleTitle(other)}」にも登録されています`)
                .join("。")}
              。両方に当てはまったときは、緊急度の高いほうが優先されます。
            </span>
          </p>
        )}

        <Field
          label="除外する言葉"
          optional
          error={check.errors.excludes}
          hint="この言葉と重なる部分だけ無視します（例：「漏れなく」を登録すると「水漏れなく」の“水漏れ”には反応しませんが、同じ文の別の「水漏れしています」には反応します）。「水漏れはありませんでした」のような打ち消しは、登録しなくても反応しません。"
        >
          <TagInput
            value={draft.excludes}
            onChange={(excludes) => set({ excludes })}
            placeholder="例：漏れなく"
            tone="slate"
          />
        </Field>

        <Field as="fieldset" label="対象にする人">
          <ChoiceGroup
            value={scope}
            onChange={(s: RoleScope) => set({ roles: rolesFromScope(s) })}
            columns={3}
            compact
            options={(["all", "staff", "callcenter"] as const).map((s) => ({ value: s, label: ROLE_SCOPE_LABELS[s] }))}
          />
        </Field>

        <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <Field label="このルールを試す" hint="文章を入力すると、このルールが反応するかどうかを確認できます（保存前の内容で確認します）。">
            <Input
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="例：駅前店の洗濯機の下から水漏れしています"
            />
          </Field>
          {sampleHit && (
            <p
              role="status"
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[13px] font-medium",
                sampleHit.matched ? "text-emerald-800" : "text-slate-600",
              )}
            >
              {sampleHit.matched ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <CircleSlash className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              )}
              {sampleHit.matched
                ? `反応します（「${sampleHit.words?.join("」「")}」）。「${CATEGORY_LABELS[draft.category]}・${URGENCY_LABELS[urgency]}」の候補になります。`
                : sampleHit.excluded
                  ? `除外する言葉「${sampleHit.excluded}」と重なるため、反応しません。`
                  : sampleHit.negated
                    ? `「${sampleHit.negated}」のすぐ後に打ち消しの表現があるため、反応しません。`
                    : "このルールは反応しません。"}
            </p>
          )}
        </div>

        {emergency && !isNew && rule.enabled && (
          <Callout tone="danger">
            緊急のルールから言葉を減らすと、その言葉を含む緊急トラブルが通常の連絡として扱われるおそれがあります。
          </Callout>
        )}
      </form>
    </Modal>
  );
}
