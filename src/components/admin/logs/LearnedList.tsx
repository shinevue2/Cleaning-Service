"use client";

import { useState } from "react";
import { GraduationCap, Trash2 } from "lucide-react";
import { Card, CategoryBadge, ConfirmDialog, EmptyState, IconButton, UrgencyBadge, toast } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { useDemoStore } from "@/lib/store";
import type { LearnedExample } from "@/lib/types";

/** The manager corrections the assistant now follows (settings.learned), newest first. */
export function LearnedList() {
  const learned = useDemoStore((s) => s.settings.learned);
  const deleteLearned = useDemoStore((s) => s.deleteLearned);
  const [deleting, setDeleting] = useState<LearnedExample | null>(null);
  const items = [...learned].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Card
      title="判定の手本"
      description="判定ログで修正した内容です。届いたメッセージがこれらと似ていれば、AIはこの手本どおりに判定します。"
      icon={GraduationCap}
      flush
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={GraduationCap}
          title="まだ手本はありません"
          description="判定ログの「判定を修正」で正しい分類を選ぶと、ここに追加されます。"
          className="pb-8"
        />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {items.map((example) => (
            <li key={example.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{example.text}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">この判定にする</span>
                  <CategoryBadge category={example.category} size="sm" />
                  <UrgencyBadge urgency={example.urgency} size="sm" />
                  <span className="ml-1 text-xs tabular-nums text-slate-500">{formatDateTime(example.createdAt)} 登録</span>
                </p>
              </div>
              <IconButton
                label={`手本を削除：${example.text.slice(0, 20)}`}
                icon={Trash2}
                size="sm"
                onClick={() => setDeleting(example)}
                className="text-slate-500 hover:text-red-700"
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title="この手本を削除しますか？"
        description="削除すると、同じような内容は通常のルールとAIで判定されるようになります。判定ログの記録は残ります。"
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          deleteLearned(deleting.id);
          toast("手本を削除しました");
        }}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}
