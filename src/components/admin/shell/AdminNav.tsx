"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { cn } from "@/lib/format";
import { useDemoStore, useHydrated } from "@/lib/store";
import { ADMIN_NAV, isNavActive, type AdminNavItem } from "./navItems";

/** Unresolved issues (and whether any is urgent) — shown next to ダッシュボード once the store is ready. */
function useOpenIssueBadge(): { count: number; urgent: boolean } | null {
  const hydrated = useHydrated();
  const count = useDemoStore((s) => s.issues.reduce((n, i) => (i.status !== "resolved" ? n + 1 : n), 0));
  const urgent = useDemoStore((s) => s.issues.some((i) => i.status !== "resolved" && i.urgency === "urgent"));
  return hydrated ? { count, urgent } : null;
}

function CountBadge({ count, urgent, className }: { count: number; urgent: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums",
        urgent ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200",
        className,
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">
        （対応待ち {count}件{urgent ? "、緊急あり" : ""}）
      </span>
    </span>
  );
}

function badgeFor(item: AdminNavItem, badge: ReturnType<typeof useOpenIssueBadge>) {
  return item.href === "/admin" && badge && badge.count > 0 ? badge : null;
}

/* ------------------------------------------------------------------ */
/* Desktop sidebar                                                     */
/* ------------------------------------------------------------------ */

export function AdminSidebar() {
  const pathname = usePathname() ?? "/admin";
  const badge = useOpenIssueBadge();

  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-[calc(var(--app-header-height)+2rem)] space-y-5">
        <nav aria-label="管理メニュー">
          <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-slate-500">管理画面</p>
          <ul className="space-y-1">
            {ADMIN_NAV.map((item) => {
              const active = isNavActive(item.href, pathname);
              const itemBadge = badgeFor(item, badge);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                      active
                        ? "bg-white shadow-sm ring-1 ring-slate-200"
                        : "hover:bg-white/70 hover:ring-1 hover:ring-slate-200/70",
                    )}
                  >
                    {active && (
                      <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-brand-600" />
                    )}
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active
                          ? "bg-brand-700 text-white"
                          : "bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-700",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm font-bold leading-snug",
                          active ? "text-brand-800" : "text-slate-800",
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.description}</span>
                    </span>
                    {itemBadge && <CountBadge count={itemBadge.count} urgent={itemBadge.urgent} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="rounded-2xl border border-brand-200/80 bg-linear-to-br from-brand-50 to-white p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-900">
            <Sparkles className="size-4 text-brand-700" aria-hidden />
            デモ版のご案内
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            AIの判定は、いまはお試し用のサンプルです。本番では、AI（Claude）が文章の意味を読み取って判定します。
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-700" aria-hidden />
            入力した内容は、このブラウザの中だけに保存されます。
          </p>
          <ButtonLink href="/demo" variant="secondary" size="sm" icon={MessagesSquare} block className="mt-3">
            シミュレーターで試す
          </ButtonLink>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile / tablet tab bar                                             */
/* ------------------------------------------------------------------ */

export function AdminTabBar() {
  const pathname = usePathname() ?? "/admin";
  const badge = useOpenIssueBadge();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the current tab visible inside the horizontally scrolling bar.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current) return;
    const target = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  return (
    <nav
      aria-label="管理メニュー"
      className="sticky top-(--app-header-height) z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85 lg:hidden"
    >
      <div className="relative mx-auto max-w-7xl">
        <ul ref={listRef} className="scrollbar-none flex gap-1 overflow-x-auto scroll-px-4 pl-2 pr-10 sm:px-4">
          {ADMIN_NAV.map((item) => {
            const active = isNavActive(item.href, pathname);
            const itemBadge = badgeFor(item, badge);
            const Icon = item.icon;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-12 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-bold transition-colors",
                    active
                      ? "border-brand-600 text-brand-800"
                      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.shortLabel}
                  {itemBadge && <CountBadge count={itemBadge.count} urgent={itemBadge.urgent} />}
                </Link>
              </li>
            );
          })}
        </ul>
        {/* fade hinting that the bar scrolls sideways */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-white to-transparent sm:hidden"
        />
      </div>
    </nav>
  );
}
