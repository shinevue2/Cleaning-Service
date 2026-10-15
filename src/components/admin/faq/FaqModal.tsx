"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, Save, TriangleAlert } from "lucide-react";
import { Button, Field, Input, Modal, Textarea, Toggle, toast } from "@/components/ui";
import { renderTemplate } from "@/lib/engine";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import { CATEGORY_LABELS, type FaqEntry } from "@/lib/types";
import { fixPlaceholderBraces, isFaqPattern, sampleVars } from "../rules/ruleUtils";
import { ChatPreview } from "../settings/shared/ChatPreview";
import { PatternGroupsEditor, PatternRuleExplainer } from "./PatternGroupsEditor";
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  checkFaq,
  finalizeFaq,
  groupMatches,
  testFaq,
  type FaqTestOutcome,
} from "./faqUtils";

const AUTO_LABEL = "【自動回答】";

export function emptyFaq(question = "", patterns: string[][] = [[]]): FaqEntry {
  return { id: "", question, answer: "", patterns, enabled: true };
}

function describeTrial(
  result: { outcome: FaqTestOutcome; draftId: string } | null,
): { ok: boolean; text: string } | null {
  if (!result) return null;
  const { outcome, draftId } = result;
  switch (outcome.kind) {
    case "answer":
      return outcome.match.faq.id === draftId
        ? { ok: true, text: "この質問には、この回答で自動返信します。" }
        : { ok: false, text: `別のよくある質問「${outcome.match.faq.question}」のほうがよく一致するため、そちらの回答が使われます。` };
    case "not_question":
      return outcome.match.faq.id === draftId
        ? {
            ok: false,
            text: "条件には一致しますが、質問の形（「〜ですか？」「どうすれば」など）ではないため、自動回答はしません。",
          }
        : { ok: false, text: "どの条件にも当てはまりません。言葉の組み合わせを見直してください。" };
    case "overridden":
      return { ok: false, text: `「${outcome.categoryLabel}」と判断されるため、自動回答はせず担当者へ転送します。` };
    default:
      return { ok: false, text: "どの条件にも当てはまりません。言葉の組み合わせを見直してください。" };
  }
}

export interface FaqModalProps {
  /** the entry to edit; `id: ""` = new */
  faq: FaqEntry;
  onClose: () => void;
}

