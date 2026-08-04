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

  it("浮動小数点の誤差で1円ずれない", () => {
    // 1.1 * 1000 は 1100.0000000000002 になる
    expect(lineAmount(line({ quantity: 1.1, unitPrice: 1000 }))).toBe(1100);
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

  it("単価が整数でなければ例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ unitPrice: 1000.5 })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/単価が整数ではありません/);
  });

  it("数量が数値でなければ例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ quantity: Number.NaN })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/数量が数値ではありません/);
  });

  it("諸経費率が負なら例外を投げる", () => {
    expect(() =>
      calcEstimate({ lines: [line()], overheadRatePercent: -5 }),
    ).toThrow(/諸経費率が負の数です/);
  });

  it("税区分が不正なら例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [
          line({ taxCategory: "unknown" as unknown as EstimateLine["taxCategory"] }),
        ],
        overheadRatePercent: 0,
      }),
    ).toThrow(/税区分が不正です/);
  });

  it("知らない種別を黙って無視せず例外を投げる（行が合計から静かに消えるのを防ぐ）", () => {
    expect(() =>
      calcEstimate({
        lines: [
          line({ kind: "note" as unknown as EstimateLine["kind"], unitPrice: 50000 }),
        ],
        overheadRatePercent: 0,
      }),
    ).toThrow(/種別が不正です/);
  });

  it("値引き行の金額が正なら例外を投げる（値引きで金額が増えるのを防ぐ）", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ kind: "discount", quantity: 1, unitPrice: 10000 })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/値引き行なのに金額が正です/);
  });

  it("数量と単価が両方負の値引き行も、金額が正になるので弾く", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ kind: "discount", quantity: -2, unitPrice: -5000 })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/値引き行なのに金額が正です/);
  });

  it("金額0の値引き行は通す（まだ金額を入れていない行を弾かない）", () => {
    const totals = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 10000 }),
        line({ kind: "discount", quantity: 1, unit: "式", unitPrice: 0 }),
      ],
      overheadRatePercent: 0,
    });
    expect(totals.netAmount).toBe(10000);
  });

  it("item の負の金額は許す（支給材の控除など、直接工事費そのものが減る場合）", () => {
    const totals = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 100000 }),
        line({ name: "支給材控除", quantity: 1, unit: "式", unitPrice: -20000 }),
      ],
      overheadRatePercent: 10,
    });

    // 直接工事費が減るので、諸経費の算定基礎も一緒に減る（値引き行との違い）
    expect(totals.directCostSubtotal).toBe(80000);
    expect(totals.overheadAmount).toBe(8000);
    expect(totals.netAmount).toBe(88000);
  });

  it("同じ額でも item の控除と discount では諸経費が変わる", () => {
    const asItem = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 100000 }),
        line({ quantity: 1, unit: "式", unitPrice: -20000 }),
      ],
      overheadRatePercent: 10,
    });
    const asDiscount = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: 100000 }),
        line({ kind: "discount", quantity: 1, unit: "式", unitPrice: -20000 }),
      ],
      overheadRatePercent: 10,
    });

    expect(asItem.overheadAmount).toBe(8000);
    expect(asDiscount.overheadAmount).toBe(10000);
    expect(asItem.netAmount).toBe(88000);
    expect(asDiscount.netAmount).toBe(90000);
  });

  it("何行目が悪いかを例外に含める", () => {
    expect(() =>
      calcEstimate({
        lines: [line(), line(), line({ unitPrice: 3.3 })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/3行目/);
  });
});

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
