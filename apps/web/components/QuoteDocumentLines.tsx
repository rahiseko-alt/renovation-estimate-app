"use client";

// D6 見積もり書類（1社ずつ）の明細（docs/flows.md「デモの画面の並び」）。
//
// **明細1行につき採用・保留の2つだけ。押しても画面は移らない**
// （1社ぶんの明細を続けて押せる）。画面が移るのは「一覧へ」だけで、
// それは呼び出し側のページが持つ。ここにリンクを足さない。
//
// 押されている状態は色だけで伝えず aria-pressed で出す
// （components/ComparisonTable.tsx と同じ作法）。

import { useState, useTransition } from "react";

import { markLineAction } from "../app/projects/[id]/quotes/actions";
import { formatYen } from "../lib/calc";
import { QUOTE_DOCUMENT_TEXT } from "../lib/content";
import type { QuoteDocument } from "../lib/db/quoteDocuments";
import type { LineMarkStatus } from "../lib/db/types";

export function QuoteDocumentLines({
  projectId,
  quote,
}: {
  projectId: string;
  quote: QuoteDocument;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function mark(lineItemId: string, status: LineMarkStatus): void {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await markLineAction(projectId, lineItemId, quote.requestId, status);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : QUOTE_DOCUMENT_TEXT.markFailed,
        );
      }
    });
  }

  return (
    <div className="mt-6">
      {errorMessage ? (
        <p role="alert" className="mt-3 text-red-900">
          {errorMessage}
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-4">
        {quote.lines.map((line) => (
          <li
            key={line.lineItemId}
            className="rounded border-2 border-gray-400 p-4"
          >
            <div className="font-bold">{line.name}</div>
            <div className="mt-1 tabular text-gray-700">
              {`${line.quantity} ${line.unit}`}
            </div>

            {line.costUnitPrice === null ? null : (
              <>
                <div className="mt-1 tabular text-lg font-bold">
                  {`${formatYen(line.costUnitPrice)}円`}
                </div>
                <div className="mt-3 flex gap-3">
                  {(
                    [
                      ["adopted", QUOTE_DOCUMENT_TEXT.adopt],
                      ["on_hold", QUOTE_DOCUMENT_TEXT.hold],
                    ] as const
                  ).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={line.mark === status}
                      disabled={isPending}
                      onClick={() => mark(line.lineItemId, status)}
                      className={`tap grow rounded px-5 font-bold ${
                        line.mark === status
                          ? "bg-blue-800 text-white"
                          : "bg-gray-300 text-gray-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
