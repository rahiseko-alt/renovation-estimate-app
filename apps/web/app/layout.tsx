import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import { SITE, THEME_COLOR } from "../lib/content";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  appleWebApp: {
    capable: true,
    title: SITE.title,
    statusBarStyle: "default",
  },
  /*
   * タブのアイコン。**図案の正は public/icon.svg の1ファイル**で、PNG はそこから
   * 書き出した写し。だから拡大縮小しても劣化しない SVG を先に出し、PNG は
   * SVG を読めないブラウザ向けに並べる。
   *
   * app/icon.svg（App Router のファイル規約）を使わないのは、**同じファイルを
   * トップ画面のロゴも <img src="/icon.svg"> で読む**ため。public に1つ置けば
   * URL が1つで済み、図案の置き場所も1つのままになる。
   */
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 拡大を禁じない。200% まで拡大できることを WCAG 1.4.4 が求めている。
  maximumScale: 5,
  userScalable: true,
  themeColor: THEME_COLOR,
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
