"use client";

// 比較表と採用（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）。
//
// **1明細につき採用は1社まで（排他）。** 旧実装は「追加」だったので、3社に同じ工事を
// 頼んで3社とも回答すると同じ工事項目が見積に3行入った。ここでは行を足さず、
// 明細ごとに1社を選ぶ。選び直せる。明細ごとに違う社を採る混在採用も許す。
//
// **最安を自動では選ばない。** 目印は出すが、選ぶのは人。安いものが常に正しいとは
// 限らない（design.md はここを自動化するとは決めていない）。

import { useState, useTransition } from "react";

import {
  adoptLineAction,
  cancelLineAdoptionAction,
} from "../app/projects/[id]/comparison/actions";
import { formatYen } from "../lib/calc";
import { COMPARISON_TEXT } from "../lib/content";
import type { Comparison } from "../lib/db/comparison";

export function ComparisonTable({
  projectId,
  comparison,
  cheapestByLineId,
}: {
  projectId: string;
  comparison: Comparison;
  cheapestByLineId: Record<string, string>;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>): void {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : COMPARISON_TEXT.adoptFailed,
        );
      }
    });
  }

  if (comparison.columns.length === 0) {
    return <p className="mt-6 text-gray-700">{COMPARISON_TEXT.empty}</p>;
  }

  return (
    <div className="mt-6">
      <p className="text-gray-700">{COMPARISON_TEXT.cheapestNote}</p>

      {errorMessage ? (
        <p role="alert" className="mt-3 text-red-900">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-6">
        {comparison.rows.map((row) => (
          <section
            key={row.line.id}
            className="rounded border-2 border-gray-400 p-4"
          >
            <h2 className="font-bold">{row.line.name}</h2>
            <p className="text-gray-700">
              {`${COMPARISON_TEXT.quantityColumn} ${row.line.quantity} ${row.line.unit}`}
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {comparison.columns.map((column) => {
                const price = column.costUnitPriceByLineId[row.line.id];
                const isAdopted = row.adoptedRequestId === column.requestId;
                const isCheapest =
                  cheapestByLineId[row.line.id] === column.requestId;

                return (
                  <li
                    key={column.requestId}
                    className="flex items-center justify-between gap-3 border-t border-gray-300 pt-2"
                  >
                    <div>
                      <div className="font-bold">{column.companyName}</div>
                      <div className="tabular">
                        {price === undefined
                          ? COMPARISON_TEXT.waiting
                          : `${formatYen(price)}円`}
                        {isCheapest && price !== undefined
                          ? `　${COMPARISON_TEXT.cheapestMark}`
                          : ""}
                      </div>
                    </div>

                    {price === undefined ? null : isAdopted ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            cancelLineAdoptionAction(projectId, row.line.id),
                          )
                        }
                        className="tap shrink-0 rounded border-2 border-blue-700 px-4 font-bold text-blue-700"
                      >
                        {COMPARISON_TEXT.cancelAdoption}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            adoptLineAction(
                              projectId,
                              row.line.id,
                              column.requestId,
                            ),
                          )
                        }
                        className="tap shrink-0 rounded bg-blue-700 px-4 font-bold text-white disabled:bg-gray-500"
                      >
                        {COMPARISON_TEXT.adopt}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {row.adoptedRequestId ? (
              <p className="mt-3 font-bold text-blue-800">
                {COMPARISON_TEXT.adopted}:{" "}
                {
                  comparison.columns.find(
                    (column) => column.requestId === row.adoptedRequestId,
                  )?.companyName
                }
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
