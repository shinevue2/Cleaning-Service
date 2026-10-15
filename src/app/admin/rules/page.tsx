import type { Metadata } from "next";
import { RulesScreen } from "@/components/admin/rules/RulesScreen";

export const metadata: Metadata = {
  title: "返信パターン・判定ルール",
  description: "自動返信の文面と、緊急・要対応と判断する言葉を編集し、メッセージを入れてその場で動きを試せます。",
};

export default function AdminRulesPage() {
  return <RulesScreen />;
}
