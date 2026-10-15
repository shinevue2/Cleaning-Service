# ランドリー連絡AIアシスタント（デモ版）

コインランドリーの清掃スタッフとコールセンターが LINE グループに送る連絡を、AI が仕分けて対応するシステムです。

- 定型の連絡には自動で返信します（清掃開始 →「よろしくお願いします」、写真つきの完了報告 →「お疲れ様でした」、コールセンターの連絡 →「承知しました」）。
- 洗濯物の放置・機械のエラー・緊急トラブルは、管理者グループへすぐに転送します。夜間は電話の呼び出しも行います。
- 返信文・判定ルール・よくある質問・スタッフ・店舗・通知先は、管理画面で編集できます。判定の修正は「判定の手本」として次回から使われます。

API キーがなくても、ブラウザだけで一通り試せます。

- チャットは **LINE 風のシミュレーター** で、本物の LINE にはつながっていません。
- AI の判定は **ルールにもとづくサンプル** で、画面には「AI判定（サンプル）」と表示されます。

本番用の **LINE Messaging API の Webhook** と **Claude による判定** も組み込み済みです。環境変数を設定すると本番の動作に切り替わります。

## 画面

| URL | 内容 |
|---|---|
| `/` | 紹介ページ。3分で試せる手順から、シミュレーターのシナリオへ直接移動できます |
| `/demo` | LINE シミュレーター（グループ一覧・チャット・AI判定パネル）。`?scenario=<id>` でサンプル投稿を入力済みにし、`?group=<id>` でグループを開きます |
| `/admin` | ダッシュボード（本日の件数・要対応リスト・店舗ごとの清掃状況・時間帯別グラフ・最近の転送） |
| `/admin/logs` | 判定ログ（絞り込み、判定の修正、質問をよくある質問に登録、判定の手本）。`?record=<id>` で該当の記録を開きます |
| `/admin/rules` | 返信パターン・判定ルール（キーワード）・テスト |
| `/admin/faq` | よくある質問 |
| `/admin/settings` | スタッフ・店舗・通知先・動作設定・連携状況・データ（書き出し／読み込み／リセット） |
| `/admin/report` | 日次レポート（プレビュー・管理者グループへの送信） |
| `POST /api/line/webhook` | LINE からの Webhook（LINE の環境変数が未設定なら `503`、署名が不正なら `401`） |
| `GET /api/status` | 連携状況（LINE 接続の有無、AI がサンプルか Claude か） |
| `POST /api/analyze` | 判定 API（`{ text, photoCount, senderId, groupId }`）。サーバー側の判定を確認するためのものです |

デモのデータ（会話・判定ログ・設定の変更）は、**閲覧しているブラウザの localStorage にだけ** 保存されます。画面右上の「デモをリセット」で初期状態に戻ります。

## 開発

Node.js 20.9 以上が必要です（24 で動作を確認しています）。

```bash
npm install
npm run dev        # http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド（型チェックを含みます） |
| `npm start` | 本番ビルドの起動 |
| `npm run lint` | ESLint |
| `npm test` | Vitest（判定エンジン・ストア・LINE/AI 層・画面ロジックの単体テスト） |
| `npx tsc --noEmit -p .` | 型チェックのみ |

技術構成：Next.js 16.4（App Router、`cacheComponents` 有効）、React 19.3、TypeScript（strict）、Tailwind CSS v4、zustand（localStorage に保存）、zod、`@anthropic-ai/sdk`、Vitest。

> この Next.js は以前の版と挙動が異なる部分があります。API を使う前に `node_modules/next/dist/docs/` を確認してください（`AGENTS.md` 参照）。

## ディレクトリ構成

```
src/
  app/                    ルーティング（ページは薄いサーバーコンポーネント）
    api/line/webhook/     LINE Webhook（署名検証 → after() で非同期に処理）
    api/status/           連携状況
    api/analyze/          判定 API
  lib/
    types.ts              ドメインの型と表示ラベル
    seed.ts               初期設定（店舗・スタッフ・グループ・判定ルール・返信パターン・よくある質問・通知先）
    engine/               判定エンジン（純粋な TS。ブラウザとサーバーの両方で動作）
                          normalize → extract → analyze（分類・緊急度・確信度・理由）→ plan（返信・転送・要対応・清掃状況）
    ai/                   AI 層。mock.ts（デモ用サンプル）と claude.ts（本番、サーバー専用）、安全側に倒す merge.ts
    line/                 LINE 層（署名検証・API クライアント・Flex 通知カード・webhook 処理・環境変数からの設定読み込み）
    store/                クライアントの状態（zustand + persist）。写真とコメントのまとめ判定・当日の履歴データ・セレクター
    samples.ts            サンプル写真（SVG）と体験シナリオ
    format.ts             日本時間での日時表示
  components/
    ui/                   共通 UI キット
    shell/                ヘッダー
    landing/              紹介ページ
    chat/                 LINE シミュレーター
    admin/                管理画面
