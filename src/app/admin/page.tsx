import type { Metadata } from "next";
import { DashboardScreen } from "@/components/admin/dashboard/DashboardScreen";

export const metadata: Metadata = {
  title: "ダッシュボード",
  description: "本日の受信件数・自動対応率・店舗ごとの清掃状況・要対応リスト・最近の転送をまとめて確認できます。",
};

export default function AdminDashboardPage() {
  return <DashboardScreen />;
}
