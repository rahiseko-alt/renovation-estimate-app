import { describe, expect, it } from "vitest";

import {
  calcEstimate,
  isValidTaxCategory,
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

  it("工事項目が長すぎると例外を投げる（PDF生成の文字幅計測に負荷をかけられるのを防ぐ）", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ name: "あ".repeat(201) })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/工事項目が長すぎます/);
  });

  it("摘要が長すぎると例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ spec: "あ".repeat(201) })],
        overheadRatePercent: 0,
      }),
    ).toThrow(/摘要が長すぎます/);
  });

  it("上限ちょうどの文字数は通す", () => {
    expect(() =>
      calcEstimate({
        lines: [line({ name: "あ".repeat(200), spec: "あ".repeat(200) })],
        overheadRatePercent: 0,
      }),
    ).not.toThrow();
  });

  it("明細行数が多すぎると例外を投げる（無制限にPDFのページを作らせないため）", () => {
    const lines = Array.from({ length: 501 }, () => line());
    expect(() =>
      calcEstimate({ lines, overheadRatePercent: 0 }),
    ).toThrow(/明細の行数が多すぎます/);
  });

  it("上限ちょうどの行数は通す", () => {
    const lines = Array.from({ length: 500 }, () => line());
    expect(() =>
      calcEstimate({ lines, overheadRatePercent: 0 }),
    ).not.toThrow();
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

describe("isValidTaxCategory", () => {
  it("standard・reduced・exempt はOK", () => {
    expect(isValidTaxCategory("standard")).toBe(true);
    expect(isValidTaxCategory("reduced")).toBe(true);
    expect(isValidTaxCategory("exempt")).toBe(true);
  });

  it("知らない文字列はNG", () => {
    expect(isValidTaxCategory("unknown")).toBe(false);
    expect(isValidTaxCategory("")).toBe(false);
  });

  it("Object.prototype 由来の値は in なら通ってしまうが、ここでは弾く（TAX_RATES の own property ではないため）", () => {
    expect(isValidTaxCategory("toString")).toBe(false);
    expect(isValidTaxCategory("__proto__")).toBe(false);
    expect(isValidTaxCategory("hasOwnProperty")).toBe(false);
    expect(isValidTaxCategory("constructor")).toBe(false);
  });

  it("__proto__ を税区分にした行は calcEstimate が例外を投げる（税額計算からの静かな脱落を防ぐ）", () => {
    expect(() =>
      calcEstimate({
        lines: [
          line({
            taxCategory: "__proto__" as unknown as EstimateLine["taxCategory"],
          }),
        ],
        overheadRatePercent: 0,
      }),
    ).toThrow(/税区分が不正です/);
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
    expect(price).toBe(1_000_000_000_000_000);
  });

  it("諸経費率が大きすぎると例外を投げる", () => {
    expect(() =>
      calcEstimate({
        lines: [line()],
        overheadRatePercent: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/諸経費率が大きすぎます/);
  });

  it("積み上げの途中で安全整数を超えても、後で戻れば最終値は正確（中間オーバーフローの回帰）", () => {
    // node -e で検証済み: number の += で同じ額を11回足してから10回引くと、
    // 期中の部分和が Number.MAX_SAFE_INTEGER を超えた瞬間に浮動小数点の
    // 精度が失われ、最終値は Number.isSafeInteger を通過するにもかかわらず
    // 真値より2円少ない別の整数になる（998138113783385、真値は…387）。
    // directCostSubtotal を BigInt で積み上げていれば、この壊れ方自体が
    // 起きない。item は負の金額を許すので（支給材控除）、減算側もこの
    // 種別のまま表現できる。
    const quantity = 999_137;
    const unitPrice = 999_000_251;
    const trueAmount = 998_138_113_783_387;

    const positiveLines = Array.from({ length: 11 }, () =>
      line({ quantity, unitPrice }),
    );
    const negativeLines = Array.from({ length: 10 }, () =>
      line({ name: "支給材控除", quantity, unitPrice: -unitPrice }),
    );

    const totals = calcEstimate({
      lines: [...positiveLines, ...negativeLines],
      overheadRatePercent: 0,
    });

    expect(totals.directCostSubtotal).toBe(trueAmount);
  });
});
