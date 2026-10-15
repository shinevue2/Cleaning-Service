import { Suspense } from "react";
import type { Metadata } from "next";
import { LogsScreen, LogsSkeleton } from "@/components/admin/logs/LogsScreen";

export const metadata: Metadata = {
  title: "判定ログ",
  description: "届いたメッセージへのAIの判定と、自動返信・転送などの対応を確認し、違っていれば修正できます。",
};

export default function AdminLogsPage() {
  // LogsScreen reads ?record= / ?q= with useSearchParams, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<LogsSkeleton />}>
      <LogsScreen />
    </Suspense>
  );
}
