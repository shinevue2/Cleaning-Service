import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoApp } from "@/components/chat/DemoApp";
import { DemoSkeleton } from "@/components/chat/DemoSkeleton";

export const metadata: Metadata = {
  title: "LINEシミュレーター",
  description:
    "清掃スタッフやコールセンターになったつもりでメッセージを送ると、アシスタントの自動返信と、AIがどう判断したかをその場で確認できます。",
};

export default function DemoPage() {
  // DemoApp reads `?scenario=` with useSearchParams, so it renders on the client inside this boundary.
  return (
    <Suspense fallback={<DemoSkeleton />}>
      <DemoApp />
    </Suspense>
  );
}
