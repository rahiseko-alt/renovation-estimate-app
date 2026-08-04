import { describe, expect, it } from "vitest";

import {
  calcEstimate,
  formatYen,
  lineAmount,
  sellingUnitPrice,
  type EstimateLine,
} from "../lib/calc";

function line(partial: Partial<EstimateLine> = {}): EstimateLine {
  return {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: 1,
    unit: "㎡",
    unitPrice: 1000,
    taxCategory: "standard",
    ...partial,
  };
}

describe("lineAmount", () => {
  it("数量と単価を掛ける", () => {
    expect(lineAmount(line({ quantity: 12, unitPrice: 1200 }))).toBe(14400);
  });

  it("円未満を切り捨てる", () => {
    expect(lineAmount(line({ quantity: 3.5, unitPrice: 999 }))).toBe(3496);
  });

  it("浮動小数点の誤差で1円ずれない（真値より上に出る誤差）", () => {
    // 1.1 * 90 は 99.00000000000001 になる。
    // 注: 真値より上に出る誤差は Math.trunc だけでも壊れない（99.00000000000001 を
    // 切り捨てても 99 になる）。ここは丸め処理を入れてもこの性質が壊れないことを
    // 確かめる回帰検査。実際に壊れるのは下に出る誤差の方（次のテスト）。
    expect(lineAmount(line({ quantity: 1.1, unitPrice: 90 }))).toBe(99);
  });

  it("浮動小数点の誤差で1円ずれない（真値より下に出る誤差）", () => {
    // 1.4 * 1400 は 1959.9999999999998 になり、そのまま切り捨てると1円少ない
    expect(lineAmount(line({ quantity: 1.4, unitPrice: 1400 }))).toBe(1960);
    // 0.7 * 90 は 62.99999999999999 になる
    expect(lineAmount(line({ quantity: 0.7, unitPrice: 90 }))).toBe(63);
    // 0.29 * 100 は 28.999999999999996 になる
    expect(lineAmount(line({ quantity: 0.29, unitPrice: 100 }))).toBe(29);
  });

  it("本物の小数の端数は、浮動小数点ノイズと間違えて動かさない", () => {
    // 1.9999996 は浮動小数点のノイズではなく、本当にその値の数量。
    // 2に近いからといって2円に切り上げてはいけない（真の値は1円未満）。
    expect(lineAmount(line({ quantity: 1.9999996, unitPrice: 1 }))).toBe(1);
  });

  it("負の金額は0方向に切り捨てる（値引き額を勝手に増やさない）", () => {
    expect(
      lineAmount(line({ kind: "discount", quantity: 0.5, unitPrice: -333 })),
    ).toBe(-166);
  });

  it("数量0なら0円", () => {
    expect(lineAmount(line({ quantity: 0, unitPrice: 50000 }))).toBe(0);
  });
});

