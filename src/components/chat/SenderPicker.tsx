"use client";

import { Check } from "lucide-react";
import { Avatar, Modal } from "@/components/ui";
import { cn } from "@/lib/format";
import { ROLE_LABELS, type Group, type Member, type MemberRole, type Settings } from "@/lib/types";
import { senderOptions } from "./chatModel";

const ROLE_ORDER: MemberRole[] = ["staff", "callcenter", "manager"];

const ROLE_HINTS: Record<MemberRole, string> = {
  staff: "清掃の開始・完了報告や、店舗のトラブルを連絡します。",
  callcenter: "お客様からの入電内容を共有します。",
  manager: "管理者の投稿には、自動返信も転送もしません（自由に会話できます）。",
};

export interface SenderPickerProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  group: Group;
  value: string | undefined;
  onChange: (memberId: string) => void;
}

/** Choose who the visitor posts as. The role changes how the assistant reacts. */
export function SenderPicker({ open, onClose, settings, group, value, onChange }: SenderPickerProps) {
  const options = senderOptions(settings, group);
  const byRole = ROLE_ORDER.map((role) => ({ role, members: options.filter((m) => m.role === role) })).filter(
    (g) => g.members.length > 0,
  );

  const choose = (member: Member) => {
    onChange(member.id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="誰として投稿しますか？"
      description={`「${group.name}」に投稿する人を選んでください。役割によって、アシスタントの対応が変わります。`}
      size="sm"
    >
      <div className="space-y-4">
        {byRole.map(({ role, members }) => (
          <section key={role} aria-label={ROLE_LABELS[role]}>
            <h3 className="text-xs font-bold text-slate-500">{ROLE_LABELS[role]}</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{ROLE_HINTS[role]}</p>
            <div className="mt-2 space-y-1.5">
              {members.map((member) => {
                const checked = member.id === value;
                const stores = member.storeIds
                  .map((id) => settings.stores.find((s) => s.id === id)?.name)
                  .filter((n): n is string => Boolean(n));
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => choose(member)}
                    aria-pressed={checked}
                    data-autofocus={checked ? true : undefined}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition-colors",
                      checked ? "bg-brand-50 ring-brand-300" : "ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <Avatar name={member.name} color={member.avatarColor} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-slate-900">{member.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {stores.length > 0
                          ? `担当：${stores.join("・")}`
                          : member.role === "manager"
                            ? "自動返信・転送の対象外"
                            : ROLE_LABELS[member.role]}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full",
                        checked ? "bg-brand-700 text-white" : "ring-2 ring-inset ring-slate-300",
                      )}
                    >
                      {checked && <Check className="size-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {group.kind === "alerts" && (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
            このグループは管理者用です。スタッフやコールセンターの投稿は、それぞれのグループで試せます。
          </p>
        )}
      </div>
    </Modal>
  );
}
