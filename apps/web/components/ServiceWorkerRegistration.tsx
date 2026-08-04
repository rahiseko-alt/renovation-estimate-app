"use client";

import { useEffect } from "react";

/**
 * サービスワーカーを登録する。画面には何も出さない。
 * 登録に失敗してもアプリは通常どおり動くので、ここで画面を止めない。
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録できないブラウザ・環境（未対応、非 HTTPS）では殻のキャッシュを諦める。
    });
  }, []);

  return null;
}
