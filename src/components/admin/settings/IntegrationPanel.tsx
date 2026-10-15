"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  Database,
  MessagesSquare,
  PlugZap,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Callout, Card, CopyButton, Skeleton, type BadgeTone } from "@/components/ui";
import { formatTime } from "@/lib/format";
import type { IntegrationStatus } from "@/lib/line/status";

type Load =
  | { state: "loading" }
  | { state: "ok"; data: IntegrationStatus; at: number }
  | { state: "error" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Runtime check of the /api/status response (never trust a network payload blindly). */
function isStatus(v: unknown): v is IntegrationStatus {
  if (!isRecord(v) || !isRecord(v.line) || !isRecord(v.ai)) return false;
  return (
    typeof v.line.connected === "boolean" &&
    typeof v.line.webhookPath === "string" &&
    isRecord(v.line.groups) &&
    typeof v.ai.label === "string" &&
    typeof v.ai.sample === "boolean"
  );
}

const noopSubscribe = () => () => {};

/** 連携状況 section: what is connected on the server right now. */
export function IntegrationPanel() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((json) => {
        setLoad(isStatus(json) ? { state: "ok", data: json, at: Date.now() } : { state: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <div className="space-y-5">
      <Card
        title="連携状況"
        icon={PlugZap}
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={retry} loading={load.state === "loading"}>
            再確認
          </Button>
        }
      >
        <p className="-mt-1 mb-4 text-[13px] leading-relaxed text-slate-500">
          LINEやAIとつながっているかを確認できます。キーやパスワードなどの秘密の情報は、この画面には表示しません。
        </p>
        {load.state === "loading" && (
          <div className="grid gap-3 md:grid-cols-3" aria-busy="true">
            <span className="sr-only" role="status">
              連携状況を確認しています…
            </span>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="mt-3 h-6 w-20" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        )}

        {load.state === "error" && (
          <Callout
            tone="warning"
            title="連携状況を確認できませんでした"
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={retry}>
                もう一度確認する
              </Button>
            }
          >
            通信が不安定な可能性があります。少し待ってから、もう一度お試しください。デモの操作には影響ありません。
          </Callout>
        )}

        {load.state === "ok" && <StatusTiles data={load.data} />}

        {load.state === "ok" && (
          <p className="mt-3 text-right text-[11px] text-slate-500">{formatTime(load.at)} 時点</p>
        )}
      </Card>

      {load.state === "ok" && (
        <Card title="LINEとの接続情報" icon={MessagesSquare} description="本番でLINE公式アカウントとつなぐときに使います。">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Webhook URL（LINE Developers に設定します）</p>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-800 ring-1 ring-inset ring-slate-200">
                  {origin}
                  {load.data.line.webhookPath}
                </code>
                <CopyButton text={`${origin}${load.data.line.webhookPath}`} size="sm" label="URLをコピー" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">グループの登録</p>
              <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {(
                  [
                    ["cleaning", "清掃スタッフ用グループ"],
                    ["callcenter", "コールセンター用グループ"],
                    ["alerts", "管理者グループ"],
                  ] as const
                ).map(([key, label]) => {
                  const ok = load.data.line.groups[key];
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="text-slate-800">{label}</span>
                      {ok ? (
                        <Badge tone="green" size="sm" icon={CircleCheck}>
                          登録済み
                        </Badge>
                      ) : (
                        <Badge tone="gray" size="sm" icon={CircleDashed}>
                          未登録
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card title="本番に切り替えるには" icon={ArrowRight}>
        <ol className="space-y-3">
          {[
            ["LINE公式アカウントを作る", "無料のプランから始められます。グループへの参加を「許可する」にしておきます。"],
            ["接続用の情報を開発担当に送る", "チャネルシークレットとアクセストークンをサーバーに登録すると、上の「LINE」が「接続済み」に変わります。"],
            ["ボットをグループに招待する", "清掃スタッフ用・コールセンター用・管理者グループに招待します。スタッフの皆さまの操作は今まで通りです。"],
            ["AIのキーを登録する", "ClaudeのAPIキーを登録すると、「AI」が「Claude」に変わり、言い回しが違っても意味で判断できるようになります。"],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-slate-600">
            詳しい手順は、別途お渡しする「本番導入の手順書」にまとめています。この画面で整えた設定は、「データ」タブから書き出して、本番にそのまま引き継げます。
          </p>
          <Link
            href="/#flow"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-800 hover:underline"
          >
            本番導入の流れを見る
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function StatusTiles({ data }: { data: IntegrationStatus }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Tile
        icon={MessagesSquare}
        title="LINE"
        badge={data.line.connected ? { tone: "green", label: "接続済み", icon: CircleCheck } : { tone: "amber", label: "未接続", icon: CircleDashed }}
      >
        {data.line.connected
          ? "実際のLINEグループのメッセージに、自動で返信・転送します。"
          : "いまは画面上のLINEシミュレーターで動いています。LINE公式アカウントの情報を登録すると、実際のグループで動きます。"}
      </Tile>
      <Tile
        icon={Sparkles}
        title="AI"
        badge={data.ai.sample ? { tone: "purple", label: "サンプル", icon: Sparkles } : { tone: "green", label: "Claude", icon: CircleCheck }}
        detail={data.ai.label + (data.ai.model ? `（${data.ai.model}）` : "")}
      >
        {data.ai.sample ? (
          "いまは判定ルールにもとづくサンプルのAIで判定しています（画面には「AI判定（サンプル）」と表示）。APIキーを登録すると、Claudeが文章の意味を読み取って判定します。"
        ) : (
          <>
            Claudeが文章の意味を読み取って判定します。緊急の言葉に当てはまるものは、AIの判断にかかわらず必ず緊急として扱います。
            <span className="mt-1 flex items-start gap-1 text-xs text-slate-500">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              シミュレーターの判定は、デモ用のサンプルのまま動きます。
            </span>
          </>
        )}
      </Tile>
      <Tile icon={Database} title="データの保存先" badge={{ tone: "gray", label: "このブラウザ", icon: Database }}>
        デモで入力した内容は、このブラウザの中だけに保存されます。ほかの人やほかの端末からは見えません。本番では、データベースまたはGoogleスプレッドシートに保存します。
      </Tile>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  badge,
  detail,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge: { tone: BadgeTone; label: string; icon: LucideIcon };
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icon className="size-4 text-slate-500" aria-hidden />
        {title}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Badge tone={badge.tone} icon={badge.icon}>
          {badge.label}
        </Badge>
        {detail && <span className="text-xs text-slate-500">{detail}</span>}
      </div>
      <div className="mt-2.5 text-[13px] leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}
