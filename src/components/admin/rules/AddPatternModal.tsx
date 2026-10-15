"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Callout, Field, Modal, Select, toast } from "@/components/ui";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category, type ReplyPattern } from "@/lib/types";
import { ChoiceGroup } from "../settings/shared/Controls";
import { ReplyTextsEditor } from "./ReplyTextsEditor";
import {
  CATEGORY_HELP,
  PATTERN_SCOPE_DESCRIPTIONS,
  ROLE_SCOPE_LABELS,
  WHEN_DESCRIPTIONS,
  WHEN_LABELS,
  WHEN_ORDER,
  checkPatternTexts,
  cleanPatternTexts,
  patternRolesFromScope,
  winningPattern,
  type PatternWhen,
  type RoleScope,
} from "./ruleUtils";

export interface AddPatternModalProps {
  /** preselected category */
  category: Category;
  onClose: () => void;
}

/** 「返信パターンを追加」 — mount only while open. */
export function AddPatternModal({ category: initialCategory, onClose }: AddPatternModalProps) {
  const settings = useDemoStore((s) => s.settings);
  const upsert = useDemoStore((s) => s.upsertReplyPattern);
  const [category, setCategory] = useState<Category>(initialCategory);
  const [when, setWhen] = useState<PatternWhen>("any");
  const [scope, setScope] = useState<RoleScope>("all");
  const [texts, setTexts] = useState<string[]>([""]);
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();

  const check = checkPatternTexts(texts, category);
  const roles = patternRolesFromScope(scope);
  const competitor = winningPattern(settings.replyPatterns, { id: "", category, when, texts, roles });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (check.error) return;
    const pattern: ReplyPattern = {
      id: newId("pat"),
      category,
      when,
      ...(roles ? { roles } : {}),
      texts: cleanPatternTexts(texts),
      enabled: true,
    };
    upsert(pattern);
    toast("返信パターンを追加しました", "success", {
      description: `「${CATEGORY_LABELS[category]}（${WHEN_LABELS[when]}）」の返信に使います。`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="返信パターンを追加"
      description="どの種類のメッセージに、どんな条件で返信するかを選んで、文面を入力してください。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form={formId} icon={Plus}>
            追加する
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <Field label="メッセージの種類" hint={CATEGORY_HELP[category]}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          />
        </Field>

        <Field as="fieldset" label="使う条件">
          <ChoiceGroup
            value={when}
            onChange={setWhen}
            columns={2}
            options={WHEN_ORDER.map((w) => ({ value: w, label: WHEN_LABELS[w], description: WHEN_DESCRIPTIONS[w] }))}
          />
        </Field>

        <Field label="送った人" hint={PATTERN_SCOPE_DESCRIPTIONS[scope]}>
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as RoleScope)}
            options={(["all", "staff", "callcenter"] as const).map((r) => ({ value: r, label: ROLE_SCOPE_LABELS[r] }))}
          />
        </Field>

        {competitor && (
          <Callout tone="warning" title="同じ条件の返信パターンがすでにあります">
            「{competitor.texts[0]}」のパターンが先に使われるため、ここで追加する文面は使われません。
            言い回しを増やしたいときは、一覧にあるパターンの「言い回しを追加」をお使いください。
          </Callout>
        )}

        <ReplyTextsEditor
          category={category}
          texts={texts}
          onChange={setTexts}
          settings={settings}
          idPrefix={`${formId}-new`}
          error={submitted ? check.error : undefined}
          warnings={check.warnings}
          autoFocus
        />
      </form>
    </Modal>
  );
}
