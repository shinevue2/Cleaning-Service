"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { BookmarkPlus, CircleCheck, TriangleAlert } from "lucide-react";
import { Button, Callout, Field, Input, Modal, Textarea, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import type { AnalysisRecord, Issue } from "@/lib/types";
import { MAX_ANSWER_LENGTH as MAX_ANSWER } from "../faq/faqUtils";
import { PatternGroupsEditor, PatternRuleExplainer } from "../faq/PatternGroupsEditor";
import { generalQuestion, missingWords, patternsMatch, suggestFaqPatterns } from "./logUtils";

export interface FaqFromRecordModalProps {
  record: AnalysisRecord;
  /** the unresolved issue created for this question, if any (it gets answered and resolved) */
  openIssue?: Issue;
  onClose: () => void;
}

/** 「この質問をFAQに登録」 — mount only while open. */
export function FaqFromRecordModal({ record, openIssue, onClose }: FaqFromRecordModalProps) {
  const addFaqFromRecord = useDemoStore((s) => s.addFaqFromRecord);
  const stores = useDemoStore((s) => s.settings.stores);
  // A general heading: 「中央通り店の自販機の…」 → 「自販機の…」 (the FAQ is for every store).
  const [question, setQuestion] = useState(() => generalQuestion(record.combinedText, stores));
  const [answer, setAnswer] = useState("");
  const [groups, setGroups] = useState<string[][]>(() => suggestFaqPatterns(record.combinedText, stores));
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();

  const patterns = useMemo(
    () => groups.map((g) => g.map((w) => w.trim()).filter(Boolean)).filter((g) => g.length > 0),
    [groups],
  );
  const matchedGroups = useMemo(
    () => groups.map((g) => g.some((w) => w.trim()) && patternsMatch(record.combinedText, [g])),
    [groups, record.combinedText],
  );
  const matches = patterns.length > 0 && patternsMatch(record.combinedText, patterns);
  const missing = useMemo(() => missingWords(record.combinedText, patterns), [record.combinedText, patterns]);
  const answerError = submitted && answer.trim() === "" ? "回答を入力してください。" : undefined;
  const patternError =
    submitted && patterns.length === 0 ? "反応する言葉を1つ以上入力してください。" : undefined;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (answer.trim() === "" || patterns.length === 0) return;
    addFaqFromRecord(record.id, question, answer, patterns);
    toast("よくある質問に登録しました", "success", {
      description: openIssue
        ? "元のグループにもこの回答を返信し、要対応リストの案件を「対応済み」にしました。次回から同じ質問には自動で回答します。"
        : "次回から同じ質問には、この回答を自動で返信します。",
      duration: 6000,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="この質問をよくある質問に登録"
      description="回答を登録しておくと、次回から同じ質問にはAIがその回答を自動で返信します。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form={formId} icon={BookmarkPlus}>
            登録する
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-200">
          <p className="text-xs font-semibold text-slate-500">届いた質問</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{record.combinedText}</p>
        </div>

        <Field label="質問（一覧に表示する文）" hint="よくある質問の一覧で、この文が見出しになります。">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} />
        </Field>

        <Field
          label="回答"
          required
          error={answerError}
          hint={`スタッフへの返信として、このまま送られます（${answer.length}／${MAX_ANSWER}文字）。`}
        >
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(Array.from(e.target.value).slice(0, MAX_ANSWER).join(""))}
            rows={4}
            maxLength={MAX_ANSWER}
            placeholder="例：釣り銭は事務所の金庫にあります。補充したら、このグループでお知らせください。"
            data-autofocus
          />
        </Field>

        <div className="space-y-2">
          {/* Same editor as 管理画面 › よくある質問, so both places work the same way. */}
          <Field as="fieldset" label="反応する言葉" required error={patternError}>
            <div className="space-y-3">
              <PatternRuleExplainer />
              <PatternGroupsEditor groups={groups} onChange={setGroups} matched={matchedGroups} invalid={Boolean(patternError)} />
            </div>
          </Field>

          {patterns.length > 0 && (
            <p
              className={cn(
                "flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs leading-relaxed",
                matches ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950",
              )}
              role="status"
            >
              {matches ? (
                <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden />
              )}
              {matches
                ? "届いた質問は、この条件に当てはまります。"
                : `届いた質問には「${missing.join("」「")}」が含まれていないため、この条件では回答されません。言葉を見直してください。`}
            </p>
          )}
        </div>

        {openIssue ? (
          <Callout tone="brand" title="登録すると、この質問にもすぐ回答します">
            元のグループに「お待たせしました」と回答を返信し、要対応リストの案件を「対応済み」にします。
          </Callout>
        ) : (
          <Callout tone="info">
            登録した内容は「よくある質問」の画面で、あとから編集・停止できます。
          </Callout>
        )}
      </form>
    </Modal>
  );
}
