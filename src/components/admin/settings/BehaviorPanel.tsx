"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, Camera, FileText, Gauge, Moon, RotateCcw, Save, Undo2 } from "lucide-react";
import { Button, Card, Field, Input, Toggle, toast } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import { MAX_AGGREGATE_SECONDS, MAX_REPLY_DELAY_MS, useDemoStore } from "@/lib/store";
import { DEFAULT_BEHAVIOR } from "@/lib/seed";
import type { BehaviorSettings } from "@/lib/types";
import { RangeInput } from "./shared/Controls";
import { useUnsavedGuard } from "./shared/useUnsavedGuard";
import { estimateHeld, hasErrors, nightRangeLabel, sameBehavior, toTimeInput, validateBehavior } from "./validation";

/** 動作設定 section: one form, saved with one button. */
export function BehaviorPanel() {
  const stored = useDemoStore((s) => s.settings.behavior);
  const records = useDemoStore((s) => s.records);
  const updateBehavior = useDemoStore((s) => s.updateBehavior);
  // null = showing the saved values (follows changes made in another tab).
  const [draft, setDraft] = useState<BehaviorSettings | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const value = draft ?? stored;
  const dirty = draft !== null && !sameBehavior(draft, stored);
  const errors = validateBehavior(value);
  const shown = submitted ? errors : {};
  const night = nightRangeLabel(value);
  const impact = estimateHeld(records, value.confidenceThreshold);
  const isDefault = sameBehavior(value, DEFAULT_BEHAVIOR);
  useUnsavedGuard(dirty);

  const set = (patch: Partial<BehaviorSettings>) => setDraft({ ...value, ...patch });

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors)) {
      toast("入力内容を確認してください", "warning", { description: "赤字の項目を直してから保存してください。" });
      return;
    }
    updateBehavior({ ...value, botName: value.botName.trim() });
    setDraft(null);
    setSubmitted(false);
    toast("動作設定を保存しました", "success", { description: "次に届くメッセージから、この設定で動きます。" });
  };

  const revert = () => {
    setDraft(null);
    setSubmitted(false);
  };

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <Card title="返信のしかた" icon={Bot}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="アシスタントの名前"
            required
            error={shown.botName}
            hint="シミュレーターでボットの名前として表示されます（本番では、LINE公式アカウントの名前が表示されます）。"
          >
            <Input value={value.botName} onChange={(e) => set({ botName: e.target.value })} maxLength={30} />
          </Field>
          <Field
            label="返信するまでの間"
            error={shown.replyDelayMs}
            hint="すぐに返すと機械的に見えるため、少し間をあけて返信します。緊急時も同じです。"
          >
            <RangeInput
              value={value.replyDelayMs / 1000}
              onChange={(sec) => set({ replyDelayMs: Math.round(sec * 1000) })}
              min={0}
              max={Math.min(5, MAX_REPLY_DELAY_MS / 1000)}
              step={0.1}
              format={(sec) => `${sec.toFixed(1)}秒`}
              minLabel="すぐ返信"
              maxLabel="ゆっくり"
            />
          </Field>
        </div>
      </Card>

      <Card title="写真とコメントのまとめ方" icon={Camera}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="写真・コメントを待つ時間"
            error={shown.aggregateSeconds}
            hint="写真とコメントが別々に送られてきたとき、この秒数だけ待ってから1件の報告としてまとめて判定します。短すぎると二重に返信することがあります（おすすめ：5〜10秒）。緊急のメッセージは待たずにすぐ対応します。"
          >
            <RangeInput
              value={value.aggregateSeconds}
              onChange={(sec) => set({ aggregateSeconds: Math.round(sec) })}
              min={0}
              max={Math.min(30, MAX_AGGREGATE_SECONDS)}
              step={1}
              format={(sec) => (sec === 0 ? "待たない" : `${sec}秒`)}
              minLabel="待たない"
              maxLabel="30秒"
            />
          </Field>
          <Toggle
            checked={value.askPhotoWhenMissing}
            onChange={(askPhotoWhenMissing) => set({ askPhotoWhenMissing })}
            label="完了報告に写真がないときは、写真をお願いする"
            description="オンにすると「お手数ですが、完了写真の送付もお願いします」と返信し、店舗の清掃状況を「写真待ち」にします。"
            className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200 md:self-start"
          />
        </div>
      </Card>

      <Card title="AIの判断の慎重さ" icon={Gauge}>
        <Field
          label="自動で対応する基準（確信度）"
          error={shown.confidenceThreshold}
          hint="AIの確信度がこの値より低いときは、自動で返信せず「判定保留」として担当者に確認を回します。高くするほど慎重に、低くするほど自動で対応する件数が増えます。緊急トラブルは、確信度にかかわらず必ず通知します。"
        >
          <RangeInput
            value={value.confidenceThreshold}
            onChange={(t) => set({ confidenceThreshold: Math.round(t * 100) / 100 })}
            min={0.3}
            max={0.9}
            step={0.05}
            format={(t) => formatPercent(t)}
            minLabel="自動での対応を増やす"
            maxLabel="慎重に人へ回す"
          />
        </Field>
        <p className="mt-3 rounded-xl bg-violet-50/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-violet-950 ring-1 ring-inset ring-violet-100">
          {impact.total > 0 ? (
            <>
              これまでの判定 {impact.total}件 のうち、この基準によって「判定保留」（担当者が確認）になるのは
              <strong className="mx-0.5 font-bold">{impact.held}件</strong>
              です。
              {impact.unclear > 0 && (
                <span className="block text-xs text-violet-900/80">
                  このほかに、手がかりがなく判定保留になったものが {impact.unclear}件 あります（基準を変えても変わりません）。
                </span>
              )}
            </>
          ) : (
            "シミュレーターで投稿すると、この基準で何件が担当者確認になるかの目安が表示されます。"
          )}
          <span className="block text-xs text-violet-900/80">おすすめは 55%（初期設定）です。</span>
        </p>
      </Card>

      <Card title="夜間・日次レポート" icon={Moon}>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="夜間の開始" error={shown.nightStart}>
            <Input
              type="time"
              value={toTimeInput(value.nightStart)}
              onChange={(e) => set({ nightStart: e.target.value })}
              step={300}
            />
          </Field>
          <Field label="夜間の終了" error={shown.nightEnd}>
            <Input type="time" value={toTimeInput(value.nightEnd)} onChange={(e) => set({ nightEnd: e.target.value })} step={300} />
          </Field>
          <Field
            label="日次レポートの時刻"
            error={shown.dailyReportTime}
            hint={
              <>
                毎日この時刻に管理者グループへまとめを送ります（デモでは自動送信はせず、
                <Link href="/admin/report" className="font-semibold text-brand-800 underline underline-offset-2">
                  日次レポート
                </Link>
                から送信できます）。
              </>
            }
          >
            <Input
              type="time"
              value={toTimeInput(value.dailyReportTime)}
              onChange={(e) => set({ dailyReportTime: e.target.value })}
              step={300}
            />
          </Field>
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[13px] leading-relaxed text-slate-600">
          <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          {night
            ? `夜間（${night}）は、緊急時の返信が夜間用の文面に変わり、「夜間のみ」の通知先（電話など）にも知らせます。`
            : "開始と終了が同じ時刻のため、夜間の扱いはしません。"}
        </p>
      </Card>

      <div
        className={
          dirty
            ? "sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur sm:bottom-5"
            : "flex flex-wrap items-center gap-2"
        }
      >
        <p aria-live="polite" className="mr-auto text-[13px] font-medium text-slate-600">
          {dirty ? (
            <span className="text-amber-900">保存していない変更があります。</span>
          ) : (
            "変更すると、ここに保存ボタンが表示されます。"
          )}
        </p>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              setDraft({ ...DEFAULT_BEHAVIOR });
              toast("初期設定の値を入れました", "info", { description: "「保存する」を押すと反映されます。" });
            }}
          >
            初期設定の値に戻す
          </Button>
        )}
        {dirty && (
          <>
            <Button variant="secondary" size="sm" icon={Undo2} onClick={revert}>
              元に戻す
            </Button>
            <Button type="submit" size="sm" icon={Save}>
              保存する
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
