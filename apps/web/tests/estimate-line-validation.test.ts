import { describe, expect, it } from "vitest";

import { isValidNumberInput } from "../lib/estimateLineValidation";

describe("isValidNumberInput", () => {
  it("整数はOK", () => {
    expect(isValidNumberInput("10")).toBe(true);
  });

  it("小数はOK", () => {
    expect(isValidNumberInput("1.5")).toBe(true);
  });

  it("負の数もOK（値引きの単価などで使う）", () => {
    expect(isValidNumberInput("-100")).toBe(true);
  });

  it("0はOK（諸経費率の初期値など）", () => {
    expect(isValidNumberInput("0")).toBe(true);
  });

  it("空欄はNG", () => {
    expect(isValidNumberInput("")).toBe(false);
  });

  it("空白だけもNG", () => {
    expect(isValidNumberInput("   ")).toBe(false);
  });

  it("数字でない文字列はNG", () => {
    expect(isValidNumberInput("abc")).toBe(false);
  });

  it("数字と文字が混ざった文字列はNG", () => {
    expect(isValidNumberInput("12abc")).toBe(false);
  });
});
