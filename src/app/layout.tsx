import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_JP } from "next/font/google";
import { AppHeader } from "@/components/shell/AppHeader";
import { ToastViewport } from "@/components/ui";
import { StoreBootstrap } from "@/lib/store";
import "./globals.css";

// Japanese glyphs are served in unicode-range chunks; only the latin subset is preloaded.
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-sans-jp",
  fallback: ["Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "sans-serif"],
});

const PRODUCT_NAME = "ランドリー連絡AIアシスタント";
const DESCRIPTION =
  "コインランドリーの清掃報告やコールセンターからの連絡をAIが仕分け、定型の連絡には自動で返信、緊急のトラブルは管理者へすぐに転送します。ブラウザだけで試せるデモ版です。";

export const metadata: Metadata = {
  title: {
    template: `%s | ${PRODUCT_NAME}`,
    default: `${PRODUCT_NAME}（デモ版）`,
  },
  description: DESCRIPTION,
  applicationName: PRODUCT_NAME,
  // A private demo for one client — keep it out of search engines.
  robots: { index: false, follow: false },
  // Stop iOS from turning masked phone numbers such as 090-****-1234 into links.
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    title: `${PRODUCT_NAME}（デモ版）`,
    description: DESCRIPTION,
    type: "website",
    locale: "ja_JP",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
  // Keep the chat composer visible above the on-screen keyboard on Android.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body className="flex min-h-dvh flex-col bg-slate-50 font-sans text-slate-900 antialiased">
        {/* Rehydrates the persisted demo data and seeds today's history (client only, renders nothing). */}
        <StoreBootstrap />
        <AppHeader />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
          {children}
        </main>
        <ToastViewport />
      </body>
    </html>
  );
}
