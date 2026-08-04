import { DETAIL_TEXT } from "../lib/content";
import type { RecurringRule } from "../lib/types";

interface RecurringSummaryProps {
  rules: RecurringRule[];
}

/** 履歴から自動検出された「毎月決まっている」支出・収入（読み取り専用）。 */
export function RecurringSummary({ rules }: RecurringSummaryProps) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {DETAIL_TEXT.recurringHeading}
      </h2>
      {rules.length === 0 ? (
        <div>
          <p className="text-sm text-gray-500">
            {DETAIL_TEXT.recurringEmptyMain}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {DETAIL_TEXT.recurringEmptyNote}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {rules.map((rule) => (
            <li
              key={`${rule.type}:${rule.dayOfMonth}:${rule.amount}`}
              className="flex items-center justify-between py-2"
            >
              <div>
                <p className="text-sm text-gray-900">
                  毎月{rule.dayOfMonth}日・
                  {rule.type === "expense"
                    ? DETAIL_TEXT.recurringExpenseLabel
                    : DETAIL_TEXT.recurringIncomeLabel}
                </p>
                {rule.memo ? (
                  <p className="text-xs text-gray-500">{rule.memo}</p>
                ) : null}
              </div>
              <span
                className={`text-sm font-semibold ${
                  rule.type === "expense" ? "text-red-600" : "text-blue-600"
                }`}
              >
                {rule.type === "expense" ? "-" : "+"}
                {rule.amount.toLocaleString("ja-JP")}円
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
