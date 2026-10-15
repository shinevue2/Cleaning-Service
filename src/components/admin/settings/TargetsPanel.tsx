"use client";

import { useId, useState, type FormEvent } from "react";
import { BellRing, Moon, Pencil, Plus, Save, Sun, Trash2, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  CHANNEL_ICONS,
  Callout,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Toggle,
  URGENCY_TONES,
  toast,
} from "@/components/ui";
import { routeTargets } from "@/lib/engine";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import {
  CHANNEL_LABELS,
  URGENCY_LABELS,
  type Group,
  type NotifyChannel,
  type NotifyTarget,
  type Settings,
  type Urgency,
} from "@/lib/types";
import { testMoment } from "../rules/ruleUtils";
import { CheckChips, ChoiceGroup } from "./shared/Controls";
import {
  CHANNEL_ADDRESS,
  finalizeTarget,
  hasErrors,
  nightRangeLabel,
  targetWarning,
  validateTarget,
} from "./validation";

const CHANNELS: readonly NotifyChannel[] = ["line_group", "email", "chatwork", "phone"];

const CHANNEL_HELP: Record<NotifyChannel, string> = {
  line_group: "管理者用のLINEグループに通知カードを送ります",
  email: "メールで知らせます",
  chatwork: "Chatworkのチャットに投稿します",
  phone: "自動音声の電話で呼び出します",
};

const URGENCY_OPTIONS: readonly Urgency[] = ["urgent", "attention", "normal"];
const CUSTOM_GROUP = "__custom__";

