import { describe, expect, it } from "vitest";

import { addDays, todayISO } from "../lib/date";
import { currentBalance, forecastBalance } from "../lib/forecast";
import type { AppData } from "../lib/types";

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    startingBalance: 10_000,
    selectedDate: todayISO(),
    transactions: [],
    fixedDailyExpenses: [],
    chartAxis: { top: null, middle: null, bottom: null },
    ...overrides,
  };
}

describe("currentBalance", () => {
  it("sums starting balance with settled transactions up to today", () => {
    const data = baseData({
      transactions: [
        { id: "1", date: todayISO(), type: "income", amount: 2000, memo: "" },
        { id: "2", date: todayISO(), type: "expense", amount: 500, memo: "" },
      ],
    });
    expect(currentBalance(data)).toBe(10_000 + 2000 - 500);
  });
});

describe("forecastBalance", () => {
  it("returns the current balance for today or the past", () => {
    const data = baseData();
    expect(forecastBalance(data, todayISO())).toBe(currentBalance(data));
  });

  it("subtracts fixed daily expenses for each future day", () => {
    const data = baseData({
      fixedDailyExpenses: [{ id: "f1", amount: 300, memo: "昼食" }],
    });
    const target = addDays(todayISO(), 3);
    expect(forecastBalance(data, target)).toBe(currentBalance(data) - 300 * 3);
  });
});