/** Add / edit one FAQ entry. Mount only while open. */
export function FaqModal({ faq, onClose }: FaqModalProps) {
  const settings = useDemoStore((s) => s.settings);
  const upsert = useDemoStore((s) => s.upsertFaq);
  const [draft, setDraft] = useState<FaqEntry>(faq);
  const [submitted, setSubmitted] = useState(false);
  const [sample, setSample] = useState<string | null>(null);
  const formId = useId();
  const isNew = faq.id === "";

  const others = settings.faqs.filter((f) => f.id !== draft.id);
  const check = checkFaq(draft, others);
  const trial = sample ?? draft.question;
  const matched = useMemo(() => draft.patterns.map((g) => groupMatches(trial, g)), [draft.patterns, trial]);

  // Run the real matcher with this draft in place of the saved entry (enabled, so it can be tried before saving).
  const trialResult = useMemo(() => {
    if (trial.trim() === "") return null;
    const draftId = draft.id || "__draft__";
    const trialSettings = {
      ...settings,
      faqs: [...settings.faqs.filter((f) => f.id !== draft.id), { ...finalizeFaq(draft), id: draftId, enabled: true }],
    };
    const staff = settings.members.find((m) => m.role === "staff") ?? settings.members[0];
    if (!staff) return null;
    const outcome = testFaq(trial, trialSettings, staff, (c) => CATEGORY_LABELS[c]);
    return { outcome, draftId };
  }, [trial, draft, settings]);
  const trialMessage = describeTrial(trialResult);

  // How the reply will look: the FAQ reply pattern with {answer} filled in.
  const reply = useMemo(() => {
    const answer = draft.answer.trim();
    if (!answer) return null;
    const pattern = settings.replyPatterns.find((p) => p.category === "question" && p.enabled && isFaqPattern(p));
    const tpl = pattern?.texts.find((t) => t.includes("{answer}"));
    return tpl ? renderTemplate(fixPlaceholderBraces(tpl), { ...sampleVars("question", settings), answer }) : answer;
  }, [draft.answer, settings]);

  const set = (patch: Partial<FaqEntry>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (check.errors.question || check.errors.answer || check.errors.patterns) return;
    const saved = finalizeFaq({ ...draft, id: isNew ? newId("faq") : draft.id });
    upsert(saved);
    toast(isNew ? "よくある質問を追加しました" : "よくある質問を保存しました", "success", {
      description: saved.enabled ? "次に届く同じような質問から、この回答で自動返信します。" : "「自動回答に使う」がオフのため、まだ回答には使いません。",
    });
    onClose();
  };

  const answerLength = Array.from(draft.answer).length;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      persistent
      title={isNew ? "よくある質問を追加" : "よくある質問を編集"}
      description="登録した言葉を含む質問が届くと、AIがこの回答で自動返信します。登録していない質問に、AIが推測で答えることはありません。"
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
        <Field
          label="質問"
          required
          error={submitted ? check.errors.question : undefined}
          hint="一覧の見出しになります。スタッフが実際に送ってきそうな文で書くと、下の確認がしやすくなります。"
        >
          <Input
            value={draft.question}
            onChange={(e) => set({ question: e.target.value })}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="例：洗剤の補充はどこにありますか？"
            data-autofocus
          />
        </Field>

        <Field
          label="回答"
          required
          error={submitted ? check.errors.answer : undefined}
          hint={
            <>
              この文章がそのまま返信されます（{answerLength}／{MAX_ANSWER_LENGTH}文字）。先頭の「{AUTO_LABEL}」は、自動の回答だとスタッフに伝わるようにする目印です。
            </>
          }
        >
          <Textarea
            value={draft.answer}
            onChange={(e) => set({ answer: e.target.value })}
            rows={4}
            autoGrow
            maxLength={MAX_ANSWER_LENGTH}
            placeholder={`例：${AUTO_LABEL}洗剤の在庫は、各店舗バックヤードの棚にあります。`}
          />
        </Field>
        {draft.answer.trim() !== "" && !draft.answer.trim().startsWith("【") && (
          <Button
            variant="ghost"
            size="sm"
            className="-mt-3"
            onClick={() => set({ answer: `${AUTO_LABEL}${draft.answer.trimStart()}` })}
          >
            先頭に「{AUTO_LABEL}」をつける
          </Button>
        )}

        <Field
          as="fieldset"
          label="反応する言葉"
          required
          error={submitted ? check.errors.patterns : undefined}
        >
          <div className="space-y-3">
            <PatternRuleExplainer />
            <PatternGroupsEditor
              groups={draft.patterns}
              onChange={(patterns) => set({ patterns })}
              matched={matched}
              invalid={submitted && Boolean(check.errors.patterns)}
            />
          </div>
        </Field>

        <div className="space-y-2.5 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <Field label="質問の文で確かめる" hint="入力した文が、上の条件に当てはまるかを確認できます。最初は「質問」の文で確かめています。">
            <Input
              value={trial}
              onChange={(e) => setSample(e.target.value)}
              placeholder="例：洗剤ってどこに置いてありますか？"
            />
          </Field>
          {trialMessage && (
            <p
              role="status"
              className={cn(
                "flex items-start gap-1.5 text-[13px] font-medium",
                trialMessage.ok ? "text-emerald-800" : "text-amber-900",
              )}
            >
              {trialMessage.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              )}
              {trialMessage.text}
            </p>
          )}
          {trialMessage?.ok && reply && (
            <ChatPreview
              botName={settings.behavior.botName}
              incoming={{ name: "スタッフ", color: "#10b981", text: trial }}
              reply={reply}
            />
          )}
        </div>

        {check.warnings
          // While the trial box shows the question itself, its own message already says this.
          .filter((w) => sample !== null || !w.includes("どの条件にも当てはまりません"))
          .map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {w}
            </p>
          ))}

        <Toggle
          checked={draft.enabled}
          onChange={(enabled) => set({ enabled })}
          label="自動回答に使う"
          description="オフにすると、登録したまま自動回答だけを止められます。"
          className="rounded-xl bg-white p-3.5 ring-1 ring-inset ring-slate-200"
        />
      </form>
    </Modal>
  );
}
