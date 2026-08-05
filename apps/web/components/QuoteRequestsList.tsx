"use client";

import { useState, useTransition } from "react";

import { importQuoteResponseAction } from "../app/projects/[id]/estimate/quote-actions";
import { formatYen, sellingUnitPrice } from "../lib/calc";
import { QUOTE_REQUESTS_LIST_TEXT } from "../lib/content";
import type { QuoteRequest } from "../lib/db/types";

type Props = {
  projectId: string;
  initialQuoteRequests: QuoteRequest[];
};

/** 依頼一覧の1件。回答が届いていれば、見積に取り込む売価単価も先に計算して見せる。 */
function QuoteRequestRow({
  projectId,
  quoteRequest,
  onImported,
}: {
  projectId: string;
  quoteRequest: QuoteRequest;
  onImported: () => void;
}) {
  const [isImporting, startImporting] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleImport(): void {
    setErrorMessage(null);
    startImporting(async () => {
      try {
        await importQuoteResponseAction(projectId, quoteRequest.id);
        onImported();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : QUOTE_REQUESTS_LIST_TEXT.importFailed,
        );
      }
    });
  }

  const sellingPrice =
    quoteRequest.costUnitPrice !== null
      ? sellingUnitPrice(quoteRequest.costUnitPrice, quoteRequest.markupRate)
      : null;

  return (
    <li className="flex flex-col gap-2 rounded border-2 border-gray-400 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-bold">{quoteRequest.itemName}</span>
        <span className="text-sm text-gray-700">
          {QUOTE_REQUESTS_LIST_TEXT.statusLabels[quoteRequest.status]}
        </span>
      </div>
      <p className="text-sm text-gray-700">
        {QUOTE_REQUESTS_LIST_TEXT.quantityLabel}: {quoteRequest.quantity}
        {quoteRequest.unit}
      </p>

      {quoteRequest.costUnitPrice !== null && sellingPrice !== null ? (
        <dl className="text-sm">
          <div className="flex justify-between py-1">
            <dt>{QUOTE_REQUESTS_LIST_TEXT.costUnitPriceLabel}</dt>
            <dd className="tabular">{formatYen(quoteRequest.costUnitPrice)}円</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>{QUOTE_REQUESTS_LIST_TEXT.markupRateLabel}</dt>
            <dd className="tabular">{quoteRequest.markupRate}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt>{QUOTE_REQUESTS_LIST_TEXT.sellingUnitPriceLabel}</dt>
            <dd className="tabular font-bold">{formatYen(sellingPrice)}円</dd>
          </div>
        </dl>
      ) : null}

      {quoteRequest.status === "responded" ? (
        <button
          type="button"
          onClick={handleImport}
          disabled={isImporting}
          className="tap rounded bg-blue-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {isImporting
            ? QUOTE_REQUESTS_LIST_TEXT.importing
            : QUOTE_REQUESTS_LIST_TEXT.importButton}
        </button>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage}
        </p>
      ) : null}
    </li>
  );
}

/** 見積エディタ画面に出す、下請への依頼一覧。取り込むと明細が増えるため、成功後にページを再取得する。 */
export function QuoteRequestsList({ projectId, initialQuoteRequests }: Props) {
  function handleImported(): void {
    // 見積側の明細は Server Component（estimate/page.tsx）が持つ。取り込みで増えた
    // 明細をエディタに反映するには、そのページを作り直す必要があるため再読み込みする
    // （このコンポーネント内の状態だけ更新しても、EstimateEditor 側の明細一覧には
    // 反映されない）。
    window.location.reload();
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{QUOTE_REQUESTS_LIST_TEXT.heading}</h2>
      {initialQuoteRequests.length === 0 ? (
        <p className="mt-4 text-gray-700">{QUOTE_REQUESTS_LIST_TEXT.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {initialQuoteRequests.map((quoteRequest) => (
            <QuoteRequestRow
              key={quoteRequest.id}
              projectId={projectId}
              quoteRequest={quoteRequest}
              onImported={handleImported}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
