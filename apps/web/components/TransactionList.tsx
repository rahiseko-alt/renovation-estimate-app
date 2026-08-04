import { DETAIL_TEXT } from "../lib/content";
import { formatJP } from "../lib/date";
import type { Transaction, TransactionType } from "../lib/types";

interface TransactionListProps {
  emptyMessage: string;
  transactions: Transaction[];
  onDelete: (id: string) => void;
  tone: TransactionType;
}

const TONE_CLASS: Record<TransactionType, string> = {
  expense: "text-red-600",
  income: "text-blue-600",
};

const TONE_SIGN: Record<TransactionType, string> = {
  expense: "-",
  income: "+",
};

/** 日毎の支出・収入の一覧（新しい日付が上）。 */
export function TransactionList({
  emptyMessage,
  transactions,
  onDelete,
  tone,
}: TransactionListProps) {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {sorted.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-gray-900">{formatJP(t.date)}</p>
                {t.memo ? (
                  <p className="text-xs text-gray-500">{t.memo}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-semibold ${TONE_CLASS[tone]}`}
                >
                  {TONE_SIGN[tone]}
                  {t.amount.toLocaleString("ja-JP")}円
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  className="min-h-11 min-w-11 rounded-md text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                >
                  {DETAIL_TEXT.deleteButton}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
