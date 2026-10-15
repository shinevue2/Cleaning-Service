import { BrainCircuit, Forward, MessageCircleReply, MessagesSquare, ShieldAlert, Siren, type LucideIcon } from "lucide-react";
import { CategoryBadge, UrgencyBadge } from "@/components/ui";
import type { Category, Urgency } from "@/lib/types";
import { cn } from "@/lib/format";
import { Section } from "./Section";

interface FlowStep {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FLOW: FlowStep[] = [
  {
    icon: MessagesSquare,
    title: "スタッフ・コールセンターが投稿",
    body: "清掃の開始・完了の報告や、お客様からの入電内容を、これまで通りLINEグループに投稿します。写真とコメントが別々でも大丈夫です。",
  },
  {
    icon: BrainCircuit,
    title: "AIが内容を読み取って判定",
    body: "言い回しが違っても、意味から内容を判断します。迷ったときは自動で返さず、必ず人に確認を回します。",
  },
  {
    icon: MessageCircleReply,
    title: "自動で返信・管理者へ転送",
    body: "定型の連絡にはその場でお返事。対応が必要なものは管理者グループへ、緊急時はメールや電話でもお知らせします。",
  },
];

type ActionKind = "reply" | "forward" | "urgent" | "human";

interface SortRow {
  example: string;
  category: Category;
  urgency: Urgency;
  action: string;
  kind: ActionKind;
}

const ROWS: SortRow[] = [
  { example: "これから清掃に入ります", category: "cleaning_start", urgency: "normal", action: "「よろしくお願いします」と自動返信", kind: "reply" },
  { example: "清掃完了しました（写真つき）", category: "cleaning_done", urgency: "normal", action: "「お疲れ様でした」と自動返信", kind: "reply" },
  { example: "明日10時に業者の点検が入ります", category: "info", urgency: "normal", action: "「承知しました」と自動返信", kind: "reply" },
  { example: "洗剤の補充はどこにありますか？", category: "question", urgency: "normal", action: "登録済みの回答を自動返信", kind: "reply" },
  { example: "洗濯物が3日間出しっぱなしです", category: "leftover", urgency: "attention", action: "管理者へ転送し、要対応リストに登録", kind: "forward" },
  { example: "乾燥機3番がE21エラーで止まっています", category: "machine_error", urgency: "attention", action: "管理者へ転送し、要対応リストに登録", kind: "forward" },
  { example: "洗濯機の下から水漏れしています！", category: "emergency", urgency: "urgent", action: "すぐに緊急通知（メール・夜間は電話も）", kind: "urgent" },
  { example: "判断に迷う内容", category: "unknown", urgency: "attention", action: "自動では答えず、管理者へ回す", kind: "human" },
];

const ACTION_STYLE: Record<ActionKind, { icon: LucideIcon; className: string }> = {
  reply: { icon: MessageCircleReply, className: "text-emerald-700" },
  forward: { icon: Forward, className: "text-amber-700" },
  urgent: { icon: Siren, className: "text-red-700" },
  human: { icon: ShieldAlert, className: "text-slate-700" },
};

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="しくみ"
      title="いつものLINEグループに投稿するだけ。あとはAIが仕分けます"
      description="スタッフの皆さまが新しく覚えることはありません。ボットがグループに参加して、投稿をひとつずつ読み取り、返信するか・誰に知らせるかを判断します。"
    >
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        {/* three steps */}
        <ol className="relative space-y-8">
          <span aria-hidden className="absolute bottom-6 left-[1.375rem] top-6 w-px bg-linear-to-b from-brand-300 via-brand-200 to-transparent" />
          {FLOW.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative flex gap-4">
              <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-brand-200">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-xs font-bold tracking-wide text-brand-700">STEP {i + 1}</p>
                <h3 className="mt-0.5 text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* sorting table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-0.5 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
            <h3 className="text-[15px] font-bold text-slate-900">仕分けと対応の一例</h3>
            <span className="text-xs text-slate-500">返信文や条件は管理画面で変更できます</span>
          </div>
          <div
            aria-hidden
            className="hidden grid-cols-[1fr_auto_1.3fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] font-semibold text-slate-500 md:grid"
          >
            <span>投稿の例</span>
            <span className="w-44">AIの判定</span>
            <span>自動での対応</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {ROWS.map((row) => {
              const action = ACTION_STYLE[row.kind];
              const ActionIcon = action.icon;
              return (
                <li
                  key={row.example}
                  className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[1fr_auto_1.3fr] md:items-center md:gap-4"
                >
                  <p className={cn("text-sm text-slate-800", row.category === "unknown" && "text-slate-500")}>
                    <span className="sr-only">投稿の例：</span>
                    {row.category === "unknown" ? `（${row.example}）` : `「${row.example}」`}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 md:w-44">
                    <span className="sr-only">AIの判定：</span>
                    <CategoryBadge category={row.category} size="sm" />
                    <UrgencyBadge urgency={row.urgency} size="sm" />
                  </p>
                  <p className={cn("flex items-start gap-1.5 text-[13px] font-semibold", action.className)}>
                    <ActionIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <span className="sr-only">対応：</span>
                      {row.action}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Section>
  );
}
