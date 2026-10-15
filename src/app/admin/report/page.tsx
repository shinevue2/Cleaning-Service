import type { Metadata } from "next";
import { ReportScreen } from "@/components/admin/report/ReportScreen";

export const metadata: Metadata = {
  title: "日次レポート",
  description: "店舗ごとの清掃状況と対応待ちの案件をまとめた日次レポートを確認し、管理者グループへの送信を試せます。",
};

export default function AdminReportPage() {
  return <ReportScreen />;
}
