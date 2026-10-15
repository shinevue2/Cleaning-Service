import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  description:
    "清掃スタッフの報告やコールセンターからの連絡をAIが仕分け、定型の連絡には自動で返信、緊急のトラブルは管理者へすぐに転送します。登録不要で、ブラウザからすぐに試せます。",
};

export default function HomePage() {
  return <LandingPage />;
}
