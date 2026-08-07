"use client";

// D8 見積もり書類（1社ずつ）の明細（docs/flows.md「デモの画面の並び」）。
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

  // 想定内の失敗は**返り値**で受ける。Next.js は本番ビルドで Server Action の例外を
  // 伏せるため、throw を catch して message を出しても意図した日本語は出ない
  // （app/projects/[id]/quotes/actions.ts の MarkLineResult）。
  // catch に残るのは想定外の失敗だけなので、そこは決まった文言にする。
  function mark(lineItemId: string, status: LineMarkStatus): void {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await markLineAction(
          projectId,
          lineItemId,
          quote.requestId,
          status,
        );
        if (!result.ok) setErrorMessage(result.message);
      } catch {
        setErrorMessage(QUOTE_DOCUMENT_TEXT.markFailed);
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

      {/*
        **1明細を縦に積まず、1行にまとめる。** 工事名・数量・金額をそれぞれ別の行に
        置いていたので、1画面に2明細しか入らず、余白ばかりが目立った
        （利用者の指摘 2026-08-08）。工事名と金額を同じ行の左右に置き、
        数量は金額の脇に小さく添える。押す面積（tap）は変えない。
      */}
      <ul className="mt-4 flex flex-col gap-2">
        {quote.lines.map((line) => (
          <li
            key={line.lineItemId}
            className="rounded border-2 border-gray-400 px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{line.name}</span>
              <span className="tabular shrink-0 text-right">
                <span className="text-sm text-gray-700">
                  {`${line.quantity} ${line.unit}`}
                </span>
                {line.costUnitPrice === null ? null : (
                  <span className="ml-2 text-lg font-bold">
                    {`${formatYen(line.costUnitPrice)}円`}
                  </span>
                )}
              </span>
            </div>

            {line.costUnitPrice === null ? null : (
              <div className="mt-2 flex gap-2">
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
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
