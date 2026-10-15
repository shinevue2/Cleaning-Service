"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Field, Modal, Select, Textarea, toast } from "@/components/ui";
import { useDemoStore } from "@/lib/store";
import { ISSUE_STATUS_LABELS, type Issue, type IssueStatus } from "@/lib/types";

export const ISSUE_STATUS_OPTIONS = (Object.keys(ISSUE_STATUS_LABELS) as IssueStatus[]).map((value) => ({
  value,
  label: ISSUE_STATUS_LABELS[value],
}));

/** One-tap phrases for the memo (the owner rarely wants to type on a phone). */
const MEMO_PHRASES = ["業者に連絡済み", "現地で確認します", "スタッフに対応を依頼済み", "お客様へ連絡済み", "様子を見ます"];

const MAX_NOTE = 300;

export interface IssueMemoModalProps {
  issue: Issue;
  onClose: () => void;
}

/** Edit the status and the manager memo of an issue. Mount it only while open (state starts from the issue). */
export function IssueMemoModal({ issue, onClose }: IssueMemoModalProps) {
  const setIssueStatus = useDemoStore((s) => s.setIssueStatus);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [note, setNote] = useState(issue.note ?? "");
  const formId = useId();

  const addPhrase = (phrase: string) => {
    setNote((current) => {
      const trimmed = current.trim();
      if (trimmed.includes(phrase)) return current;
      return (trimmed ? `${trimmed}。${phrase}` : phrase).slice(0, MAX_NOTE);
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIssueStatus(issue.id, status, note);
    const statusChanged = status !== issue.status;
    toast(statusChanged ? `「${ISSUE_STATUS_LABELS[status]}」にして、メモを保存しました` : "メモを保存しました", "success", {
      description: status === "resolved" ? "要対応リストから外れ、「本日対応済み」に移りました。" : undefined,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="対応状況とメモ"
      description={issue.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form={formId}>
            保存する
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-5">
        <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
          <p className="mb-1 text-xs font-semibold text-slate-500">届いた内容</p>
          <p className="whitespace-pre-wrap">{issue.detail}</p>
        </div>

        <Field label="対応状況">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as IssueStatus)}
            options={ISSUE_STATUS_OPTIONS}
          />
        </Field>

        <div className="space-y-2">
          <Field
            label="メモ"
            optional
            hint={`対応の経過を残しておけます。日次レポートにも表示されます（${note.length}／${MAX_NOTE}文字）。`}
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              rows={3}
              maxLength={MAX_NOTE}
              placeholder="例：業者に修理を依頼済み。明日10時に訪問予定です。"
              data-autofocus
            />
          </Field>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="よく使う言葉を追加">
            {MEMO_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => addPhrase(phrase)}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-300"
              >
                <Plus className="size-3" aria-hidden />
                {phrase}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
