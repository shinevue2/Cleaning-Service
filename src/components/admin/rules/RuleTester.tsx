"use client";

import { useDeferredValue, useId, useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  ClipboardList,
  FlaskConical,
  Forward,
  GraduationCap,
  Moon,
  Reply,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  Sun,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  CHANNEL_ICONS,
  Card,
  CategoryBadge,
  Checkbox,
  ConfidenceMeter,
  DecisionSourceBadge,
  EmptyState,
  Field,
  Select,
  Textarea,
  UrgencyBadge,
} from "@/components/ui";
import { routeTargets } from "@/lib/engine";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { SAMPLE_SCENARIOS } from "@/lib/samples";
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  CLEANING_STATUS_LABELS,
  ROLE_LABELS,
  URGENCY_LABELS,
  type Member,
  type Settings,
} from "@/lib/types";
import { ChoiceGroup, InfoRow } from "../settings/shared/Controls";
import { ChatPreview } from "../settings/shared/ChatPreview";
import { groupForMember, runTest, testMoment, type TestResult, type TimeOfDay } from "./ruleUtils";

export interface TesterState {
  text: string;
  senderId: string;
  photo: boolean;
  time: TimeOfDay;
  /** which reply variant is previewed */
  variant: number;
}

export function initialTesterState(settings: Settings): TesterState {
  const staff = settings.members.find((m) => m.role === "staff") ?? settings.members[0];
  return { text: "", senderId: staff?.id ?? "", photo: false, time: "day", variant: 0 };
}

function memberLabel(m: Member): string {
  return m.name.includes(ROLE_LABELS[m.role]) ? m.name : `${m.name}（${ROLE_LABELS[m.role]}）`;
}

function shortName(name: string): string {
  return name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim() || name;
}

export interface RuleTesterProps {
  state: TesterState;
  onChange: (next: TesterState) => void;
}

