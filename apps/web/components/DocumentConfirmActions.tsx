"use client";

// 確認画面（D4）のボタン。**保存・送信・修正の3つだけ**
// （docs/flows.md「デモの画面の並び」。この表に無いボタンは足さない）。
//
// 保存と修正は行き先が決まっているだけなのでリンク。送信だけがサーバを呼ぶ。
// 見積回答期限は components/DocumentConfirmScreen.tsx が持っていて、ここは
// 押したときにその値を渡すだけ（欄と書類とボタンで持ち主を分けない）。

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

import { sendFromDocumentAction } from "../app/projects/[id]/document/actions";
import { DOCUMENT_CONFIRM_TEXT } from "../lib/content";
import { responseDueAtFromDateInput } from "../lib/legalPeriod";

export function DocumentConfirmActions({
  projectId,
  /** 「修正」の戻り先。画面はどこへ戻るかを自分で決めない。 */
  editHref,
  /** 「保存」の行き先（下書き保存フォルダ）。 */
  saveHref,
  /** 日付欄の値（YYYY-MM-DD・日本時間）。 */
  responseDueDate,
  /** 選べる最も早い日（法定の最短見積期間）。YYYY-MM-DD。 */
  earliestDueDate,
  /** その最短日を人に見せる形にしたもの。 */
  earliestDueText,
}: {
  projectId: string;
  editHref: string;
  saveHref: string;
  responseDueDate: string;
  earliestDueDate: string;
  earliestDueText: string;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();

  /**
   * 送れない期限なら、その理由を返す。送ってよければ null。
   * **サーバ側でも同じ判定を通す**（Server Action は直接叩けるので、ここだけでは
   * 守れない。docs/design.md 7章「サーバ側でも同じ検査をする」）。ここで見るのは、
   * 押してから断られるまでの往復を省くため。
   */
  function rejectReason(): string | null {
    if (!responseDueAtFromDateInput(responseDueDate)) {
      return DOCUMENT_CONFIRM_TEXT.responseDueMissing;
    }
    // どちらも YYYY-MM-DD なので、文字列の大小がそのまま日付の前後になる。
    if (responseDueDate < earliestDueDate) {
      return DOCUMENT_CONFIRM_TEXT.responseDueTooEarly(earliestDueText);
    }
    return null;
  }

  function handleSend(): void {
    if (isSending) return;
    const reason = rejectReason();
    setErrorMessage(reason);
    if (reason) return;
    startSending(async () => {
      try {
        // 送れなかった理由は**返り値**で来る（Next.js は本番ビルドで Server Action の
        // 例外を伏せるため、throw では意図した日本語が画面に出ない）。
        const result = await sendFromDocumentAction(projectId, responseDueDate);
        if (!result.ok) setErrorMessage(result.message);
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
