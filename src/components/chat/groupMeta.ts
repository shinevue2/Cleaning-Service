import { BellRing, Headset, SprayCan, type LucideIcon } from "lucide-react";
import type { Group, GroupKind } from "@/lib/types";

export interface GroupMeta {
  /** short label for the phone segmented control */
  short: string;
  /** label used in sentences, e.g. 管理者グループで確認できます */
  label: string;
  /** what happens in this group, for the owner */
  description: string;
  /** system notice shown at the top of the chat */
  notice: string;
  icon: LucideIcon;
  /** icon tile classes */
  tile: string;
}

export const GROUP_META: Record<GroupKind, GroupMeta> = {
  cleaning: {
    short: "清掃",
    label: "清掃スタッフ",
    description: "清掃の開始・完了報告やトラブルの連絡",
    notice: "清掃スタッフの報告に、アシスタントが自動で返信します",
    icon: SprayCan,
    tile: "bg-brand-100 text-brand-800",
  },
  callcenter: {
    short: "コールセンター",
    label: "コールセンター",
    description: "お客様からの入電内容の共有",
    notice: "コールセンターからの連絡を読み取り、必要なものだけ管理者へ回します",
    icon: Headset,
    tile: "bg-pink-100 text-pink-700",
  },
  alerts: {
    short: "管理者",
    label: "管理者",
    description: "AIが転送した緊急・要対応の通知",
    notice: "AIが「緊急」「要対応」と判断した内容が、ここに転送されます",
    icon: BellRing,
    tile: "bg-red-100 text-red-700",
  },
};

export function groupMeta(group: Group): GroupMeta {
  return GROUP_META[group.kind] ?? GROUP_META.cleaning;
}
