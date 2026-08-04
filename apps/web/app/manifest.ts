import type { MetadataRoute } from "next";

import { SITE } from "../lib/content";

/**
 * PWA のマニフェスト。ホーム画面に置いたアイコンから単独ウィンドウで起動させる。
 * 名前と説明は lib/content.ts の SITE を参照する（2箇所に書かない）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.title,
    short_name: SITE.title,
    description: SITE.description,
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e40af",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
