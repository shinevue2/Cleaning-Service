import type { Metadata } from "next";
import { FaqScreen } from "@/components/admin/faq/FaqScreen";

export const metadata: Metadata = {
  title: "よくある質問",
  description: "スタッフからよく届く質問と回答を登録して、AIの自動回答に使います。質問を入れて、どの回答が使われるかも試せます。",
};

export default function AdminFaqPage() {
  return <FaqScreen />;
}
