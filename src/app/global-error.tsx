"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort fallback when the root layout itself fails. It replaces the whole document, so it
 * keeps to plain markup (no store, no fonts) and offers a reset of the saved demo data.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[laundry-line-ai] ページ全体の表示に失敗しました", error);
  }, [error]);

  const reset = () => {
    try {
      window.localStorage.removeItem("laundry-line-ai:v1");
    } catch {
      // ignore — reloading still starts from the defaults
    }
    window.location.replace(window.location.origin);
  };

  return (
    <html lang="ja">
      <body className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 font-sans text-slate-900 antialiased">
        <title>エラーが発生しました | ランドリー連絡AIアシスタント</title>
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">ページを表示できませんでした</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            お手数ですが、もう一度お試しください。直らない場合は、このブラウザに保存されたデモのデータを初期化してください（最初の状態に戻ります）。
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => retry()}
              className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              もう一度表示する
            </button>
            <button
              type="button"
              onClick={reset}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              デモのデータを初期化してホームへ
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
