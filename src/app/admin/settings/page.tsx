import type { Metadata } from "next";
import { SettingsScreen } from "@/components/admin/settings/SettingsScreen";

export const metadata: Metadata = {
  title: "設定",
  description: "スタッフ・店舗・通知先・動作設定を管理し、LINEとAIの連携状況やデータの書き出し・読み込みを確認できます。",
};

export default function AdminSettingsPage() {
  return <SettingsScreen />;
}
