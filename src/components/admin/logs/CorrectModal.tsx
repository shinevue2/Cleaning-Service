"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, GraduationCap, ShieldAlert } from "lucide-react";
import {
  Button,
  Callout,
  CategoryBadge,
  Field,
  Modal,
  Select,
  UrgencyBadge,
  toast,
} from "@/components/ui";
import { matchRules, normalize } from "@/lib/engine";
import { useDemoStore } from "@/lib/store";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  URGENCY_LABELS,
  type AnalysisRecord,
  type Category,
  type Urgency,
} from "@/lib/types";
import { DEFAULT_URGENCY, type LogJudgement } from "./logUtils";

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
const URGENCY_ORDER: Urgency[] = ["normal", "attention", "urgent"];
const URGENCY_OPTIONS = URGENCY_ORDER.map((u) => ({ value: u, label: URGENCY_LABELS[u] }));

/** Plain explanations shown under the selects so the owner knows what each choice does. */
const CATEGORY_EFFECT: Record<Category, string> = {
  cleaning_start: "「よろしくお願いします」と返信し、店舗を「清掃中」にします。",
  cleaning_done: "「お疲れ様でした」と返信し、店舗を「完了」にします。",
  leftover: "お礼を返信し、管理者へ転送して要対応リストに登録します。",
  machine_error: "お礼を返信し、管理者へ転送して要対応リストに登録します。",
  question: "よくある質問にあれば自動で回答し、なければ管理者へ回します。",
  info: "「承知しました」と返信します。転送はしません。",
  emergency: "すぐに管理者へ転送し、メールや夜間の電話でもお知らせします。",
  chat: "あいさつ・お礼として扱い、基本的に返信しません。",
  unknown: "判断を保留し、内容の確認を管理者へお願いします。",
};

const URGENCY_EFFECT: Record<Urgency, string> = {
  normal: "通常：管理者への通知はしません。",
  attention: "要対応：管理者グループへ転送します。",
  urgent: "緊急：管理者グループに加えて、メール・夜間の電話でもお知らせします。",
};

export interface CorrectModalProps {
  record: AnalysisRecord;
  /** the judgement currently shown (after any earlier correction) */
  current: LogJudgement;
  onClose: () => void;
}

/** 「判定を修正」 — mount only while open (the form state starts from the current judgement). */
export function CorrectModal({ record, current, onClose }: CorrectModalProps) {
  const correctRecord = useDemoStore((s) => s.correctRecord);
  const rules = useDemoStore((s) => s.settings.keywordRules);
  const sender = useDemoStore((s) => s.settings.members.find((m) => m.id === record.senderId));
  const [category, setCategory] = useState<Category>(current.category);
  const [urgency, setUrgency] = useState<Urgency>(current.urgency);
  const formId = useId();

  const effectiveUrgency: Urgency = category === "emergency" ? "urgent" : urgency;
  const unchanged = category === current.category && effectiveUrgency === current.urgency;
  const hasText = normalize(record.combinedText) !== "";
  // The engine never lets a learned example lower a message that contains an emergency keyword.
  const emergencyWords = hasText
    ? [
        ...new Set(
          matchRules(record.combinedText, rules, sender?.role ?? "staff")
            .filter((hit) => hit.rule.category === "emergency")
            .flatMap((hit) => hit.matches.map((m) => m.keyword)),
        ),
      ]
    : [];
  const keptAsEmergency = emergencyWords.length > 0 && category !== "emergency";
  const openIssue = useDemoStore((s) => s.issues.find((i) => i.analysisId === record.id && i.status !== "resolved"));
  const closesIssue = Boolean(openIssue) && effectiveUrgency === "normal";

  const onCategory = (next: Category) => {
    setCategory(next);
    // Suggest the urgency this kind of message usually has; the manager can still change it.
    setUrgency(DEFAULT_URGENCY[next]);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unchanged) return;
    correctRecord(record.id, category, effectiveUrgency);
    toast("判定を修正しました", "success", {
      description: hasText
        ? `次回から同じような内容は「${CATEGORY_LABELS[category]}」（${URGENCY_LABELS[effectiveUrgency]}）として扱います。`
        : `この記録を「${CATEGORY_LABELS[category]}」（${URGENCY_LABELS[effectiveUrgency]}）に修正しました。`,
      duration: 5000,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="判定を修正"
      description="正しい分類と緊急度を選んでください。"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form={formId} disabled={unchanged} icon={GraduationCap}>
            この判定で覚えさせる
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-5">
        <div className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-200">
          <p className="text-xs font-semibold text-slate-500">対象のメッセージ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {record.combinedText || `（写真${record.photoCount}枚のみの投稿）`}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">いまの判定</span>
            <CategoryBadge category={current.category} size="sm" />
            <UrgencyBadge urgency={current.urgency} size="sm" />
            {!unchanged && (
              <>
                <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
                <span className="sr-only">修正後</span>
                <CategoryBadge category={category} size="sm" />
                <UrgencyBadge urgency={effectiveUrgency} size="sm" />
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="正しい分類" hint={CATEGORY_EFFECT[category]}>
            <Select
              value={category}
              onChange={(e) => onCategory(e.target.value as Category)}
              options={CATEGORY_OPTIONS}
              data-autofocus
            />
          </Field>
          <Field
            label="緊急度"
            hint={category === "emergency" ? "緊急トラブルは、常に「緊急」として扱います。" : URGENCY_EFFECT[effectiveUrgency]}
          >
            <Select
              value={effectiveUrgency}
              onChange={(e) => setUrgency(e.target.value as Urgency)}
              options={URGENCY_OPTIONS}
              disabled={category === "emergency"}
            />
          </Field>
        </div>

        {closesIssue && (
          <Callout tone="success" icon={ClipboardCheck} title="要対応リストからも外します">
            この判定では対応が要らないため、要対応リストの案件を「対応済み」にします（メモ：判定の修正により、対応不要としました）。
          </Callout>
        )}

        {keptAsEmergency ? (
          <Callout tone="warning" icon={ShieldAlert} title="緊急の言葉を含む内容は、安全のため修正後も緊急として扱います">
            このメッセージには緊急の言葉（{emergencyWords.slice(0, 3).map((w) => `“${w}”`).join("")}）が含まれています。この記録の表示は修正されますが、次回から同じような内容が届いたときも、見落としを防ぐため「緊急」として管理者へ転送します。誤検知が続く場合は、
            <Link href="/admin/rules#keywords" className="font-semibold underline underline-offset-2">
              判定ルール
            </Link>
            の「除外する言葉」に、その言い回し（例：「{emergencyWords[0]}の点検」）を追加してください。すでに送った返信や転送は取り消されません。
          </Callout>
        ) : hasText ? (
          <Callout tone="brand" icon={GraduationCap} title="次回から同じような内容はこの判定になります">
            この修正は「判定の手本」として保存され、言い回しが少し違うメッセージにも使われます。すでに送った返信や転送は取り消されません。
          </Callout>
        ) : (
          <Callout tone="warning" title="写真のみの投稿です">
            文章がないため「判定の手本」には保存されず、この記録の判定だけを修正します。すでに送った返信や転送は取り消されません。
          </Callout>
        )}
      </form>
    </Modal>
  );
}
