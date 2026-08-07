"use client";

// 確認画面（D4）の中身。**書類と、見積回答期限の欄と、3つのボタンだけ**
// （docs/flows.md「デモの画面の並び」。この表に無いものは足さない）。
//
// **打ち直した期限は、その場で書類の印字に出す**（送信・保存を待たない）。
// 商談で映しながら日付を変えて見せるのがこの画面の使い道で、押すまで書類が
// 変わらないと「入れた値が効いているのか」がその場で分からない。そのために、
// 期限の状態をここが持ち、書類の描画も日付の欄もボタンもここから下に渡す
// （書類だけをサーバで描くと、状態の持ち主が画面とサーバに割れる）。

import { useState } from "react";

import { DOCUMENT_CONFIRM_TEXT } from "../lib/content";
import { DocumentView } from "../lib/doc/render/html";
import type { DocData } from "../lib/doc/schema";
import { QUOTE_REQUEST_TEMPLATE } from "../lib/doc/templates/quote-request";
import { responseDueAtFromDateInput } from "../lib/legalPeriod";
import { DocumentCanvas } from "./DocumentCanvas";
import { DocumentConfirmActions } from "./DocumentConfirmActions";

/**
 * 見積回答期限の欄が要る値。**どれもサーバ側で1つの「いま」から作る**
 * （画面で日付を作ると、サーバの描画と食い違って hydration がずれる）。
 */
export type ResponseDueField = {
  /** 初期値（当日＋lib/flowText.ts の RESPONSE_DUE_DEFAULT_DAYS）。YYYY-MM-DD。 */
  defaultValue: string;
  /** 選べる最も早い日（法定の最短見積期間）。YYYY-MM-DD。 */
  earliestValue: string;
  /** その最短日を人に見せる形にしたもの（弾いたときの文言に入れる）。 */
  earliestText: string;
};

export function DocumentConfirmScreen({
  data,
  projectId,
  editHref,
  saveHref,
  responseDue,
}: {
  data: DocData;
  projectId: string;
  /** 「修正」の戻り先。画面はどこへ戻るかを自分で決めない。 */
  editHref: string;
  /** 「保存」の行き先（下書き保存フォルダ）。 */
  saveHref: string;
  responseDue: ResponseDueField;
}) {
  const [dueDate, setDueDate] = useState(responseDue.defaultValue);

  // 打ち直した日付を、そのまま書類の「見積回答期限」に流す。
  // 日付として読めない間（欄を空にした直後など）は空欄のまま描く。
  const docData: DocData = {
    ...data,
    responseDueAt: responseDueAtFromDateInput(dueDate),
  };

  return (
    <>
      {/* 書類は読み取り専用の縮小ビュー（components/DocumentCanvas.tsx の冒頭）。 */}
      <div className="mt-4">
        <DocumentCanvas pageWidthPx={QUOTE_REQUEST_TEMPLATE.pageWidthPx}>
          <DocumentView
            template={QUOTE_REQUEST_TEMPLATE}
            data={docData}
            audience="subcontractor"
          />
        </DocumentCanvas>
      </div>

      {/* 紙には出さない（画面の入力欄は doc-screen-only。globals.css の @media print）。 */}
      <label className="doc-screen-only mt-6 block">
        <span className="font-bold">
          {DOCUMENT_CONFIRM_TEXT.responseDueLabel}
        </span>
        <input
          type="date"
          value={dueDate}
          // 法定の最短より前は選べない。日付を選ぶ操作の側でも塞いでおく
          // （打ち込みは塞げないので、押したときとサーバ側でも同じ判定を通す）。
          min={responseDue.earliestValue}
          onChange={(event) => setDueDate(event.target.value)}
          className="tap mt-2 block w-full rounded border-2 border-gray-500 px-4 py-3 text-lg"
        />
      </label>

      <DocumentConfirmActions
        projectId={projectId}
        editHref={editHref}
        saveHref={saveHref}
        responseDueDate={dueDate}
        earliestDueDate={responseDue.earliestValue}
        earliestDueText={responseDue.earliestText}
      />
    </>
  );
}
