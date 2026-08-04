import { addMonths, todayISO, toISO } from "./date";
import type { AppData, FixedDailyExpense, Transaction, TransactionType } from "./types";

const FORECAST_MONTHS_AHEAD = 3;
const RECURRING_HISTORY_MONTHS = 3;
const DAILY_LIVING_COST = 3_500;

interface RecurringPattern {
  type: TransactionType;
  day: number;
  amount: number;
  memo: string;
}

/** フリーランスの毎月ほぼ固定の収支（家賃・保険料・ソフト利用料・顧問契約1件）。 */
const RECURRING_PATTERN: RecurringPattern[] = [
  { type: "expense", day: 1, amount: 70_000, memo: "家賃" },
  { type: "expense", day: 15, amount: 13_000, memo: "国民年金・国民健康保険" },
  { type: "expense", day: 27, amount: 3_000, memo: "会計ソフト利用料" },
  { type: "income", day: 25, amount: 100_000, memo: "顧問契約（A社）月額報酬" },
];

interface IrregularEntry {
  monthsAgo: number;
  day: number;
  type: TransactionType;
  amount: number;
  memo: string;
}

/** 案件ごとに金額も入金日もばらつく、フリーランスらしい不安定な収支。 */
const IRREGULAR_ENTRIES: IrregularEntry[] = [
  { monthsAgo: 3, day: 5, type: "income", amount: 75_000, memo: "Webサイト制作 案件A 納品" },
  { monthsAgo: 3, day: 12, type: "expense", amount: 20_000, memo: "PC周辺機器" },
  { monthsAgo: 3, day: 19, type: "income", amount: 40_000, memo: "ロゴデザイン 案件B" },
  { monthsAgo: 3, day: 24, type: "expense", amount: 8_000, memo: "打ち合わせ交通費" },
  { monthsAgo: 2, day: 5, type: "income", amount: 130_000, memo: "アプリ開発 着手金 案件C" },
  { monthsAgo: 2, day: 12, type: "expense", amount: 30_000, memo: "外注費（デザイン）" },
  { monthsAgo: 2, day: 19, type: "income", amount: 25_000, memo: "記事執筆 案件D" },
  { monthsAgo: 2, day: 24, type: "expense", amount: 6_500, memo: "書籍・資料" },
  { monthsAgo: 1, day: 5, type: "income", amount: 85_000, memo: "アプリ開発 中間金 案件C" },
  { monthsAgo: 1, day: 12, type: "expense", amount: 45_000, memo: "税理士相談料" },
  { monthsAgo: 1, day: 19, type: "income", amount: 18_000, memo: "コンサル 案件E" },
  { monthsAgo: 1, day: 24, type: "expense", amount: 12_000, memo: "セミナー参加費" },
  { monthsAgo: 0, day: 2, type: "income", amount: 50_000, memo: "デザイン修正 案件B" },
];

function monthAgoDate(year: number, month0: number, monthsAgo: number, day: number): string {
  return toISO(new Date(year, month0 - monthsAgo, day));
}

/**
 * フリーランス（収入が月ごとに変動する）を想定したデモデータ。
 * 過去分は「毎月定額」検知が働くように3か月分の実績を作り、予測日は3か月先にする。
 */
export function buildDemoAppData(): AppData {
  const today = todayISO();
  const now = new Date();
  const year = now.getFullYear();
  const month0 = now.getMonth();

  const transactions: Transaction[] = [];
  let seq = 0;
  const nextId = () => `demo-${seq++}`;

  for (let monthsAgo = RECURRING_HISTORY_MONTHS; monthsAgo >= 0; monthsAgo--) {
    for (const p of RECURRING_PATTERN) {
      const date = monthAgoDate(year, month0, monthsAgo, p.day);
      if (date <= today) {
        transactions.push({ id: nextId(), date, type: p.type, amount: p.amount, memo: p.memo });
      }
    }
  }

  for (const e of IRREGULAR_ENTRIES) {
    const date = monthAgoDate(year, month0, e.monthsAgo, e.day);
    if (date <= today) {
      transactions.push({ id: nextId(), date, type: e.type, amount: e.amount, memo: e.memo });
    }
  }

  const fixedDailyExpenses: FixedDailyExpense[] = [
    { id: "demo-daily-living", amount: DAILY_LIVING_COST, memo: "生活費（食費・交通費など）" },
  ];

  return {
    startingBalance: 0,
    selectedDate: addMonths(today, FORECAST_MONTHS_AHEAD),
    transactions,
    fixedDailyExpenses,
    chartAxis: { top: null, middle: null, bottom: null },
  };
}
