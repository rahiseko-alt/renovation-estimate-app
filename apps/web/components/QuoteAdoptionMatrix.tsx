"use client";

// D7 下請け見積もり一覧の表（docs/flows.md「デモの画面の並び」）。
//
// **工事が行・社が列。** 同じ工事の3社の単価が同じ行に並ぶ（利用者の指示 2026-08-08）。
// 社ごとに縦積みしていたときは、同じ工事の3社を見比べるのに画面を上下していた。
//
// **押せるのは採用だけ。単価のマスがそのままボタン**で、もう一度押すと外れる。
// 保留は D8（詳細）が持つ——1マスに採用と保留を入れると 4工事×3社で24個のボタンが
// 並び、現場で押し間違える。マスに出す印は D8 で付けた保留も含めて表示だけする。
//
// 書き込み先は D8 と同じ Server Action（markLineAction）。採用の排他（1明細1社）も
// そちらが持つ（AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
//
// 押されている状態は色だけで伝えず aria-pressed で出す
// （components/ComparisonTable.tsx と同じ作法）。

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";

import { markLineAction } from "../app/projects/[id]/quotes/actions";
import { formatYen } from "../lib/calc";
import { QUOTE_DOCUMENT_TEXT, QUOTE_LIST_TEXT } from "../lib/content";
import type { QuoteDocument } from "../lib/db/quoteDocuments";

export function QuoteAdoptionMatrix({
  projectId,
  quotes,
}: {
  projectId: string;
  quotes: QuoteDocument[];
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 想定内の失敗は**返り値**で受ける（理由は actions.ts の MarkLineResult）。
  // catch に残るのは想定外の失敗だけなので、そこは決まった文言にする。
  function adopt(lineItemId: string, requestId: string, isAdopted: boolean) {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await markLineAction(
          projectId,
          lineItemId,
          requestId,
          "adopted",
          isAdopted,
        );
        if (!result.ok) setErrorMessage(result.message);
      } catch {
        setErrorMessage(QUOTE_DOCUMENT_TEXT.markFailed);
      }
    });
  }

  // 行は全社で同じ並び（lib/db/quoteDocuments.ts が比較表の行から作る）。
  // 1社目を行の骨として使い、他社は明細IDで引く。
  const rows = quotes[0]?.lines ?? [];
  const priceByCompany = quotes.map(
    (quote) => new Map(quote.lines.map((line) => [line.lineItemId, line])),
  );

  // 列は社の数だけ増える（3社固定ではない）。左の工事名だけ少し広く取る。
  const columns = `minmax(0,1.15fr) repeat(${quotes.length}, minmax(0,1fr))`;

  return (
    <div className="mt-6">
      {errorMessage ? (
        <p role="alert" className="mt-3 text-red-900">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-x-2 gap-y-3" style={{ gridTemplateColumns: columns }}>
        {/* 見出しの行：左上が「工事」、その右に社名と D8 への入口。 */}
        <div className="self-end text-sm font-bold text-gray-700">
          {QUOTE_LIST_TEXT.lineColumn}
        </div>
        {quotes.map((quote) => (
          <div key={quote.requestId} className="flex flex-col items-center gap-1">
            <div className="text-center text-sm font-bold">{quote.companyName}</div>
            <Link
              href={`/projects/${projectId}/quotes/${quote.requestId}`}
              // 読み上げでどの社の詳細か分かるようにする（見えている文字は「詳細」）。
              aria-label={`${quote.companyName} ${QUOTE_LIST_TEXT.detail}`}
              className="tap flex w-full items-center justify-center rounded bg-gray-300 px-2 text-sm font-bold text-gray-900"
            >
              {QUOTE_LIST_TEXT.detail}
            </Link>
          </div>
        ))}

        {rows.map((row) => (
          <Fragment key={row.lineItemId}>
            <div className="self-center">
              <div className="text-sm font-bold leading-tight">{row.name}</div>
              <div className="text-xs text-gray-700">
                {`${row.quantity} ${row.unit}`}
              </div>
            </div>

            {quotes.map((quote, columnIndex) => {
              const line = priceByCompany[columnIndex]?.get(row.lineItemId);
              // その社が返していない明細（costUnitPrice が null）は押せない。
              if (!line || line.costUnitPrice === null) {
                return (
                  <div
                    key={quote.requestId}
                    className="flex items-center justify-center rounded border-2 border-dashed border-gray-300 text-gray-700"
                  >
                    {QUOTE_LIST_TEXT.noAnswer}
                  </div>
                );
              }

              const isAdopted = line.mark === "adopted";
              const isOnHold = line.mark === "on_hold";
              return (
                <button
                  key={quote.requestId}
                  type="button"
                  aria-pressed={isAdopted}
                  disabled={isPending}
                  // 見えている文字は単価だけ。読み上げには何をする釦かを渡す。
                  aria-label={`${QUOTE_DOCUMENT_TEXT.adopt} ${quote.companyName} ${row.name} ${formatYen(line.costUnitPrice)}円`}
                  onClick={() => adopt(row.lineItemId, quote.requestId, isAdopted)}
                  className={`tap tabular flex flex-col items-center justify-center rounded px-1 text-center font-bold ${
                    isAdopted ? "bg-blue-800 text-white" : "bg-gray-200 text-gray-900"
                  }`}
                >
                  <span className="text-sm leading-tight">
                    {`${formatYen(line.costUnitPrice)}円`}
                  </span>
                  {/* D8 で付けた保留は、ここでは表示だけする（押して変えられない）。 */}
                  {isOnHold ? (
                    <span className="text-xs font-normal">
                      {QUOTE_DOCUMENT_TEXT.hold}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
