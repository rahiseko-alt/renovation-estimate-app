import { addDays, daysBetween, fromISO, todayISO } from "./date";
import { detectRecurringMonthly } from "./recurring";
import type { AppData, RecurringRule, Transaction } from "./types";

function signedAmount(t: Transaction): number {
  return t.type === "income" ? t.amount : -t.amount;
}

/** 今日時点の実残高（初期残高＋今日までの手入力の合計）。 */
export function currentBalance(data: AppData): number {
  const today = todayISO();
  const settled = data.transactions.filter((t) => t.date <= today);
  const sum = settled.reduce((acc, t) => acc + signedAmount(t), 0);
  return data.startingBalance + sum;
}

function dailyProjectedDelta(
  data: AppData,
  dateIso: string,
  recurring: RecurringRule[],
): number {
  const day = fromISO(dateIso).getDate();
  let delta = 0;
  for (const rule of recurring) {
    if (rule.dayOfMonth === day) {
      delta += rule.type === "income" ? rule.amount : -rule.amount;
    }
  }
  for (const fixed of data.fixedDailyExpenses) {
    delta -= fixed.amount;
  }
  for (const t of data.transactions) {
    if (t.date === dateIso) delta += signedAmount(t);
  }
  return delta;
}

/** 指定日時点の予測残高。今日以前は実残高をそのまま返す。 */
export function forecastBalance(data: AppData, targetDateIso: string): number {
  const today = todayISO();
  const balance = currentBalance(data);
  if (targetDateIso <= today) return balance;

  const recurring = detectRecurringMonthly(data.transactions);
  const days = daysBetween(today, targetDateIso);
  let projected = balance;
  for (let i = 1; i <= days; i++) {
    projected += dailyProjectedDelta(data, addDays(today, i), recurring);
  }
  return projected;
}

export interface DailyBalancePoint {
  date: string;
  balance: number;
}

/** 水位グラフ用：指定期間の日毎の残高推移（過去は実データ、未来は予測）。 */
export function dailyBalanceSeries(
  data: AppData,
  fromDateIso: string,
  toDateIso: string,
): DailyBalancePoint[] {
  const today = todayISO();
  const recurring = detectRecurringMonthly(data.transactions);

  let balance: number;
  if (fromDateIso <= today) {
    const before = data.transactions.filter((t) => t.date < fromDateIso);
    balance =
      data.startingBalance + before.reduce((a, t) => a + signedAmount(t), 0);
  } else {
    balance = forecastBalance(data, addDays(fromDateIso, -1));
  }

  const span = daysBetween(fromDateIso, toDateIso);
  const points: DailyBalancePoint[] = [];
  for (let i = 0; i <= span; i++) {
    const date = addDays(fromDateIso, i);
    if (date <= today) {
      const dayTx = data.transactions.filter((t) => t.date === date);
      balance += dayTx.reduce((a, t) => a + signedAmount(t), 0);
    } else {
      balance += dailyProjectedDelta(data, date, recurring);
    }
    points.push({ date, balance });
  }
  return points;
}
