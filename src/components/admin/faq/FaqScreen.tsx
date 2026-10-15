"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { BookOpen, Plus, Search, ShieldCheck } from "lucide-react";
import {
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Tabs,
  toast,
} from "@/components/ui";
import { useDemoStore, useHydrated } from "@/lib/store";
import { CATEGORY_LABELS, type FaqEntry } from "@/lib/types";
import { suggestFaqPatterns } from "../logs/logUtils";
import { ConfigSkeleton } from "../settings/shared/ConfigSkeleton";
import { FaqCard } from "./FaqCard";
import { FaqModal, emptyFaq } from "./FaqModal";
import { FaqTester } from "./FaqTester";
import { filterFaqs, groupMatches, testFaq, type FaqStatusFilter } from "./faqUtils";

/** /admin/faq — answers the bot may send on its own. */
export function FaqScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <ConfigSkeleton tabs={0} cards={3} />;
  return <Faq />;
}

function Faq() {
  const settings = useDemoStore((s) => s.settings);
  const upsert = useDemoStore((s) => s.upsertFaq);
  const remove = useDemoStore((s) => s.deleteFaq);
  const faqs = settings.faqs;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FaqStatusFilter>("all");
  const [editing, setEditing] = useState<FaqEntry | null>(null);
  const [deleting, setDeleting] = useState<FaqEntry | null>(null);
  const [testText, setTestText] = useState("");
  const deferredTest = useDeferredValue(testText);

  const staff = settings.members.find((m) => m.role === "staff") ?? settings.members[0];
  const outcome = useMemo(
    () =>
      staff ? testFaq(deferredTest, settings, staff, (c) => CATEGORY_LABELS[c]) : ({ kind: "none" } as const),
    [deferredTest, settings, staff],
  );
  const matchedId = outcome.kind === "none" ? null : outcome.match.faq.id;
  const visible = filterFaqs(faqs, query, status);
  const enabledCount = faqs.filter((f) => f.enabled).length;

  const toggle = (faq: FaqEntry, enabled: boolean) => {
    upsert({ ...faq, enabled });
    toast(enabled ? "自動回答に使う設定にしました" : "自動回答を停止しました", enabled ? "success" : "info", {
      description: faq.question,
    });
  };

  const registerFromTest = () => {
    const text = testText.trim();
    const patterns = suggestFaqPatterns(text, settings.stores);
    setEditing(emptyFaq(text, patterns.length > 0 ? patterns : [[]]));
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="よくある質問"
        icon={BookOpen}
        description="スタッフからよく届く質問と回答を登録しておくと、AIがその回答で自動返信します。登録するほど、AIが自分で返せる範囲が広がります。"
        actions={
          <Button icon={Plus} onClick={() => setEditing(emptyFaq())}>
            質問を追加
          </Button>
        }
      />

      <Callout tone="brand" icon={ShieldCheck} title="登録していない質問に、AIが推測で答えることはありません">
        一致するものがない質問は、担当者に確認を回します。判定ログから「この質問をFAQに登録」を使うと、実際に届いた質問をそのまま登録できます。
      </Callout>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <FaqTester
          value={testText}
          onChange={setTestText}
          outcome={outcome}
          settings={settings}
          onRegister={registerFromTest}
          onEnable={(id) => {
            const faq = faqs.find((f) => f.id === id);
            if (faq) toggle(faq, true);
          }}
          className="xl:sticky xl:top-[calc(var(--app-header-height)+1.5rem)] xl:order-2"
        />

        <section aria-label="よくある質問の一覧" className="min-w-0 space-y-4 xl:order-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leading={<Search />}
              placeholder="質問・回答・言葉で探す"
              aria-label="よくある質問を検索"
              className="sm:max-w-xs sm:flex-1"
            />
            <Tabs<FaqStatusFilter>
              variant="pill"
              size="sm"
              ariaLabel="表示する質問"
              value={status}
              onChange={setStatus}
              className="sm:ml-auto"
              tabs={[
                { id: "all", label: "すべて", count: faqs.length },
                { id: "enabled", label: "使用中", count: enabledCount },
                { id: "disabled", label: "停止中", count: faqs.length - enabledCount },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            faqs.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="よくある質問はまだありません"
                description="よく届く質問と回答を登録すると、AIが自動で答えられるようになります。"
                action={
                  <Button icon={Plus} onClick={() => setEditing(emptyFaq())}>
                    質問を追加
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Search}
                title="当てはまる質問がありません"
                description="別の言葉で探すか、絞り込みを解除してください。"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                    }}
                  >
                    絞り込みを解除
                  </Button>
                }
              />
            )
          ) : (
            <ul className="space-y-3">
              {visible.map((faq) => (
                <li key={faq.id}>
                  <FaqCard
                    faq={faq}
                    highlighted={faq.id === matchedId}
                    matchedGroups={faq.id === matchedId ? faq.patterns.map((g) => groupMatches(deferredTest, g)) : undefined}
                    onEdit={() => setEditing(faq)}
                    onDelete={() => setDeleting(faq)}
                    onToggle={(enabled) => toggle(faq, enabled)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && <FaqModal key={editing.id || "new"} faq={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title="このよくある質問を削除しますか？"
        description={
          deleting
            ? `「${deleting.question}」を削除します。元に戻すことはできません。一時的に止めたいときは「自動回答に使う」をオフにしてください。`
            : undefined
        }
        confirmLabel="削除する"
        onConfirm={() => {
          if (!deleting) return;
          remove(deleting.id);
          toast("よくある質問を削除しました", "info", { description: deleting.question });
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
