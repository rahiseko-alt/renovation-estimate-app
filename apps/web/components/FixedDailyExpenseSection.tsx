"use client";

import { useState } from "react";

import { DETAIL_TEXT } from "../lib/content";
import type { FixedDailyExpense } from "../lib/types";

interface FixedDailyExpenseSectionProps {
  items: FixedDailyExpense[];
  onAdd: (item: FixedDailyExpense) => void;
  onDelete: (id: string) => void;
}

/** 毎日の固定支出（AI判定の対象外。ユーザーが入力する）。 */
export function FixedDailyExpenseSection({
  items,
  onAdd,
  onDelete,
}: FixedDailyExpenseSectionProps) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [showAmountError, setShowAmountError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setShowAmountError(true);
      return;
    }
    onAdd({ id: crypto.randomUUID(), amount: amountNumber, memo });
    setAmount("");
    setMemo("");
    setShowAmountError(false);
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {DETAIL_TEXT.fixedDailyHeading}
      </h2>

      {items.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">
          {DETAIL_TEXT.fixedDailyEmpty}
        </p>
      ) : (
        <ul className="mb-3 flex flex-col divide-y divide-gray-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-900">
                {item.memo || DETAIL_TEXT.fixedDailyHeading}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-red-600">
                  -{item.amount.toLocaleString("ja-JP")}円
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="min-h-11 min-w-11 rounded-md text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                >
                  {DETAIL_TEXT.deleteButton}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-600">
          {DETAIL_TEXT.fixedDailyAmountLabel}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setShowAmountError(false);
            }}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 font-normal text-gray-900"
          />
          {showAmountError ? (
            <span className="text-xs font-normal text-red-600">
              {DETAIL_TEXT.amountError}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-600">
          {DETAIL_TEXT.memoLabel}
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 font-normal text-gray-900"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          {DETAIL_TEXT.fixedDailyAddButton}
        </button>
      </form>
    </div>
  );
}
