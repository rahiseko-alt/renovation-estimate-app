"use client";

// 確認画面（D3）のボタン。**保存・送信・修正の3つだけ**
// （docs/flows.md「デモの画面の並び」。この表に無いボタンは足さない）。
//
// 保存と修正は行き先が決まっているだけなのでリンク。送信だけがサーバを呼ぶ。

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { sendFromDocumentAction } from "../app/projects/[id]/document/actions";
import { DOCUMENT_CONFIRM_TEXT } from "../lib/content";

export function DocumentConfirmActions({
  projectId,
  /** 「修正」の戻り先。画面はどこへ戻るかを自分で決めない。 */
  editHref,
  /** 「保存」の行き先（下書き保存フォルダ）。 */
  saveHref,
}: {
  projectId: string;
  editHref: string;
  saveHref: string;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  function handleSend(): void {
    if (isSending) return;
    setErrorMessage(null);
    startSending(async () => {
      try {
        await sendFromDocumentAction(projectId);
      } catch (error) {
        // redirect() は例外で制御を移す。フレームワークの内部例外は
        // unstable_rethrow に任せ、それ以外だけを失敗として扱う
        // （components/SendRequestForm.tsx と同じ理由）。
        unstable_rethrow(error);
        setErrorMessage(DOCUMENT_CONFIRM_TEXT.sendFailed);
      }
    });
  }

  return (
    // 並びは docs/flows.md の表のとおり（保存 / 送信 / 修正）。
    <div className="doc-screen-only mt-6 flex flex-col gap-3">
      <Link
        href={saveHref}
        className="tap flex items-center justify-center rounded border-2 border-blue-800 px-6 py-4 font-bold text-blue-800"
      >
        {DOCUMENT_CONFIRM_TEXT.save}
      </Link>

      <button
        type="button"
        disabled={isSending}
        onClick={handleSend}
        className="tap flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:opacity-60"
      >
        {DOCUMENT_CONFIRM_TEXT.send}
      </button>

      <Link
        href={editHref}
        className="tap flex items-center justify-center rounded border-2 border-gray-500 px-6 py-4 font-bold"
      >
        {DOCUMENT_CONFIRM_TEXT.edit}
      </Link>

      {errorMessage ? (
        <p role="alert" className="text-red-800">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