describe("calcEstimate", () => {
  it("明細1行、諸経費なしで工事価格と消費税と合計が出る", () => {
    const totals = calcEstimate({
      lines: [line({ quantity: 10, unitPrice: 1000 })],
      overheadRatePercent: 0,
    });

    expect(totals.directCostSubtotal).toBe(10000);
    expect(totals.overheadAmount).toBe(0);
    expect(totals.netAmount).toBe(10000);
    expect(totals.taxAmount).toBe(1000);
    expect(totals.grandTotal).toBe(11000);
  });

  it("明細20行の合計と消費税が電卓と一致する", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      line({ name: `工事項目${i + 1}`, quantity: 1, unitPrice: 12345 }),
    );

    const totals = calcEstimate({ lines, overheadRatePercent: 10 });

    expect(totals.directCostSubtotal).toBe(246900);
    expect(totals.overheadAmount).toBe(24690);
    expect(totals.subtotalBeforeDiscount).toBe(271590);
    expect(totals.netAmount).toBe(271590);
    expect(totals.taxAmount).toBe(27159);
    expect(totals.grandTotal).toBe(298749);
  });

  it("諸経費は直接工事費 小計に率を掛けて円未満切り捨てる", () => {
    const totals = calcEstimate({
      lines: [line({ quantity: 1, unitPrice: 33333 })],
      overheadRatePercent: 15,
    });

    // 33333 * 0.15 = 4999.95 → 4999
    expect(totals.overheadAmount).toBe(4999);
    expect(totals.subtotalBeforeDiscount).toBe(38332);
  });

  it("値引きは直接工事費 小計に入らず、諸経費を足した後に引かれる", () => {
    const totals = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 100000 }),
        line({
          kind: "discount",
          name: "出精値引き",
          quantity: 1,
          unit: "式",
          unitPrice: -10000,
        }),
      ],
      overheadRatePercent: 10,
    });

    // 値引きを先に引いていたら諸経費は 9000 になり、工事価格は 99000 になる
    expect(totals.directCostSubtotal).toBe(100000);
    expect(totals.overheadAmount).toBe(10000);
    expect(totals.subtotalBeforeDiscount).toBe(110000);
    expect(totals.discountAmount).toBe(-10000);
    expect(totals.netAmount).toBe(100000);
    expect(totals.taxAmount).toBe(10000);
    expect(totals.grandTotal).toBe(110000);
  });

  it("消費税は税区分ごとに積み上げてから1回だけ端数処理する", () => {
    const lines = Array.from({ length: 3 }, () =>
      line({ quantity: 1, unitPrice: 105 }),
    );

    const totals = calcEstimate({ lines, overheadRatePercent: 0 });

    // 行ごとに切り捨てて足すと 10 * 3 = 30 になる。積み上げてから1回なら 315 * 0.1 = 31.5 → 31
    expect(totals.directCostSubtotal).toBe(315);
    expect(totals.taxAmount).toBe(31);
  });

  it("税区分が混ざったら区分ごとに内訳を出す", () => {
    const totals = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 100000, taxCategory: "standard" }),
        line({ quantity: 1, unitPrice: 50000, taxCategory: "exempt" }),
      ],
      overheadRatePercent: 0,
    });

    expect(totals.taxBreakdown).toEqual([
      {
        category: "standard",
        rate: 0.1,
        taxableAmount: 100000,
        taxAmount: 10000,
      },
      { category: "exempt", rate: 0, taxableAmount: 50000, taxAmount: 0 },
    ]);
    expect(totals.netAmount).toBe(150000);
    expect(totals.taxAmount).toBe(10000);
    expect(totals.grandTotal).toBe(160000);
  });

  it("対価の額が0の税区分は内訳に出さない", () => {
    const totals = calcEstimate({
      lines: [line({ quantity: 1, unitPrice: 1000 })],
      overheadRatePercent: 0,
    });

    expect(totals.taxBreakdown).toHaveLength(1);
    expect(totals.taxBreakdown[0]?.category).toBe("standard");
  });

  it("諸経費の税区分は既定で標準税率、指定すれば変えられる", () => {
    const withDefault = calcEstimate({
      lines: [line({ quantity: 1, unitPrice: 100000, taxCategory: "exempt" })],
      overheadRatePercent: 10,
    });
    // 諸経費 10000 だけが標準税率の対象になる
    expect(withDefault.taxAmount).toBe(1000);

    const withExempt = calcEstimate({
      lines: [line({ quantity: 1, unitPrice: 100000, taxCategory: "exempt" })],
      overheadRatePercent: 10,
      overheadTaxCategory: "exempt",
    });
    expect(withExempt.taxAmount).toBe(0);
  });

  it("明細が空でも落ちず、すべて0を返す", () => {
    const totals = calcEstimate({ lines: [], overheadRatePercent: 10 });

    expect(totals.directCostSubtotal).toBe(0);
    expect(totals.overheadAmount).toBe(0);
    expect(totals.netAmount).toBe(0);
    expect(totals.taxBreakdown).toEqual([]);
    expect(totals.grandTotal).toBe(0);
  });

  it("1円の明細でも消費税は切り捨てで0円になる", () => {
    const totals = calcEstimate({
      lines: [line({ quantity: 1, unitPrice: 1 })],
      overheadRatePercent: 0,
    });

    expect(totals.netAmount).toBe(1);
    expect(totals.taxAmount).toBe(0);
    expect(totals.grandTotal).toBe(1);
  });

  it("値引きが明細を上回ると工事価格が負になる（黙って0にしない）", () => {
    const totals = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 10000 }),
        line({ kind: "discount", quantity: 1, unit: "式", unitPrice: -30000 }),
      ],
      overheadRatePercent: 0,
    });

    expect(totals.netAmount).toBe(-20000);
  });

});

// 入力の妥当性検証（不正な種別・値引きの符号・例外メッセージ等）は
// tests/calc-validation.test.ts に分けている
// （AGENTS.md「結合を増やさない」：行数上限で割らず、意味の塊で分ける）。

describe("sellingUnitPrice", () => {
  it("原価に掛率をかける", () => {
    expect(sellingUnitPrice(8000, 1.25)).toBe(10000);
  });

  it("円未満を切り捨てる", () => {
    expect(sellingUnitPrice(3333, 1.25)).toBe(4166);
  });

  it("掛率が負なら例外を投げる", () => {
    expect(() => sellingUnitPrice(1000, -1)).toThrow(/掛率が負の数です/);
  });
});

describe("formatYen", () => {
  it("3桁ごとに区切る", () => {
    expect(formatYen(1234567)).toBe("1,234,567");
  });

  it("負の金額も区切る", () => {
    expect(formatYen(-50000)).toBe("-50,000");
  });
});
