"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleHelp, MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { GUIDE_STEPS, type GuideStep } from "@/components/landing/scenarios";
import { EmptyState, IconButton, toast, useToastPlacement } from "@/components/ui";
import { cleanAlertTitle, shortName } from "@/lib/engine";
import { getSamplePhoto, type SampleScenario } from "@/lib/samples";
import { bufferKey, useDemoStore, useHydrated } from "@/lib/store";
import { useNow, usePendingForGroup } from "@/lib/store/selectors";
import type { AnalysisRecord, Photo, Settings } from "@/lib/types";
import { AggregationCountdown } from "./AggregationCountdown";
import { AnalysisPanel } from "./AnalysisPanel";
import { ChatWindow, type FocusRequest } from "./ChatWindow";
import {
  defaultRecordId,
  EMPTY_DRAFT,
  groupMemberCount,
  isDraftEmpty,
  planScenario,
  resolveSenderId,
  senderOptions,
  type Draft,
} from "./chatModel";
import { Composer } from "./Composer";
import { DemoSkeleton } from "./DemoSkeleton";
import { GroupList, GroupTabs } from "./GroupList";
import { GuideNextCard } from "./GuideNextCard";
import { HowToCard, useHowTo } from "./HowToCard";
import { AnalysisFab, MobileAnalysisSheet } from "./MobileAnalysisSheet";
import { PhotoLightbox } from "./PhotoGrid";
import { PhotoPicker } from "./PhotoPicker";
import { ScenarioBanner } from "./ScenarioBanner";
import { ScenarioChips } from "./ScenarioChips";
import { SenderPicker } from "./SenderPicker";
import { StoreStatusMini } from "./StoreStatusMini";

const CHAT_PANEL_ID = "demo-chat";
/** Same breakpoint as Tailwind's `lg` — the AI panel is a column from here on. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * The /demo simulator. Reads `?scenario=<id>` (deep links from the landing page) and `?group=<id>`
 * (links from the admin screens, e.g. to the managers' alerts group) and renders a skeleton until the
 * demo data has been restored from this browser. Must be rendered inside <Suspense>.
 */
export function DemoApp() {
  const params = useSearchParams();
  const scenarioParam = params.get("scenario");
  const groupParam = params.get("group");
  const hydrated = useHydrated();
  const now = useNow(60_000);
  if (!hydrated || now === null) return <DemoSkeleton />;
  return <DemoWorkspace scenarioParam={scenarioParam} groupParam={groupParam} now={now} />;
}

interface Pin {
  groupId: string;
  recordId: string;
  /** the group's latest record when pinned — a newer judgement releases the pin */
  latestId: string | undefined;
}

function latestCreatedAt(records: readonly AnalysisRecord[]): number {
  return records.reduce((max, r) => Math.max(max, r.createdAt), 0);
}

/** Index of a scenario in the landing page's 体験ガイド, or -1. */
function guideIndex(scenarioId: string): number {
  return GUIDE_STEPS.findIndex((step) => step.scenario === scenarioId);
}

function comboDelayMs(settings: Settings): number {
  return Math.min(2500, Math.max(600, settings.behavior.aggregateSeconds * 500));
}

