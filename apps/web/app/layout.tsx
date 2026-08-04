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
