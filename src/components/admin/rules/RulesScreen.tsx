"use client";

import { useState } from "react";
import { FlaskConical, KeyRound, MessageSquareReply, MessageSquareText, MessagesSquare } from "lucide-react";
import { ButtonLink, PageHeader, TabPanel, Tabs } from "@/components/ui";
import { useDemoStore, useHydrated } from "@/lib/store";
import { ConfigSkeleton } from "../settings/shared/ConfigSkeleton";
import { useHashTab } from "../settings/shared/useHashTab";
import { KeywordRulesPanel } from "./KeywordRulesPanel";
import { ReplyPatternsPanel } from "./ReplyPatternsPanel";
import { RuleTester, initialTesterState, type TesterState } from "./RuleTester";

const TABS = ["patterns", "keywords", "test"] as const;
type RulesTab = (typeof TABS)[number];

/** /admin/rules — reply texts, keyword rules and a live test bench. */
export function RulesScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <ConfigSkeleton tabs={3} />;
  return <Rules />;
}

function Rules() {
  const [tab, setTab] = useHashTab<RulesTab>(TABS, "patterns");
  const patternCount = useDemoStore((s) => s.settings.replyPatterns.length);
  const ruleCount = useDemoStore((s) => s.settings.keywordRules.length);
  // Kept here so the test input survives switching tabs (edit a reply → test it again).
  const [tester, setTester] = useState<TesterState>(() => initialTesterState(useDemoStore.getState().settings));

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="返信パターン・判定ルール"
        icon={MessageSquareReply}
        description="AIが返す文面と、「緊急」「要対応」と判断する言葉を管理します。保存した内容は、すぐにシミュレーターの返信に反映されます。"
        actions={
          <ButtonLink href="/demo" variant="secondary" icon={MessagesSquare}>
            シミュレーターで確かめる
          </ButtonLink>
        }
      />

      <Tabs<RulesTab>
        idPrefix="rules"
        ariaLabel="返信パターン・判定ルールの切り替え"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "patterns", label: "返信パターン", count: patternCount, icon: MessageSquareText },
          { id: "keywords", label: "判定ルール（キーワード）", count: ruleCount, icon: KeyRound },
          { id: "test", label: "テスト", icon: FlaskConical },
        ]}
      />

      <TabPanel idPrefix="rules" id={tab}>
        {tab === "patterns" && <ReplyPatternsPanel />}
        {tab === "keywords" && <KeywordRulesPanel />}
        {tab === "test" && <RuleTester state={tester} onChange={setTester} />}
      </TabPanel>
    </div>
  );
}
