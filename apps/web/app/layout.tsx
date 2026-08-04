import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import { SITE } from "../lib/content";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  appleWebApp: {
    capable: true,
    title: SITE.title,
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 拡大を禁じない。200% まで拡大できることを WCAG 1.4.4 が求めている。
  maximumScale: 5,
  userScalable: true,
  themeColor: "#1e40af",
};

/**
 * 全ページをリクエストごとに動的レンダリングする。
 *
 * proxy.ts はリクエストごとに CSP の nonce を作り、x-nonce ヘッダで渡している。
 * Next.js はこの nonce を、実際にリクエストごとにレンダリングされたページの
 * script タグにしか付けない。静的に事前生成されたページ（動的APIを使わない
 * ページは既定でこうなる）には nonce が付かず、CSP の script-src が
 * 自分自身のスクリプトを丸ごとブロックする。
 * ここで固定しておけば、後から追加する画面がこの穴を踏まない。
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900 antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
