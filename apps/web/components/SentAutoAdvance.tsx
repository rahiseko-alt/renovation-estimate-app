"use client";

// D4 送信しました（デモ）の待ち時間。
//
// **ボタンは置かない**（docs/flows.md「デモの画面の並び」の D4 に「押すと」が無い）。
// ロード中を SENT_LOADING_SECONDS 秒だけ流してから、自分で次の画面へ進む。

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SENT_LOADING_SECONDS, SENT_TEXT } from "../lib/content";

export function SentAutoAdvance({
  /** 待ち終わったあとの行き先。画面はどこへ行くかを自分で決めない。 */
  nextHref,
}: {
  nextHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      // push ではなく replace。push にすると戻るボタンでこの画面に戻れてしまい、
      // 送信済みの依頼をもう一度出せるように見える（履歴に残さない）。
      router.replace(nextHref);
    }, SENT_LOADING_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [router, nextHref]);

  return (
    <div role="status" className="mt-8 flex flex-col gap-2">
      <p className="text-lg font-bold">{SENT_TEXT.loading}</p>
      <p className="text-gray-700">{SENT_TEXT.loadingNote}</p>
    </div>
  );
}
