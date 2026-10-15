"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  House,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  RotateCcw,
  ShieldCheck,
  WashingMachine,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge, ConfirmDialog, IconButton, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore } from "@/lib/store";

export const PRODUCT_NAME = "ランドリー連絡AIアシスタント";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "ホーム",
    description: "できることと体験ガイド",
    icon: House,
    isActive: (p) => p === "/",
  },
  {
    href: "/demo",
    label: "LINEシミュレーター",
    description: "投稿して自動返信を試す",
    icon: MessagesSquare,
    isActive: (p) => p === "/demo" || p.startsWith("/demo/"),
  },
  {
    href: "/admin",
    label: "管理画面",
    description: "判定ログ・返信文・レポート",
    icon: LayoutDashboard,
    isActive: (p) => p === "/admin" || p.startsWith("/admin/"),
  },
];

export interface AppHeaderProps {
  /** Overrides the default reset (the store's resetDemo), e.g. for previews. */
  onReset?: () => void;
}

export function AppHeader({ onReset }: AppHeaderProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const storeReset = useDemoStore((s) => s.resetDemo);
  const resetDemo = onReset ?? storeReset;

  const handleReset = () => {
    resetDemo();
    toast("デモデータを初期状態に戻しました", "success", {
      description: "サンプルの会話と判定ログ、管理画面で変更した返信文や設定も、最初の内容に戻っています。",
    });
  };

  // Close the mobile menu with Escape or a click outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !menuRef.current?.contains(target) && !toggleRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const openResetConfirm = () => {
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  return (
    <header className="sticky top-0 z-40 h-(--app-header-height) border-b border-slate-200/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-800 shadow focus:not-sr-only focus:absolute focus:left-3 focus:top-2"
      >
        本文へスキップ
      </a>

      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-1"
          onClick={() => setMenuOpen(false)}
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-400 to-brand-700 text-white shadow-sm shadow-brand-900/20">
            <WashingMachine className="size-5" aria-hidden />
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-300 ring-2 ring-white"
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-[15px]">
              {PRODUCT_NAME}
            </span>
            <span className="mt-0.5 flex sm:mt-0">
              <Badge tone="amber" size="sm">
                デモ版
              </Badge>
            </span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="メインメニュー" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
                  active
                    ? "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="hidden size-4 lg:block" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span aria-hidden className="hidden h-6 w-px bg-slate-200 md:block" />

        <button
          type="button"
          onClick={openResetConfirm}
          title="デモをリセット"
          className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
        >
          <RotateCcw className="size-4" aria-hidden />
          <span className="sr-only xl:not-sr-only">デモをリセット</span>
        </button>

        {/* Mobile menu toggle */}
        <IconButton
          ref={toggleRef}
          label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
          icon={menuOpen ? X : Menu}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="ml-auto md:hidden"
        />
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div
          ref={menuRef}
          id="mobile-menu"
          className="absolute inset-x-0 top-full animate-slide-down border-b border-slate-200 bg-white shadow-xl shadow-slate-900/10 md:hidden"
        >
          <nav aria-label="メインメニュー" className="px-3 pb-2 pt-2">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = item.isActive(pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                        active ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : "hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-[15px] font-bold",
                            active ? "text-brand-800" : "text-slate-900",
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="block text-xs text-slate-500">{item.description}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-slate-100 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={openResetConfirm}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="size-4 text-slate-500" aria-hidden />
              デモをリセット
            </button>
            <p className="flex items-start gap-2 px-3 pb-1 pt-1 text-xs leading-relaxed text-slate-500">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-700" aria-hidden />
              デモで入力した内容は、このブラウザの中だけに保存されます。
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="デモを最初の状態に戻しますか？"
        description="送信したメッセージ、判定ログ、管理画面で変更した返信文や設定が、すべて初期状態に戻ります。この操作は取り消せません。"
        confirmLabel="リセットする"
        onConfirm={handleReset}
        onClose={() => setConfirmOpen(false)}
      />
    </header>
  );
}
