"use client";

import type { ReactNode } from "react";
import { BookmarkPlus, CircleCheck, CircleSlash, FlaskConical, Forward, PauseCircle, TriangleAlert } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { renderTemplate } from "@/lib/engine";
import { cn } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { fixPlaceholderBraces, isFaqPattern, sampleVars } from "../rules/ruleUtils";
import { ChatPreview } from "../settings/shared/ChatPreview";
import type { FaqTestOutcome } from "./faqUtils";

const SAMPLES = ["洗剤の補充はどこにありますか？", "ゴミ出しは何曜日ですか？", "自販機の釣り銭切れはどうすればいいですか？"];

export interface FaqTesterProps {
  value: string;
  onChange: (value: string) => void;
  outcome: FaqTestOutcome;
  settings: Settings;
  onRegister: () => void;
  onEnable: (faqId: string) => void;
  className?: string;
}

/** 「質問を試す」: shows which FAQ answers a question, or why none does. */
export function FaqTester({ value, onChange, outcome, settings, onRegister, onEnable, className }: FaqTesterProps) {
  const pattern = settings.replyPatterns.find((p) => p.category === "question" && p.enabled && isFaqPattern(p));
  const reply =
    outcome.kind === "answer"
      ? (() => {
          const tpl = pattern?.texts.find((t) => t.includes("{answer}"));
          const answer = outcome.match.faq.answer;
          return tpl ? renderTemplate(fixPlaceholderBraces(tpl), { ...sampleVars("question", settings), answer }) : answer;
        })()
      : null;

  return (
    <Card
      title="質問を試す"
      icon={FlaskConical}
      description="スタッフから届きそうな質問を入力すると、どの回答が使われるかを確認できます。"
      className={className}
    >
      <div className="space-y-3">
        <Input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例：洗剤の補充はどこにありますか？"
          aria-label="試す質問"
        />
        {value.trim() === "" && (
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChange(q)}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {value.trim() !== "" && (
          <div role="status" className="space-y-3">
            <Verdict outcome={outcome} />
            {outcome.kind === "answer" && reply && (
              <ChatPreview
                botName={settings.behavior.botName}
                incoming={{ name: "スタッフ", color: "#10b981", text: value }}
                reply={reply}
              />
            )}
            {outcome.kind === "disabled" && (
              <Button size="sm" variant="secondary" icon={CircleCheck} onClick={() => onEnable(outcome.match.faq.id)}>
                この質問を自動回答に使う
              </Button>
            )}
            {(outcome.kind === "none" || outcome.kind === "not_question") && (
              <Button size="sm" variant="secondary" icon={BookmarkPlus} onClick={onRegister}>
                この質問を登録する
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function Verdict({ outcome }: { outcome: FaqTestOutcome }) {
  const box = (tone: "green" | "amber" | "slate" | "red", icon: ReactNode, title: string, body?: string) => (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset",
        tone === "green" && "bg-emerald-50 text-emerald-950 ring-emerald-200",
        tone === "amber" && "bg-amber-50 text-amber-950 ring-amber-200",
        tone === "slate" && "bg-slate-50 text-slate-800 ring-slate-200",
        tone === "red" && "bg-red-50 text-red-950 ring-red-200",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {body && <p className="mt-0.5 opacity-90">{body}</p>}
      </div>
    </div>
  );

  switch (outcome.kind) {
    case "answer":
      return box(
        "green",
        <CircleCheck className="size-4 text-emerald-600" aria-hidden />,
        "自動で回答します",
        `「${outcome.match.faq.question}」の回答を使います。`,
      );
    case "not_question":
      return box(
        "amber",
        <TriangleAlert className="size-4 text-amber-600" aria-hidden />,
        "言葉は一致しますが、自動回答はしません",
        `「${outcome.match.faq.question}」の言葉を含みますが、質問の形（「〜ですか？」「どうすれば」など）ではないため、連絡として扱います。`,
      );
    case "overridden":
      return box(
        "red",
        <Forward className="size-4 text-red-600" aria-hidden />,
        "担当者へ転送します",
        `「${outcome.categoryLabel}」と判断されるため、よくある質問では答えず、担当者へ転送します。`,
      );
    case "disabled":
      return box(
        "slate",
        <PauseCircle className="size-4 text-slate-500" aria-hidden />,
        "停止中のよくある質問に一致します",
        `「${outcome.match.faq.question}」は停止中のため、いまは自動回答しません。`,
      );
    default:
      return box(
        "slate",
        <CircleSlash className="size-4 text-slate-500" aria-hidden />,
        "一致するよくある質問はありません",
        "AIは推測で答えず、担当者に確認を回します。回答を登録しておくと、次からは自動で答えます。",
      );
  }
}