/** 通知先 section. */
export function TargetsPanel() {
  const settings = useDemoStore((s) => s.settings);
  const upsert = useDemoStore((s) => s.upsertNotifyTarget);
  const remove = useDemoStore((s) => s.deleteNotifyTarget);
  const [editing, setEditing] = useState<NotifyTarget | null>(null);
  const [deleting, setDeleting] = useState<NotifyTarget | null>(null);
  const targets = settings.notifyTargets;
  const night = nightRangeLabel(settings.behavior);

  const toggle = (t: NotifyTarget, enabled: boolean) => {
    upsert({ ...t, enabled });
    toast(enabled ? `「${t.name}」への通知を再開しました` : `「${t.name}」への通知を停止しました`, enabled ? "success" : "info");
  };

  const startAdd = () =>
    setEditing({
      id: "",
      name: "",
      channel: "email",
      address: "",
      urgencies: ["urgent"],
      nightOnly: false,
      enabled: true,
    });

  return (
    <div className="space-y-5">
      <RoutingSummary settings={settings} />

      <Card
        title="通知先"
        icon={BellRing}
        actions={
          <Button icon={Plus} size="sm" onClick={startAdd}>
            通知先を追加
          </Button>
        }
        flush
      >
        <p className="px-4 pb-4 text-[13px] leading-relaxed text-slate-500 sm:px-5">
          管理者へ転送するとき、どこに知らせるかを決めます。緊急度ごと、時間帯ごとに分けられます。デモでは実際には送信せず、記録だけを残します。
        </p>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {targets.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-500">通知先が登録されていません。</li>
          )}
          {targets.map((t) => {
            const Icon = CHANNEL_ICONS[t.channel];
            const group =
              t.channel === "line_group"
                ? settings.groups.find((g) => g.id === t.address || g.lineGroupId === t.address)
                : undefined;
            return (
              <li key={t.id} className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", !t.enabled && "bg-slate-50/70")}>
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                    t.enabled ? "bg-brand-50 text-brand-700 ring-brand-100" : "bg-slate-100 text-slate-500 ring-slate-200",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={cn("text-sm font-bold", t.enabled ? "text-slate-900" : "text-slate-500")}>{t.name}</p>
                    {!t.enabled && (
                      <Badge tone="gray" size="sm">
                        停止中
                      </Badge>
                    )}
                  </div>
                  <p className="break-all text-xs text-slate-600">
                    {CHANNEL_LABELS[t.channel]}：{group ? group.name : t.address}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {URGENCY_OPTIONS.filter((u) => t.urgencies.includes(u)).map((u) => (
                      <Badge key={u} tone={URGENCY_TONES[u]} size="sm">
                        {URGENCY_LABELS[u]}
                      </Badge>
                    ))}
                    {t.nightOnly && (
                      <Badge tone="purple" size="sm" icon={Moon}>
                        夜間のみ{night ? `（${night}）` : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  <Toggle size="sm" hideLabel label={`「${t.name}」に通知する`} checked={t.enabled} onChange={(v) => toggle(t, v)} />
                  <div className="flex items-center">
                    <IconButton label={`「${t.name}」を編集`} icon={Pencil} size="sm" onClick={() => setEditing(t)} />
                    <IconButton
                      label={`「${t.name}」を削除`}
                      icon={Trash2}
                      size="sm"
                      onClick={() => setDeleting(t)}
                      className="hover:text-red-600"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {editing && (
        <TargetModal key={editing.id || "new"} target={editing} groups={settings.groups} night={night} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={deleting ? `「${deleting.name}」を削除しますか？` : ""}
        description="この通知先には、今後は知らせなくなります。元に戻すことはできません。一時的に止めたいときは、削除せずにスイッチをオフにしてください。"
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          remove(deleting.id);
          toast(`「${deleting.name}」を削除しました`, "info");
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/** Who gets told, per urgency × day/night — the routing at a glance. */
function RoutingSummary({ settings }: { settings: Settings }) {
  const day = testMoment("day", settings.behavior);
  const night = testMoment("night", settings.behavior);
  const nightLabel = nightRangeLabel(settings.behavior);
  const periods = [
    { key: "day", label: "日中", icon: Sun, moment: day },
    ...(night ? [{ key: "night", label: `夜間（${nightLabel}）`, icon: Moon, moment: night }] : []),
  ];
  const rows: Urgency[] = ["urgent", "attention"];
  const missingUrgent = periods.some((p) => p.moment && routeTargets("urgent", p.moment.now, settings).length === 0);

  return (
    <Card title="いまの通知のながれ" description="管理者へ転送するときに、どこへ知らせるかの一覧です。下の通知先を変えると、すぐにここへ反映されます。">
      <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {rows.map((u) => (
          <section
            key={u}
            aria-label={`${URGENCY_LABELS[u]}のとき`}
            className="grid gap-3 p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
          >
            <div>
              <Badge tone={URGENCY_TONES[u]} solid={u === "urgent"} size="sm">
                {URGENCY_LABELS[u]}
              </Badge>
            </div>
            {periods.map((p) => {
              const list = p.moment ? routeTargets(u, p.moment.now, settings) : [];
              return (
                <div key={p.key} className="min-w-0">
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                    <p.icon className="size-3.5" aria-hidden />
                    {p.label}
                  </p>
                  {list.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                      <TriangleAlert className="size-3.5" aria-hidden />
                      通知先なし
                    </span>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((t) => {
                        const Icon = CHANNEL_ICONS[t.channel];
                        return (
                          <li key={t.id} className="flex items-start gap-1.5 text-[13px] text-slate-800">
                            <Icon className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
                            <span className="min-w-0">{t.name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {missingUrgent && (
        <Callout tone="danger" className="mt-4" title="緊急のときに知らせる先がない時間帯があります">
          緊急トラブルを見逃さないよう、「緊急」を受け取る通知先を有効にしてください。
        </Callout>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        LINEグループへの通知は、LINE公式アカウントの月の送信数に数えられます（グループ内での自動返信は数えられません）。メールやChatworkへの通知は数えられません。
      </p>
    </Card>
  );
}

function TargetModal({
  target,
  groups,
  night,
  onClose,
}: {
  target: NotifyTarget;
  groups: Group[];
  night: string | null;
  onClose: () => void;
}) {
  const upsert = useDemoStore((s) => s.upsertNotifyTarget);
  const [draft, setDraft] = useState<NotifyTarget>(target);
  const [custom, setCustom] = useState(
    () => target.channel === "line_group" && target.address !== "" && !groups.some((g) => g.id === target.address),
  );
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();
  const isNew = target.id === "";
  const errors = validateTarget(draft, groups);
  const warning = targetWarning(draft, groups);
  const address = CHANNEL_ADDRESS[draft.channel];
  const set = (patch: Partial<NotifyTarget>) => setDraft((d) => ({ ...d, ...patch }));
  const sortedGroups = [...groups].sort((a, b) => (a.kind === "alerts" ? 0 : 1) - (b.kind === "alerts" ? 0 : 1));

  const changeChannel = (channel: NotifyChannel) => {
    if (channel === draft.channel) return;
    const alerts = groups.find((g) => g.kind === "alerts");
    setCustom(false);
    set({ channel, address: channel === "line_group" ? (alerts?.id ?? "") : "" });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors)) return;
    const saved = finalizeTarget({ ...draft, id: isNew ? newId("tgt") : draft.id });
    upsert(saved);
    toast(isNew ? `「${saved.name}」を通知先に追加しました` : `「${saved.name}」を保存しました`, "success");
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      persistent
      title={isNew ? "通知先を追加" : "通知先を編集"}
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
        <Field as="fieldset" label="知らせる方法">
          <ChoiceGroup
            value={draft.channel}
            onChange={changeChannel}
            columns={2}
            options={CHANNELS.map((c) => {
              const Icon = CHANNEL_ICONS[c];
              return {
                value: c,
                label: CHANNEL_LABELS[c],
                description: CHANNEL_HELP[c],
                icon: <Icon className="size-4 text-slate-500" aria-hidden />,
              };
            })}
          />
        </Field>

        <Field label="通知先の名前" required error={submitted ? errors.name : undefined} hint="一覧で見分けるための名前です。">
          <Input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={30}
            placeholder="例：店長のメール"
            autoComplete="off"
          />
        </Field>

        {draft.channel === "line_group" ? (
          <div className="space-y-3">
            <Field label={address.label} hint={address.hint} error={!custom && submitted ? errors.address : undefined}>
              <Select
                value={custom ? CUSTOM_GROUP : draft.address}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustom(value === CUSTOM_GROUP);
                  set({ address: value === CUSTOM_GROUP ? "" : value });
                }}
                placeholder="選んでください"
              >
                {sortedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value={CUSTOM_GROUP}>ほかのグループ（LINEのグループIDを入力）</option>
              </Select>
            </Field>
            {custom && (
              <Field
                label="LINEのグループID"
                error={submitted ? errors.address : undefined}
                hint="グループで「#ID」と送ると、ボットがIDを教えてくれます（本番のみ）。"
              >
                <Input
                  value={draft.address}
                  onChange={(e) => set({ address: e.target.value })}
                  placeholder="C から始まる33文字"
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            )}
            {warning && (
              <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                {warning}
              </p>
            )}
          </div>
        ) : (
          <Field label={address.label} required error={submitted ? errors.address : undefined} hint={address.hint}>
            <Input
              value={draft.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder={address.placeholder}
              type={draft.channel === "email" ? "email" : draft.channel === "phone" ? "tel" : "text"}
              inputMode={draft.channel === "phone" ? "tel" : draft.channel === "email" ? "email" : undefined}
              autoComplete="off"
            />
          </Field>
        )}

        <Field
          as="fieldset"
          label="知らせる緊急度"
          error={submitted ? errors.urgencies : undefined}
          hint="「通常」のメッセージは、ふだんは転送されません（返信だけで終わります）。"
        >
          <CheckChips
            value={draft.urgencies}
            onChange={(urgencies) => set({ urgencies })}
            options={URGENCY_OPTIONS.map((u) => ({ value: u, label: URGENCY_LABELS[u] }))}
          />
        </Field>

        <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <Toggle
            checked={draft.nightOnly}
            onChange={(nightOnly) => set({ nightOnly })}
            label="夜間だけ知らせる"
            description={
              night
                ? `夜間（${night}）だけ通知します。夜間の時間帯は「動作設定」で変更できます。`
                : "夜間の時間帯が設定されていないため、オンにするとこの通知先には届きません。"
            }
          />
          <Toggle
            checked={draft.enabled}
            onChange={(enabled) => set({ enabled })}
            label="この通知先を使う"
            description="オフにすると、登録したまま通知だけを止められます。"
          />
        </div>
      </form>
    </Modal>
  );
}
