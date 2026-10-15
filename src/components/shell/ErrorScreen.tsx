"use client";

import { useEffect, useState } from "react";
import { House, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { STORE_KEY } from "@/lib/store";

export interface ErrorScreenProps {
  error: Error & { digest?: string };
  /** re-render the failed part (Next.js `retry`) */
  retry: () => void;
}

/** Removes the saved demo data (the usual cause of a crash after an update) and reloads the page. */
function resetSavedDemo(): void {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // Storage blocked — reloading still starts from the in-memory defaults.
  }
  window.location.reload();
}

/** Friendly Japanese fallback for unexpected errors, with ways back that never need technical steps. */
export function ErrorScreen({ error, retry }: ErrorScreenProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    console.error("[laundry-line-ai] 画面の表示中にエラーが発生しました", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">画面をうまく表示できませんでした</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        一時的な不具合の可能性があります。「もう一度表示する」をお試しください。
        直らない場合は、このブラウザに保存されたデモのデータを初期化すると、最初の状態から使えるようになります。
      </p>
      <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:justify-center">
        <Button onClick={() => retry()} icon={RefreshCw}>
          もう一度表示する
        </Button>
        <ButtonLink href="/" variant="secondary" icon={House}>
          ホームへ戻る
        </ButtonLink>
      </div>
      <div className="mt-8 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
        <p className="text-sm font-semibold text-slate-800">それでも直らないときは</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          デモで送ったメッセージや変更した設定は消え、今日のサンプルのやりとりから始まります。
        </p>
        {confirming ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" size="sm" icon={RotateCcw} onClick={resetSavedDemo}>
              初期化して読み込み直す
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              やめる
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" icon={RotateCcw} className="mt-3" onClick={() => setConfirming(true)}>
            デモのデータを初期化する
          </Button>
        )}
      </div>
      {error.digest ? <p className="mt-4 text-xs text-slate-500">エラー番号：{error.digest}</p> : null}
    </div>
  );
}
