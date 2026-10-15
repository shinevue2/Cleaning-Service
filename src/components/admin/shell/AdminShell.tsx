import type { ReactNode } from "react";
import { AdminSidebar, AdminTabBar } from "./AdminNav";

/**
 * Frame of every admin screen: a scrollable tab bar under the app header on phones/tablets,
 * a sticky sidebar on desktop. Server-safe — only the navigation itself is a Client Component.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AdminTabBar />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 pb-16 pt-5 sm:px-6 sm:pt-7 lg:pt-8">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