function DemoWorkspace({
  scenarioParam,
  groupParam,
  now,
}: {
  scenarioParam: string | null;
  groupParam: string | null;
  now: number;
}) {
  const settings = useDemoStore((s) => s.settings);
  const allMessages = useDemoStore((s) => s.messages);
  const records = useDemoStore((s) => s.records);
  const unread = useDemoStore((s) => s.unread);
  const typingMap = useDemoStore((s) => s.typing);
  const sendMessage = useDemoStore((s) => s.sendMessage);
  const flushPending = useDemoStore((s) => s.flushPending);
  const markRead = useDemoStore((s) => s.markRead);
  const postDailyReport = useDemoStore((s) => s.postDailyReport);
  const howTo = useHowTo();
  useToastPlacement("demo");

  const groups = settings.groups;
  const [groupId, setGroupId] = useState<string>(() => groups[0]?.id ?? "");
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeScenario, setActiveScenario] = useState<{ groupId: string; scenario: SampleScenario } | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [senderPickerOpen, setSenderPickerOpen] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [comboRunning, setComboRunning] = useState(false);
  /** the 体験ガイド step that was just sent from its banner (shows the "next step" card) */
  const [guideDone, setGuideDone] = useState<{ groupId: string; index: number } | null>(null);
  // Judgements newer than this were not looked at yet (the 「AI判定」 button gets a dot).
  const [seenUntil, setSeenUntil] = useState(() => latestCreatedAt(records));

  /* ---------------- deep link: /demo?scenario=<id> ---------------- */

  const [handledParam, setHandledParam] = useState<string | null>(null);
  if (scenarioParam !== handledParam) {
    // Adjust state while rendering (React's recommended pattern for "state derived from a changed prop").
    setHandledParam(scenarioParam);
    const plan = planScenario(scenarioParam, settings);
    if (plan) {
      setGroupId(plan.groupId);
      setSenders((s) => ({ ...s, [plan.groupId]: plan.senderId }));
      setDrafts((d) => ({ ...d, [plan.groupId]: plan.draft }));
      setActiveScenario({ groupId: plan.groupId, scenario: plan.scenario });
      setGuideDone(null);
      setPin(null);
    }
  }

  /* ---------------- deep link: /demo?group=<id> (a scenario link wins) ---------------- */

  const [handledGroupParam, setHandledGroupParam] = useState<string | null>(null);
  if (groupParam !== handledGroupParam) {
    setHandledGroupParam(groupParam);
    const target = groupParam ? groups.find((g) => g.id === groupParam) : undefined;
    if (target && planScenario(scenarioParam, settings) === null) {
      setGroupId(target.id);
      setPin(null);
    }
  }

  useEffect(() => {
    if (groupParam === null) return;
    // One-shot like ?scenario=, so the same link opens the group again after switching away.
    const url = new URL(window.location.href);
    url.searchParams.delete("group");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [groupParam]);

  const scenarioValid = scenarioParam === null || planScenario(scenarioParam, settings) !== null;
  useEffect(() => {
    if (scenarioParam === null) return;
    if (!scenarioValid) {
      toast("指定された体験シナリオが見つかりませんでした", "info", {
        description: "入力欄の上にあるサンプルのボタンから、同じように試せます。",
      });
    }
    // One-shot: drop the parameter so a reload or "back" doesn't prefill the same post again.
    const url = new URL(window.location.href);
    url.searchParams.delete("scenario");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [scenarioParam, scenarioValid]);

  /* ---------------- current group & sender ---------------- */

  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const selfId = group ? resolveSenderId(settings, group, senders[group.id]) : undefined;
  const self = settings.members.find((m) => m.id === selfId);
  const draft = (group && drafts[group.id]) || EMPTY_DRAFT;
  const pending = usePendingForGroup(group?.id ?? "");
  const typing = group ? Boolean(typingMap[group.id]) : false;
  const scenarioHere = activeScenario && group && activeScenario.groupId === group.id ? activeScenario.scenario : null;

  const lastMessages = useMemo(() => {
    const out: Record<string, (typeof allMessages)[number]> = {};
    for (const m of allMessages) out[m.groupId] = m;
    return out;
  }, [allMessages]);

  const memberCounts = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, groupMemberCount(settings, g)])),
    [groups, settings],
  );

  /* ---------------- AI panel selection ---------------- */

  const latestId = useMemo(
    () => (group ? defaultRecordId(group, records, allMessages) : undefined),
    [group, records, allMessages],
  );
  const pinnedId =
    pin && group && pin.groupId === group.id && pin.latestId === latestId && records.some((r) => r.id === pin.recordId)
      ? pin.recordId
      : undefined;
  const panelRecordId = pinnedId ?? latestId;
  const panelRecord = panelRecordId ? records.find((r) => r.id === panelRecordId) : undefined;
  const following = pinnedId === undefined || pinnedId === latestId;
  const latestRecord = latestId ? records.find((r) => r.id === latestId) : undefined;
  const fresh = !sheetOpen && latestRecord !== undefined && latestRecord.createdAt > seenUntil;

  /* ---------------- effects ---------------- */

  // Opening a group reads its notifications.
  const unreadHere = group ? (unread[group.id] ?? 0) : 0;
  useEffect(() => {
    if (group && unreadHere > 0) markRead(group.id);
  }, [group, unreadHere, markRead]);

  // A forwarded alert while another group is open → short notice (the group badge lights up too).
  const alertsGroup = groups.find((g) => g.kind === "alerts");
  const alertsUnread = alertsGroup ? (unread[alertsGroup.id] ?? 0) : 0;
  const previousAlerts = useRef(alertsUnread);
  useEffect(() => {
    const before = previousAlerts.current;
    previousAlerts.current = alertsUnread;
    if (!alertsGroup || alertsUnread <= before || group?.id === alertsGroup.id) return;
    const messages = useDemoStore.getState().messages;
    let last: (typeof messages)[number] | undefined;
    for (let i = messages.length - 1; i >= 0 && !last; i -= 1) if (messages[i].groupId === alertsGroup.id) last = messages[i];
    if (!last?.alert) return;
    // The AI判定 sheet already shows the forward; a toast would cover its header on phones.
    if (sheetOpen) return;
    const urgent = last.alert.urgency === "urgent";
    const alertsId = alertsGroup.id;
    toast(urgent ? "緊急の通知を管理者グループへ転送しました" : "要対応として管理者グループへ転送しました", urgent ? "error" : "warning", {
      description: cleanAlertTitle(last.alert.title),
      action: { label: "管理者グループで確認する", onClick: () => setGroupId(alertsId) },
    });
  }, [alertsUnread, alertsGroup, group?.id, sheetOpen]);

  // Activity keeps this page alive when navigating away: close transient dialogs (they are portals).
  // A running 「写真とコメントを別々に送る」 sample is left to finish — its comment still reaches the store.
  useLayoutEffect(
    () => () => {
      setSenderPickerOpen(false);
      setPhotoPickerOpen(false);
      setSheetOpen(false);
      setLightbox(null);
    },
    [],
  );

  /* ---------------- actions ---------------- */

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <EmptyState
          icon={MessagesSquare}
          title="グループがありません"
          description="ヘッダーの「デモをリセット」で、最初の状態に戻せます。"
        />
      </div>
    );
  }

  const selectGroup = (id: string) => {
    setGroupId(id);
  };

  const setDraft = (next: Draft) => setDrafts((d) => ({ ...d, [group.id]: next }));

  const clearScenario = () => {
    if (activeScenario?.groupId === group.id) setActiveScenario(null);
  };

  /** The 使い方 card has done its job once something is sent (it can be reopened from 「使い方」). */
  const closeHowTo = () => {
    if (howTo.open) howTo.dismiss();
  };

  const sendDraft = () => {
    if (!selfId || isDraftEmpty(draft)) return;
    closeHowTo();
    const instant = scenarioHere !== null;
    sendMessage(group.id, selfId, draft.text, draft.photos);
    // A prefilled sample answers right away; a hand-typed text waits for a possible photo.
    if (instant) flushPending(bufferKey(group.id, selfId));
    setDrafts((d) => ({ ...d, [group.id]: EMPTY_DRAFT }));
    // A 体験ガイド step sent from its banner → point to the next step once the bot has answered.
    const step = scenarioHere ? guideIndex(scenarioHere.id) : -1;
    setGuideDone(step >= 0 ? { groupId: group.id, index: step } : null);
    clearScenario();
  };

  /** Prefills a sample like the landing page's links do (banner + highlighted send button). */
  const prefillScenario = (scenarioId: string) => {
    const plan = planScenario(scenarioId, settings);
    if (!plan) return;
    setGroupId(plan.groupId);
    setSenders((s) => ({ ...s, [plan.groupId]: plan.senderId }));
    setDrafts((d) => ({ ...d, [plan.groupId]: plan.draft }));
    setActiveScenario({ groupId: plan.groupId, scenario: plan.scenario });
    setGuideDone(null);
    setPin(null);
  };

  const sendScenario = (scenario: SampleScenario) => {
    const plan = planScenario(scenario.id, settings);
    if (!plan) return;
    closeHowTo();
    setGuideDone(null);
    setSenders((s) => ({ ...s, [plan.groupId]: plan.senderId }));
    sendMessage(plan.groupId, plan.senderId, plan.draft.text, plan.draft.photos);
    flushPending(bufferKey(plan.groupId, plan.senderId));
    if (activeScenario?.groupId === plan.groupId && activeScenario.scenario.id === scenario.id) {
      setActiveScenario(null);
      setDrafts((d) => ({ ...d, [plan.groupId]: EMPTY_DRAFT }));
    }
  };

  const sendCombo = () => {
    if (comboRunning) return;
    const staff = self?.role === "staff" ? self : senderOptions(settings, group).find((m) => m.role === "staff");
    const photo = getSamplePhoto("ph_floor_clean");
    if (!staff || !photo) {
      toast("清掃スタッフが登録されていません", "info", { description: "管理画面の「設定」でスタッフを追加してください。" });
      return;
    }
    closeHowTo();
    const store = settings.stores.find((s) => staff.storeIds.includes(s.id));
    const text = `${store ? `${store.name}の` : ""}清掃完了しました！`;
    const targetGroup = group.id;
    setSenders((s) => ({ ...s, [targetGroup]: staff.id }));
    sendMessage(targetGroup, staff.id, "", [{ id: photo.id, src: photo.src, alt: photo.alt }]);
    // sendMessage appends synchronously, so the photo post is the newest message.
    const photoMessageId = useDemoStore.getState().messages.at(-1)?.id;
    setComboRunning(true);
    setTimeout(() => {
      const state = useDemoStore.getState();
      // 「デモをリセット」 in the meantime removed the photo post — don't add a stray comment to fresh data.
      if (state.messages.some((m) => m.id === photoMessageId)) state.sendMessage(targetGroup, staff.id, text);
      setComboRunning(false);
    }, comboDelayMs(settings));
  };

  const markSeen = () => setSeenUntil((t) => Math.max(t, latestCreatedAt(useDemoStore.getState().records)));

  const openSheet = () => {
    markSeen();
    setSheetOpen(true);
  };

  const closeSheet = () => {
    markSeen();
    setSheetOpen(false);
  };

  const selectRecord = (record: AnalysisRecord) => {
    setPin({ groupId: group.id, recordId: record.id, latestId });
    if (!isDesktop()) openSheet();
  };

  const jumpToSource = (sourceGroupId: string, messageId: string, record: AnalysisRecord | undefined) => {
    const sourceGroup = groups.find((g) => g.id === sourceGroupId);
    if (!sourceGroup) return;
    setGroupId(sourceGroup.id);
    if (record) {
      setPin({ groupId: sourceGroup.id, recordId: record.id, latestId: defaultRecordId(sourceGroup, records, allMessages) });
    }
    setFocusRequest((prev) => ({ messageId, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const panelProps = {
    group,
    record: panelRecord,
    following,
    onShowLatest: () => setPin(null),
    typing,
    pending,
  };

  /* ---------------- layout ---------------- */

  return (
    <div className="flex h-[calc(100dvh-var(--app-header-height))] w-full flex-col lg:mx-auto lg:max-w-[90rem] lg:flex-row lg:gap-3 lg:p-4 xl:gap-4">
      <h1 className="sr-only">LINEシミュレーター</h1>

      {/* phones / tablets: groups as a segmented control */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2.5 py-2 lg:hidden">
        <GroupTabs
          groups={groups}
          selectedId={group.id}
          onSelect={selectGroup}
          unread={unread}
          panelId={CHAT_PANEL_ID}
          className="min-w-0 flex-1"
        />
        <IconButton label="使い方を表示" icon={CircleHelp} size="sm" onClick={howTo.show} className="text-slate-500" />
      </div>

      {/* desktop: group list + store board */}
      <aside aria-label="グループと店舗の状況" className="relative hidden w-60 shrink-0 flex-col gap-3 overflow-y-auto lg:flex xl:w-[19rem]">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
          <div className="px-2 pb-2 pt-1.5">
            <h2 className="text-[13px] font-bold text-slate-900">グループ</h2>
            <p className="text-[11.5px] text-slate-500">本番では、実際のLINEグループにアシスタントが参加します</p>
          </div>
          <GroupList
            groups={groups}
            selectedId={group.id}
            onSelect={selectGroup}
            lastMessages={lastMessages}
            unread={unread}
            typing={typingMap}
            memberCounts={memberCounts}
            now={now}
          />
        </section>
        <StoreStatusMini now={now} />
        <section className="space-y-2 rounded-2xl bg-violet-50/80 p-3.5 text-[12px] leading-relaxed text-violet-950 ring-1 ring-inset ring-violet-100">
          <p className="flex items-center gap-1.5 font-bold">
            <Sparkles className="size-3.5 text-violet-600" aria-hidden />
            AIの判定はサンプルです
          </p>
          <p className="text-violet-900/80">
            本番のAIにつなぐ前のため、サンプルのAIが判定しています。本番では、Claudeが文章の意味を読み取って判定します。
          </p>
          <p className="flex items-start gap-1.5 text-violet-900/80">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-violet-600" aria-hidden />
            入力した内容は、このブラウザの中だけに保存されます。
          </p>
        </section>
      </aside>

      {/* chat */}
      <ChatWindow
        className="flex-1 lg:rounded-2xl lg:shadow-[0_1px_2px_rgb(15_23_42/0.06),0_8px_24px_-12px_rgb(15_23_42/0.25)]"
        group={group}
        settings={settings}
        selfId={selfId}
        now={now}
        selectedRecordId={panelRecordId}
        onSelectRecord={selectRecord}
        onOpenPhoto={setLightbox}
        onJumpToSource={jumpToSource}
        onShowHowTo={howTo.show}
        focusRequest={focusRequest}
        panelId={CHAT_PANEL_ID}
        // The scenario banner already explains what to do; two instruction cards at once hide the chat.
        topOverlay={howTo.open && !scenarioHere ? <HowToCard onDismiss={howTo.dismiss} /> : undefined}
        bottomOverlay={
          <AnalysisFab onClick={openSheet} fresh={fresh} busy={typing || pending.length > 0} className="lg:hidden" />
        }
        footer={pending.length > 0 ? <AggregationCountdown entries={pending} selfId={selfId} /> : undefined}
        composer={
          <Composer
            group={group}
            sender={self}
            draft={draft}
            onDraftChange={setDraft}
            onSend={sendDraft}
            onOpenSenderPicker={() => setSenderPickerOpen(true)}
            onOpenPhotoPicker={() => setPhotoPickerOpen(true)}
            highlightSend={scenarioHere !== null}
            banner={
              scenarioHere ? (
                <ScenarioBanner
                  scenario={scenarioHere}
                  senderName={self ? shortName(self.name) : undefined}
                  guide={guideIndex(scenarioHere.id) >= 0 ? { index: guideIndex(scenarioHere.id), total: GUIDE_STEPS.length } : undefined}
                  onSend={sendDraft}
                  onDismiss={() => {
                    clearScenario();
                    setDraft(EMPTY_DRAFT);
                  }}
                />
              ) : guideDone && guideDone.groupId === group.id && !typing && pending.length === 0 ? (
                <GuideNextCard
                  steps={GUIDE_STEPS}
                  done={guideDone.index}
                  onTryNext={(step: GuideStep) => prefillScenario(step.scenario)}
                  onDismiss={() => setGuideDone(null)}
                />
              ) : undefined
            }
            chips={
              <ScenarioChips
                group={group}
                onSendScenario={sendScenario}
                onSendCombo={sendCombo}
                comboRunning={comboRunning}
                onPostReport={postDailyReport}
              />
            }
          />
        }
      />

      {/* desktop: AI panel */}
      <aside
        aria-label="AI判定パネル"
        className="relative hidden w-[20rem] shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04),0_4px_16px_-8px_rgb(15_23_42/0.08)] lg:flex xl:w-[25rem]"
      >
        <AnalysisPanel {...panelProps} className="w-full" />
      </aside>

      {/* dialogs */}
      <MobileAnalysisSheet open={sheetOpen} onClose={closeSheet} {...panelProps} />
      <SenderPicker
        open={senderPickerOpen}
        onClose={() => setSenderPickerOpen(false)}
        settings={settings}
        group={group}
        value={selfId}
        onChange={(id) => setSenders((s) => ({ ...s, [group.id]: id }))}
      />
      <PhotoPicker
        open={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        value={draft.photos}
        onChange={(photos) => setDraft({ ...draft, photos })}
      />
      <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