docs/
  PRODUCTION.md           本番導入の手順書（オーナー様・開発担当向け）
  CONTRACT.md             開発時の仕様書
```

判定の流れは、デモと本番で同じエンジンを使います。

- **デモ**：シミュレーター → `store`（同じ人の写真とコメントを数秒まとめる）→ `engine.run()` → 返信・転送・要対応リストを画面に反映
- **本番**：LINE → `/api/line/webhook` → `engine.analyze()` → Claude で補正（緊急の判定は下げない、迷ったら人に回す）→ `engine.plan()` → LINE へ返信・管理者グループへ通知

## 環境変数

何も設定しなければデモ版として動きます。見本は [`.env.example`](./.env.example)、手順と費用の目安は [`docs/PRODUCTION.md`](./docs/PRODUCTION.md) にあります。

| 環境変数 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | 2つそろうと LINE の Webhook が有効になります |
| `LINE_GROUP_CLEANING` / `LINE_GROUP_CALLCENTER` / `LINE_GROUP_ALERTS` | 各 LINE グループの ID（通知先は `LINE_GROUP_ALERTS`） |
| `LINE_ALERT_LINK_URL` | 通知カードのボタンのリンク先（任意） |
| `ANTHROPIC_API_KEY` | 設定すると判定にサンプルではなく Claude を使います |
| `ANTHROPIC_MODEL` | 使うモデル（既定は `claude-opus-5-5`） |
| `ANALYZE_API_TOKEN` | Claude が有効なとき、`/api/analyze` に必要な Bearer トークン |
| `APP_SETTINGS_JSON` | 管理画面［設定］→［データ］で書き出した設定（返信文・ルール・スタッフ等） |

## Vercel へのデプロイ

1. このディレクトリを Vercel のプロジェクトとして取り込みます（Git 連携、または `npx vercel` → `npx vercel --prod`）。フレームワークは Next.js が自動で選ばれ、ビルドは `npm run build` です。
2. デモ版は環境変数なしで動きます。
3. 本番に切り替えるときは、Vercel の［Settings］→［Environment Variables］に上の値を登録して **再デプロイ** し、LINE Developers の Webhook URL に `https://<ドメイン>/api/line/webhook` を設定します（詳しくは `docs/PRODUCTION.md` の手順3〜8）。

Vercel の無料プラン（Hobby）は個人の非商用利用に限られます。事業で本番運用する場合は Pro プランを使ってください。

## 現時点の制限

- 管理画面にログインはありません（デモ用）。本番ではベーシック認証かログインを追加します。
- デモのデータはブラウザごとに別々です。本番の LINE のやりとりはサーバーのログにだけ残り、管理画面や日次レポートには表示されません（データベースかスプレッドシートの追加が必要です）。
- 本番の「写真とコメントのまとめ判定」と「お疲れ様でしたの二重返信防止」は、サーバーのメモリ上で行うため、サーバーレス環境ではできる範囲での対応になります。
- メール・電話・Chatwork への通知は、本番ではまだ送信しません（ログに記録するだけです）。LINE グループへの通知は送信します。

詳しくは `docs/PRODUCTION.md` の「11. 現時点の制限と今後の対応」をご覧ください。
