"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, Link2, Pencil, Save, Trash2, UserPlus, Users } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  toast,
  type BadgeTone,
} from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import { ROLE_LABELS, type Member, type MemberRole, type Store } from "@/lib/types";
import { CheckChips, ChoiceGroup } from "./shared/Controls";
import {
  AVATAR_COLORS,
  canDeleteMember,
  finalizeMember,
  hasErrors,
  isHexColor,
  nextAvatarColor,
  validateMember,
} from "./validation";

const ROLE_TONES: Record<MemberRole, BadgeTone> = { staff: "teal", callcenter: "purple", manager: "blue" };

const ROLE_HELP: Record<MemberRole, string> = {
  staff: "清掃の開始・完了やトラブルを報告する人",
  callcenter: "お客様からの連絡を共有する人",
  manager: "ボットは返信も転送もしません",
};

const ROLE_ORDER: Record<MemberRole, number> = { staff: 0, callcenter: 1, manager: 2 };

function displayName(name: string): string {
  return name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim() || name;
}

/** スタッフ section. */
export function MembersPanel() {
  const members = useDemoStore((s) => s.settings.members);
  const stores = useDemoStore((s) => s.settings.stores);
  const remove = useDemoStore((s) => s.deleteMember);
  const [editing, setEditing] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);

  const sorted = [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name;

  const askDelete = (member: Member) => {
    const check = canDeleteMember(member.id, members);
    if (!check.ok) {
      toast("このメンバーは削除できません", "warning", { description: check.reason });
      return;
    }
    setDeleting(member);
  };

  const startAdd = () =>
    setEditing({ id: "", name: "", role: "staff", storeIds: [], avatarColor: nextAvatarColor(members) });

  return (
    <Card
      title="スタッフ"
      icon={Users}
      actions={
        <Button icon={UserPlus} size="sm" onClick={startAdd}>
          スタッフを追加
        </Button>
      }
    >
      <p className="-mt-1 mb-4 text-[13px] leading-relaxed text-slate-500">
        グループでやりとりする人を登録します。名前は「田中さん、お疲れ様でした！」のような呼びかけに使います。
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {sorted.map((m) => {
          const names = m.storeIds.map(storeName).filter((n): n is string => Boolean(n));
          return (
            <li
              key={m.id}
              className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
            >
              <Avatar name={m.name} color={m.avatarColor} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-slate-900">{m.name}</p>
                  <Badge tone={ROLE_TONES[m.role]} size="sm">
                    {ROLE_LABELS[m.role]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {m.role === "manager"
                    ? "管理者の投稿には自動返信しません"
                    : names.length > 0
                      ? `担当：${names.join("・")}`
                      : m.role === "callcenter"
                        ? "全店舗の連絡を担当"
                        : "担当店舗：未設定"}
                </p>
                {m.lineUserId && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <Link2 className="size-3" aria-hidden />
                    LINEユーザーID登録済み
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton label={`${m.name}を編集`} icon={Pencil} size="sm" onClick={() => setEditing(m)} />
                <IconButton
                  label={`${m.name}を削除`}
                  icon={Trash2}
                  size="sm"
                  onClick={() => askDelete(m)}
                  className="hover:text-red-600"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <MemberModal key={editing.id || "new"} member={editing} stores={stores} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={deleting ? `${deleting.name}を削除しますか？` : ""}
        description="過去のメッセージや判定ログは残り、送信者は「未登録のメンバー」と表示されます。元に戻すことはできません。"
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          remove(deleting.id);
          toast(`${deleting.name}を削除しました`, "info");
        }}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

function MemberModal({ member, stores, onClose }: { member: Member; stores: Store[]; onClose: () => void }) {
  const members = useDemoStore((s) => s.settings.members);
  const upsert = useDemoStore((s) => s.upsertMember);
  const [draft, setDraft] = useState<Member>(member);
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();
  const isNew = member.id === "";
  const errors = validateMember(draft, members);
  const shown = submitted ? errors : { role: errors.role, lineUserId: draft.lineUserId ? errors.lineUserId : undefined };
  const set = (patch: Partial<Member>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors)) return;
    const saved = finalizeMember({ ...draft, id: isNew ? newId("mem") : draft.id }, stores);
    upsert(saved);
    toast(isNew ? `${saved.name}を追加しました` : `${saved.name}の設定を保存しました`, "success", {
      description: isNew ? "シミュレーターの「送る人」からも選べるようになりました。" : undefined,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      persistent
      title={isNew ? "スタッフを追加" : "スタッフを編集"}
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
        <div className="flex items-start gap-3">
          <Avatar name={draft.name.trim() || "?"} color={isHexColor(draft.avatarColor) ? draft.avatarColor : "#94a3b8"} size="lg" />
          <Field
            label="名前"
            required
            error={shown.name}
            hint={`返信では「${displayName(draft.name.trim()) || "田中"}さん」と呼びかけます。（ ）内の補足は呼びかけに使いません。`}
            className="flex-1"
          >
            <Input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              maxLength={30}
              placeholder="例：田中"
              autoComplete="off"
              data-autofocus
            />
          </Field>
        </div>

        <Field as="fieldset" label="役割" error={shown.role}>
          <ChoiceGroup
            value={draft.role}
            onChange={(role) => set({ role })}
            columns={3}
            options={(["staff", "callcenter", "manager"] as const).map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
              description: ROLE_HELP[r],
            }))}
          />
        </Field>

        {draft.role !== "manager" && (
          <Field
            as="fieldset"
            label="担当店舗"
            optional
            hint="担当が1店舗だけのときは、メッセージに店舗名がなくても、その店舗の報告として扱います。"
          >
            {stores.length > 0 ? (
              <CheckChips
                value={draft.storeIds}
                onChange={(storeIds) => set({ storeIds })}
                options={stores.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : (
              <p className="text-sm text-slate-500">店舗が登録されていません。</p>
            )}
          </Field>
        )}

        <Field as="fieldset" label="アイコンの色" error={shown.avatarColor}>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => {
              const checked = draft.avatarColor.toLowerCase() === c.value;
              return (
                <label
                  key={c.value}
                  title={c.label}
                  className={cn(
                    "relative flex size-9 cursor-pointer items-center justify-center rounded-full ring-2 ring-offset-2 transition",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-brand-500",
                    checked ? "ring-slate-900" : "ring-transparent hover:ring-slate-300",
                  )}
                  style={{ backgroundColor: c.value }}
                >
                  <input
                    type="radio"
                    name={`${formId}-color`}
                    value={c.value}
                    checked={checked}
                    onChange={() => set({ avatarColor: c.value })}
                    className="sr-only"
                    aria-label={c.label}
                  />
                  {checked && <Check className="size-4 text-white" strokeWidth={3} aria-hidden />}
                </label>
              );
            })}
          </div>
        </Field>

        <Field
          label="LINEユーザーID"
          optional
          error={shown.lineUserId}
          hint="本番で、LINEのメンバーとこの登録を結びつけるためのIDです。グループで「#ID」と送ると確認できます。デモでは空欄のままで大丈夫です。"
        >
          <Input
            value={draft.lineUserId ?? ""}
            onChange={(e) => set({ lineUserId: e.target.value })}
            placeholder="U から始まる33文字"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      </form>
    </Modal>
  );
}
