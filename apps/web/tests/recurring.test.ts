import { describe, expect, it } from "vitest";

import { detectRecurringMonthly } from "../lib/recurring";
import type { Transaction } from "../lib/types";

function tx(partial: Partial<Transaction> & Pick<Transaction, "date" | "type" | "amount">): Transaction {
  return { id: crypto.randomUUID(), memo: "", ...partial };
}

describe("detectRecurringMonthly", () => {
  it("detects an expense repeated on the same day for 2+ months", () => {
    const rules = detectRecurringMonthly([
      tx({ date: "2026-06-27", type: "expense", amount: 8000, memo: "家賃" }),
      tx({ date: "2026-07-27", type: "expense", amount: 8000, memo: "家賃" }),
    ]);
    expect(rules).toEqual([
      { type: "expense", dayOfMonth: 27, amount: 8000, memo: "家賃" },
    ]);
  });

  it("ignores a single occurrence", () => {
    const rules = detectRecurringMonthly([
      tx({ date: "2026-06-27", type: "expense", amount: 8000 }),
    ]);
    expect(rules).toEqual([]);
  });

  it("ignores entries that differ in amount", () => {
    const rules = detectRecurringMonthly([
      tx({ date: "2026-06-15", type: "income", amount: 3000 }),
      tx({ date: "2026-07-15", type: "income", amount: 3500 }),
    ]);
    expect(rules).toEqual([]);
  });
});