/** テスト tab: runs the engine on a typed message with the current settings. Nothing is saved. */
export function RuleTester({ state, onChange }: RuleTesterProps) {
  const settings = useDemoStore((s) => s.settings);
  const id = useId();
  const members = settings.members;
  const sender = members.find((m) => m.id === state.senderId) ?? members.find((m) => m.role === "staff") ?? members[0];
  const nightMoment = testMoment("night", settings.behavior);
  const dayMoment = testMoment("day", settings.behavior);
  const time: TimeOfDay = state.time === "night" && nightMoment ? "night" : "day";
  const moment = (time === "night" ? nightMoment : dayMoment) ?? dayMoment;

  const nowMs = moment?.now;

  const text = useDeferredValue(state.text);
  const result = useMemo<TestResult | null>(() => {
    if (!sender || nowMs === undefined || (text.trim() === "" && !state.photo)) return null;
    return runTest(
      { text, photoCount: state.photo ? 1 : 0, sender, group: groupForMember(sender, settings.groups), now: nowMs },
      settings,
    );
  }, [text, state.photo, sender, nowMs, settings]);

  const set = (patch: Partial<TesterState>) => onChange({ ...state, variant: 0, ...patch });

  const applyScenario = (scenarioId: string) => {
    const sc = SAMPLE_SCENARIOS.find((x) => x.id === scenarioId);
    if (!sc) return;
    const wantedRole = sc.groupId === "g_call" ? "callcenter" : "staff";
    const who = members.find((m) => m.id === sc.senderId) ?? members.find((m) => m.role === wantedRole) ?? sender;
    set({ text: sc.text, senderId: who?.id ?? state.senderId, photo: sc.photoIds.length > 0 });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
      <Card
        title="メッセージを試す"
        icon={FlaskConical}
        description="いまの返信パターン・判定ルール・よくある質問で、AIがどう判断して何をするかを確認できます。ここでのテストは記録に残りません。"
        className="lg:sticky lg:top-[calc(var(--app-header-height)+1.5rem)]"
      >
        <div className="space-y-4">
          <div>
            <p id={`${id}-samples`} className="mb-2 text-xs font-semibold text-slate-500">
              サンプルから選ぶ
            </p>
            <div role="group" aria-labelledby={`${id}-samples`} className="flex flex-wrap gap-1.5">
              {SAMPLE_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => applyScenario(sc.id)}
                  className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {sc.groupId === "g_call" ? `CC：${sc.label}` : sc.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="メッセージ">
            <Textarea
              value={state.text}
              onChange={(e) => set({ text: e.target.value })}
              rows={3}
              autoGrow
              maxLength={1000}
              placeholder="例：北口店の乾燥機2番が動きません"
            />
          </Field>

          <Field label="送る人">
            <Select
              value={sender?.id ?? ""}
              onChange={(e) => set({ senderId: e.target.value })}
              options={members.map((m) => ({ value: m.id, label: memberLabel(m) }))}
            />
          </Field>

          <Checkbox
            checked={state.photo}
            onChange={(photo) => set({ photo })}
            label="写真あり"
            description="写真が1枚添付されている場合として判定します。"
          />

          <Field as="fieldset" label="時間帯">
            <ChoiceGroup
              compact
              value={time}
              onChange={(t) => set({ time: t })}
              options={[
                {
                  value: "day",
                  label: `日中（${dayMoment?.label ?? "14:00"}）`,
                  icon: <Sun className="size-4 text-amber-500" aria-hidden />,
                },
                {
                  value: "night",
                  label: nightMoment ? `夜間（${nightMoment.label}）` : "夜間（設定なし）",
                  icon: <Moon className="size-4 text-violet-500" aria-hidden />,
                  disabled: !nightMoment,
                },
              ]}
            />
          </Field>
        </div>
      </Card>

      <div className="min-w-0">
        <p className="sr-only" aria-live="polite">
          {result ? `判定結果：${CATEGORY_LABELS[result.analysis.category]}、${URGENCY_LABELS[result.analysis.urgency]}` : ""}
        </p>
        {result && sender && moment ? (
          <TestResultView
            result={result}
            settings={settings}
            sender={sender}
            text={text}
            photo={state.photo}
            timeLabel={moment.label}
            now={moment.now}
            variant={state.variant}
            onNextVariant={() => onChange({ ...state, variant: state.variant + 1 })}
          />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="ここに判定結果が表示されます"
            description="左の欄にメッセージを入力するか、サンプルを選んでください。返信の文面や転送先も確認できます。"
          />
        )}
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  done,
  title,
  children,
}: {
  icon: LucideIcon;
  done: boolean;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          done ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100" : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={cn("text-sm font-semibold", done ? "text-slate-900" : "text-slate-500")}>{title}</p>
        {children !== undefined && <div className="mt-1 text-[13px] leading-relaxed text-slate-600">{children}</div>}
      </div>
    </li>
  );
}

function TestResultView({
  result,
  settings,
  sender,
  text,
  photo,
  timeLabel,
  now,
  variant,
  onNextVariant,
}: {
  result: TestResult;
  settings: Settings;
  sender: Member;
  text: string;
  photo: boolean;
  timeLabel: string;
  now: number;
  variant: number;
  onNextVariant: () => void;
}) {
  const { analysis, plan, replies } = result;
  const { extracted } = analysis;
  const store = extracted.storeId ? settings.stores.find((s) => s.id === extracted.storeId) : undefined;
  const targets = plan.forward ? routeTargets(plan.forward.urgency, now, settings) : [];
  const faq = analysis.faqId ? settings.faqs.find((f) => f.id === analysis.faqId) : undefined;
  const reply = replies.length > 0 ? replies[variant % replies.length] : null;
  const statusStore = plan.storeStatus ? settings.stores.find((s) => s.id === plan.storeStatus?.storeId) : undefined;
  // Store status, phone calls and the FAQ are shown in their own rows.
  const notes = plan.notes.filter((n) => !n.includes("清掃状況を") && !n.includes("電話通知") && !n.startsWith("よくある質問"));
  const manager = sender.role === "manager";

  return (
    <div className="space-y-5">
      <Card title="AIの判定" icon={Sparkles} actions={<DecisionSourceBadge source={analysis.source} sample={analysis.sample} size="sm" />}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={analysis.category} />
            <UrgencyBadge urgency={analysis.urgency} />
            {analysis.secondary.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                ほかに：
                {analysis.secondary.map((c) => (
                  <CategoryBadge key={c} category={c} size="sm" />
                ))}
              </span>
            )}
          </div>
          <ConfidenceMeter value={analysis.confidence} threshold={settings.behavior.confidenceThreshold} />
          <p className="flex gap-2 rounded-xl bg-violet-50/70 px-3.5 py-3 text-sm leading-relaxed text-slate-800 ring-1 ring-inset ring-violet-100">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
            <span>
              <span className="sr-only">判断理由：</span>
              {analysis.reasoning}
            </span>
          </p>
          <dl className="space-y-2.5">
            <InfoRow label="店舗">{store?.name ?? <span className="text-slate-500">特定できませんでした</span>}</InfoRow>
            {extracted.machine && <InfoRow label="機械">{extracted.machine}</InfoRow>}
            {extracted.errorCode && <InfoRow label="エラーコード">{extracted.errorCode}</InfoRow>}
            {extracted.days !== undefined && <InfoRow label="日数">{extracted.days}日</InfoRow>}
            <InfoRow label="反応した言葉">
              {extracted.keywords.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {extracted.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-900 ring-1 ring-inset ring-brand-200"
                    >
                      {k}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-slate-500">なし</span>
              )}
            </InfoRow>
          </dl>
          {analysis.source === "learned" && (
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-brand-900">
              <GraduationCap className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                判定ログで修正された例をもとに判断しました。修正例は
                <Link href="/admin/logs" className="mx-0.5 font-semibold underline underline-offset-2">
                  判定ログ
                </Link>
                で確認できます。
              </span>
            </p>
          )}
        </div>
      </Card>

      <Card
        title="返信のプレビュー"
        icon={Reply}
        actions={
          replies.length > 1 ? (
            <Button variant="secondary" size="sm" onClick={onNextVariant}>
              別の言い回し（{(variant % replies.length) + 1}/{replies.length}）
            </Button>
          ) : undefined
        }
      >
        <ChatPreview
          botName={settings.behavior.botName}
          incoming={{ name: shortName(sender.name), color: sender.avatarColor, text, photo }}
          reply={reply}
          time={timeLabel}
          silentLabel={manager ? "管理者の投稿には返信しません" : "自動返信はしません"}
        />
        {faq && (
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <BookOpen className="mt-px size-3.5 shrink-0 text-sky-600" aria-hidden />
            よくある質問「{faq.question}」の回答を使いました。
          </p>
        )}
      </Card>

      <Card title="このあとの対応" icon={ClipboardList}>
        <ul className="divide-y divide-slate-100">
          <ActionRow icon={Reply} done={plan.reply !== null} title={plan.reply !== null ? "自動返信する" : "自動返信しない"}>
            {plan.reply === null && notes.length > 0 ? notes.join("。") : undefined}
          </ActionRow>

          <ActionRow
            icon={Forward}
            done={plan.forward !== null}
            title={plan.forward ? `管理者へ転送する（${URGENCY_LABELS[plan.forward.urgency]}）` : "管理者へは転送しない"}
          >
            {plan.forward && (
              <div className="space-y-2">
                <p className="font-semibold text-slate-800">{plan.forward.title}</p>
                {targets.length > 0 ? (
                  <ul className="space-y-1.5" aria-label="通知先">
                    {targets.map((t) => {
                      const Icon = CHANNEL_ICONS[t.channel];
                      return (
                        <li key={t.id} className="flex flex-wrap items-center gap-1.5">
                          <Icon className="size-3.5 text-slate-500" aria-hidden />
                          <span className="font-medium text-slate-800">{t.name}</span>
                          <span className="text-xs text-slate-500">（{CHANNEL_LABELS[t.channel]}）</span>
                          {t.nightOnly && (
                            <Badge tone="purple" size="sm" icon={Moon}>
                              夜間のみ
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-950 ring-1 ring-inset ring-amber-200">
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden />
                    <span>
                      「{URGENCY_LABELS[plan.forward.urgency]}」を受け取る通知先がありません。
                      <Link href="/admin/settings#targets" className="font-semibold underline underline-offset-2">
                        設定 → 通知先
                      </Link>
                      で追加してください。
                    </span>
                  </p>
                )}
                <details className="group rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200">
                  <summary className="cursor-pointer select-none px-2.5 py-2 text-xs font-semibold text-slate-700 marker:text-slate-400">
                    転送される内容を見る
                  </summary>
                  <pre className="whitespace-pre-wrap break-words px-2.5 pb-2.5 font-sans text-xs leading-relaxed text-slate-700">
                    {plan.forward.body}
                  </pre>
                </details>
              </div>
            )}
          </ActionRow>

          <ActionRow
            icon={BellRing}
            done={plan.createIssue}
            title={plan.createIssue ? "要対応リストに登録する" : "要対応リストには登録しない"}
          />

          {plan.storeStatus && statusStore && (
            <ActionRow
              icon={StoreIcon}
              done
              title={`${statusStore.name}の清掃状況を「${CLEANING_STATUS_LABELS[plan.storeStatus.status]}」にする`}
            />
          )}

          {plan.reply !== null && notes.length > 0 && (
            <ActionRow icon={ShieldCheck} done title="補足">
              {notes.join("。")}
            </ActionRow>
          )}
        </ul>
        <p className="mt-4 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          <ArrowRight className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            実際の動きは
            <Link href="/demo" className="mx-0.5 font-semibold text-brand-800 underline underline-offset-2">
              LINEシミュレーター
            </Link>
            で確かめられます。
          </span>
        </p>
      </Card>
    </div>
  );
}
