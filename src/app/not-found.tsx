import type { Metadata } from "next";
import { LayoutDashboard, MessageCircle, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "ページが見つかりません",
};

/** 404 for any unknown URL (rendered inside the root layout, so the header stays available). */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 ring-1 ring-slate-200">
        <SearchX className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">ページが見つかりません</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        URLが間違っているか、ページが移動した可能性があります。下のボタンから、デモの各画面へお進みください。
      </p>
      <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:justify-center">
        <ButtonLink href="/">ホームへ戻る</ButtonLink>
        <ButtonLink href="/demo" variant="secondary" icon={MessageCircle}>
          LINEシミュレーター
        </ButtonLink>
        <ButtonLink href="/admin" variant="secondary" icon={LayoutDashboard}>
          管理画面
        </ButtonLink>
      </div>
    </div>
  );
}
