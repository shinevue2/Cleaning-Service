import {
  BookOpen,
  FileText,
  LayoutDashboard,
  MessageSquareReply,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  /** shorter label for the mobile tab bar */
  shortLabel: string;
  /** one line shown under the label in the desktop sidebar */
  description: string;
  icon: LucideIcon;
}

/** The six admin screens, in menu order (CONTRACT §4.6). */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "ダッシュボード",
    shortLabel: "ダッシュボード",
    description: "今日の状況をひと目で",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/logs",
    label: "判定ログ",
    shortLabel: "判定ログ",
    description: "AIの判断を確認・修正",
    icon: ScrollText,
  },
  {
    href: "/admin/rules",
    label: "返信パターン・判定ルール",
    shortLabel: "返信・判定ルール",
    description: "返信文と緊急の条件",
    icon: MessageSquareReply,
  },
  {
    href: "/admin/faq",
    label: "よくある質問",
    shortLabel: "よくある質問",
    description: "自動で答える質問と回答",
    icon: BookOpen,
  },
  {
    href: "/admin/settings",
    label: "設定",
    shortLabel: "設定",
    description: "スタッフ・店舗・通知先",
    icon: Settings,
  },
  {
    href: "/admin/report",
    label: "日次レポート",
    shortLabel: "日次レポート",
    description: "毎日のまとめを確認・送信",
    icon: FileText,
  },
];

/** `/admin` matches only itself; the other items also match their sub-paths. */
export function isNavActive(href: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}
