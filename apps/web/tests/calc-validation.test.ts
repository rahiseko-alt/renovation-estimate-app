import { describe, expect, it } from "vitest";

import { calcEstimate, lineAmount, sellingUnitPrice, type EstimateLine } from "../lib/calc";

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

// item の控除と discount の比較で条件を揃えるための共有値
// （AGENTS.md「結合を増やさない」1：同じ値を2箇所以上に書かない）。
const COMPARISON_BASE_UNIT_PRICE = 100000;
const COMPARISON_DEDUCTION_UNIT_PRICE = -20000;
const COMPARISON_OVERHEAD_RATE_PERCENT = 10;

describe("calcEstimate の入力検証", () => {
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
        line({ quantity: 1, unitPrice: COMPARISON_BASE_UNIT_PRICE }),
        line({
          name: "支給材控除",
          quantity: 1,
          unit: "式",
          unitPrice: COMPARISON_DEDUCTION_UNIT_PRICE,
        }),
      ],
      overheadRatePercent: COMPARISON_OVERHEAD_RATE_PERCENT,
    });

    // 直接工事費が減るので、諸経費の算定基礎も一緒に減る（値引き行との違い）
    expect(totals.directCostSubtotal).toBe(80000);
    expect(totals.overheadAmount).toBe(8000);
    expect(totals.netAmount).toBe(88000);
  });

  it("同じ額でも item の控除と discount では諸経費が変わる", () => {
    const asItem = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: COMPARISON_BASE_UNIT_PRICE }),
        line({ quantity: 1, unit: "式", unitPrice: COMPARISON_DEDUCTION_UNIT_PRICE }),
      ],
      overheadRatePercent: COMPARISON_OVERHEAD_RATE_PERCENT,
    });
    const asDiscount = calcEstimate({
      lines: [
        line({ quantity: 1, unitPrice: COMPARISON_BASE_UNIT_PRICE }),
        line({
          kind: "discount",
          quantity: 1,
          unit: "式",
          unitPrice: COMPARISON_DEDUCTION_UNIT_PRICE,
        }),
      ],
      overheadRatePercent: COMPARISON_OVERHEAD_RATE_PERCENT,
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

describe("安全整数の範囲を超える金額を弾く", () => {
  it("単価が大きすぎると例外を投げる", () => {
    expect(() =>
      lineAmount(line({ quantity: 1, unitPrice: Number.MAX_SAFE_INTEGER })),
    ).toThrow(/単価が大きすぎます/);
  });

  it("上限ぎりぎりの単価×数量でも安全整数に収まる", () => {
    // 単価の上限（10億）と数量の上限（100万）を掛けても
    // Number.MAX_SAFE_INTEGER（約900兆）の1割程度に収まる。
    const amount = lineAmount(
      line({ quantity: 1_000_000, unitPrice: 1_000_000_000 }),
    );
    expect(Number.isSafeInteger(amount)).toBe(true);
    expect(amount).toBe(1_000_000_000_000_000);
  });

  it("原価単価が大きすぎると例外を投げる", () => {
    expect(() => sellingUnitPrice(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      /原価単価が大きすぎます/,
    );
  });

  it("上限ぎりぎりの原価単価×掛率でも安全整数に収まる", () => {
    const price = sellingUnitPrice(1_000_000_000, 1_000_000);
    expect(Number.isSafeInteger(price)).toBe(true);
  });

  it("諸経費率が大きすぎると例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [line()],
        overheadRatePercent: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/諸経費率が大きすぎます/);
  });
});
