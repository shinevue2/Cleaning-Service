"use client";

import { BellRing, Database, Gauge, PlugZap, Settings as SettingsIcon, Store as StoreIcon, Users } from "lucide-react";
import { PageHeader, TabPanel, Tabs } from "@/components/ui";
import { useDemoStore, useHydrated } from "@/lib/store";
import { BehaviorPanel } from "./BehaviorPanel";
import { DataPanel } from "./DataPanel";
import { IntegrationPanel } from "./IntegrationPanel";
import { MembersPanel } from "./MembersPanel";
import { StoresPanel } from "./StoresPanel";
import { TargetsPanel } from "./TargetsPanel";
import { ConfigSkeleton } from "./shared/ConfigSkeleton";
import { useHashTab } from "./shared/useHashTab";

/** Tab ids double as URL hashes: /admin/settings#behavior opens 動作設定. */
const TABS = ["staff", "stores", "targets", "behavior", "integration", "data"] as const;
type SettingsTab = (typeof TABS)[number];

/** /admin/settings — staff, stores, notification targets, behaviour, integration status and data. */
export function SettingsScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <ConfigSkeleton tabs={6} />;
  return <SettingsView />;
}

function SettingsView() {
  const [tab, setTab] = useHashTab<SettingsTab>(TABS, "staff");
  const memberCount = useDemoStore((s) => s.settings.members.length);
  const storeCount = useDemoStore((s) => s.settings.stores.length);
  const targetCount = useDemoStore((s) => s.settings.notifyTargets.length);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="管理画面"
        title="設定"
        icon={SettingsIcon}
        description="スタッフ・店舗・通知先と、写真を待つ時間や夜間の時間帯などの動きを設定します。保存した内容は、すぐにシミュレーターに反映されます。"
      />

      <Tabs<SettingsTab>
        idPrefix="settings"
        ariaLabel="設定の項目"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "staff", label: "スタッフ", count: memberCount, icon: Users },
          { id: "stores", label: "店舗", count: storeCount, icon: StoreIcon },
          { id: "targets", label: "通知先", count: targetCount, icon: BellRing },
          { id: "behavior", label: "動作設定", icon: Gauge },
          { id: "integration", label: "連携状況", icon: PlugZap },
          { id: "data", label: "データ", icon: Database },
        ]}
      />

      <TabPanel idPrefix="settings" id={tab}>
        {tab === "staff" && <MembersPanel />}
        {tab === "stores" && <StoresPanel />}
        {tab === "targets" && <TargetsPanel />}
        {tab === "behavior" && <BehaviorPanel />}
        {tab === "integration" && <IntegrationPanel />}
        {tab === "data" && <DataPanel />}
      </TabPanel>
    </div>
  );
}
