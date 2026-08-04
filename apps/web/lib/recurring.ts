import { fromISO } from "./date";
import type { RecurringRule, Transaction } from "./types";

/** 同じ日付(day)・同じ金額・同じ種別の入力が何ヶ月分あれば「毎月定額」とみなすか。 */
const MIN_OCCURRENCES = 2;

/**
 * 手入力の履歴から「毎月決まっている」支出・収入を検出する（外部AI不使用のパターン検知）。
 * 同じ日付(day of month)・同じ金額・同じ種別の入力が異なる月に2回以上あれば1件のルールにする。
 */
export function detectRecurringMonthly(
  transactions: Transaction[],
): RecurringRule[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const day = fromISO(t.date).getDate();
    const key = `${t.type}:${day}:${t.amount}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const rules: RecurringRule[] = [];
  for (const list of groups.values()) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    if (months.size < MIN_OCCURRENCES) continue;
    const latest = list.reduce((a, b) => (a.date > b.date ? a : b));
    rules.push({
      type: latest.type,
      dayOfMonth: fromISO(latest.date).getDate(),
      amount: latest.amount,
      memo: latest.memo,
    });
  }
  return rules;
}
