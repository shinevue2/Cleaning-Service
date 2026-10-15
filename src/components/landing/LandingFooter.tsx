import Link from "next/link";
import { WashingMachine } from "lucide-react";

const LINKS = [
  { href: "/demo", label: "LINEシミュレーター" },
  { href: "/admin", label: "管理画面" },
  { href: "/#guide", label: "体験ガイド" },
  { href: "/#faq", label: "よくあるご質問" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-brand-400 to-brand-700 text-white">
              <WashingMachine className="size-4" aria-hidden />
            </span>
            ランドリー連絡AIアシスタント
            <span className="font-medium text-slate-500">（デモ版）</span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            このページはご提案用の試作版です。表示される店舗名・スタッフ名・お客様の情報はすべて架空のものです。デモで入力した内容は、お使いのブラウザの中にのみ保存されます。
          </p>
        </div>
        <nav aria-label="フッターメニュー">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="font-medium text-slate-600 hover:text-brand-800 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
