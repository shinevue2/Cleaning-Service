"use client";

import { useId, useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Store as StoreIcon, Trash2 } from "lucide-react";
import { Avatar, Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, toast } from "@/components/ui";
import { detectStore, normalize } from "@/lib/engine";
import { useDemoStore } from "@/lib/store";
import { newId } from "@/lib/store/ids";
import type { Member, Store } from "@/lib/types";
import { CheckChips } from "./shared/Controls";
import { TagInput } from "./shared/TagInput";
import { canDeleteStore, finalizeStore, hasErrors, validateStore } from "./validation";

/** 店舗 section. */
export function StoresPanel() {
  const stores = useDemoStore((s) => s.settings.stores);
  const members = useDemoStore((s) => s.settings.members);
  const remove = useDemoStore((s) => s.deleteStore);
  const [editing, setEditing] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState<Store | null>(null);

  const askDelete = (store: Store) => {
    const check = canDeleteStore(store.id, stores);
    if (!check.ok) {
      toast("この店舗は削除できません", "warning", { description: check.reason });
      return;
    }
    setDeleting(store);
  };

  return (
    <Card
      title="店舗"
      icon={StoreIcon}
      actions={
        <Button icon={Plus} size="sm" onClick={() => setEditing({ id: "", name: "", aliases: [] })}>
          店舗を追加
        </Button>
      }
      flush
    >
      <p className="px-4 pb-4 text-[13px] leading-relaxed text-slate-500 sm:px-5">
        メッセージに店舗名や呼び方が含まれていると、どの店舗の報告かを自動で見分けます。
      </p>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {stores.map((store) => {
          const staff = members.filter((m) => m.storeIds.includes(store.id));
          return (
            <li key={store.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                <StoreIcon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-bold text-slate-900">{store.name}</p>
                {store.aliases.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                    <span className="mr-0.5 text-slate-500">別の呼び方：</span>
                    {store.aliases.map((a, i) => (
                      <span
                        key={`${a}-${i}`}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"
                      >
                        {a}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">別の呼び方は登録されていません</p>
                )}
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <span className="text-slate-500">担当：</span>
                  {staff.length > 0 ? (
                    staff.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1">
                        <Avatar name={m.name} color={m.avatarColor} size="xs" />
                        {m.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500">未設定</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <IconButton label={`${store.name}を編集`} icon={Pencil} size="sm" onClick={() => setEditing(store)} />
                <IconButton
                  label={`${store.name}を削除`}
                  icon={Trash2}
                  size="sm"
                  onClick={() => askDelete(store)}
                  className="hover:text-red-600"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <StoreModal key={editing.id || "new"} store={editing} members={members} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={deleting ? `${deleting.name}を削除しますか？` : ""}
        description="担当スタッフの設定からも外れます。過去の判定ログはそのまま残ります。元に戻すことはできません。"
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

function StoreModal({ store, members, onClose }: { store: Store; members: Member[]; onClose: () => void }) {
  const stores = useDemoStore((s) => s.settings.stores);
  const upsertStore = useDemoStore((s) => s.upsertStore);
  const upsertMember = useDemoStore((s) => s.upsertMember);
  const [draft, setDraft] = useState<Store>(store);
  const [assigned, setAssigned] = useState<string[]>(() =>
    members.filter((m) => store.id !== "" && m.storeIds.includes(store.id)).map((m) => m.id),
  );
  const [sample, setSample] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const formId = useId();
  const isNew = store.id === "";
  const errors = validateStore(draft, stores);
  const staff = members.filter((m) => m.role !== "manager");

  // Store detection with this draft, so the owner can check a spelling before saving.
  const detected = (() => {
    const norm = normalize(sample);
    if (!norm) return null;
    const probe = { ...finalizeStore(draft), id: draft.id || "__draft__" };
    const list = [...stores.filter((s) => s.id !== draft.id), probe];
    const sender: Member = { id: "probe", name: "probe", role: "staff", storeIds: [], avatarColor: "#000000" };
    return detectStore(norm, list, sender)?.store ?? null;
  })();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors(errors)) return;
    const saved = finalizeStore({ ...draft, id: isNew ? newId("sto") : draft.id });
    upsertStore(saved);
    // Keep the staff assignment in sync with the check boxes.
    for (const m of members) {
      const has = m.storeIds.includes(saved.id);
      const want = assigned.includes(m.id);
      if (has !== want) {
        upsertMember({ ...m, storeIds: want ? [...m.storeIds, saved.id] : m.storeIds.filter((id) => id !== saved.id) });
      }
    }
    toast(isNew ? `${saved.name}を追加しました` : `${saved.name}の設定を保存しました`, "success");
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      persistent
      title={isNew ? "店舗を追加" : "店舗を編集"}
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
        <Field label="店舗名" required error={submitted ? errors.name : undefined}>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            maxLength={30}
            placeholder="例：東口店"
            autoComplete="off"
            data-autofocus
          />
        </Field>

        <Field
          label="別の呼び方"
          optional
          error={errors.aliases}
          hint="「駅前」「えきまえ」など、スタッフがふだん使う呼び方を登録すると、店舗を見分けやすくなります。"
        >
          <TagInput
            value={draft.aliases}
            onChange={(aliases) => setDraft((d) => ({ ...d, aliases }))}
            placeholder="例：東口"
            tone="slate"
          />
        </Field>

        {staff.length > 0 && (
          <Field as="fieldset" label="担当スタッフ" optional>
            <CheckChips
              value={assigned}
              onChange={setAssigned}
              options={staff.map((m) => ({ value: m.id, label: m.name }))}
            />
          </Field>
        )}

        <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
          <Field label="見分けられるか試す" hint="スタッフが送りそうな文を入力すると、どの店舗として扱うかを確認できます。">
            <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="例：東口の乾燥機が止まっています" />
          </Field>
          {sample.trim() !== "" && (
            <p role="status" className="text-[13px] font-medium text-slate-700">
              {detected
                ? `「${detected.id === (draft.id || "__draft__") ? draft.name.trim() || "この店舗" : detected.name}」の報告として扱います。`
                : "店舗を特定できません。呼び方を追加してください。"}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
