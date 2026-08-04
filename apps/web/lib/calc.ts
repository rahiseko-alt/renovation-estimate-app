// 見積の金額計算。画面・PDF・API は必ずここを通す
// （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
//
// 計算順序は住宅リフォーム推進協議会の見積書様式に合わせて固定している。
//   明細 → 直接工事費 小計 → 諸経費 → 値引き → 工事価格（税抜き）
//        → 取引に係る消費税等 → 合計（税込）
//
// 金額はすべて整数（円）で持つ。浮動小数点で金額を保持しない。

import { TAX_RATES } from "./content";

export type TaxCategory = keyof typeof TAX_RATES;

/**
 * 明細行の種別。金額を減らす行が2種類あり、引く段階が違うので取り違えない。
 *
 * - `item`   … 直接工事費。負の金額も許す。支給材の控除のように
 *              「工事そのものが減る」場合はこちら。諸経費の算定基礎も一緒に減る。
 * - `discount` … 出精値引きなど、諸経費まで含めた総額から引くもの。
 *              直接工事費の小計には入れず、諸経費を足した後に引く。
 *              専用の欄は作らず、負の金額を持つ行として表す。
 */
export type LineKind = "item" | "discount";

/** 種別の一覧。実行時の検証にも使うので1箇所に持つ。 */
const LINE_KINDS: readonly LineKind[] = ["item", "discount"];

export type EstimateLine = {
  kind: LineKind;
  /** 工事項目。 */
  name: string;
  /** 摘要（仕様）。 */
  spec: string;
  /** 数量。小数を許す（3.5 ㎡ など）。 */
  quantity: number;
  /** 単位。 */
  unit: string;
  /** 単価（円・整数）。リフォームでは材工共の複合単価が基本。 */
  unitPrice: number;
  taxCategory: TaxCategory;
};

export type EstimateInput = {
  lines: EstimateLine[];
  /**
   * 諸経費率（%）。既定値は持たない。
   * 調査した出典では 5〜10% / 8〜22% / 30%超 と割れており、業界標準の率が存在しないため、
   * 案件ごとに人が入れる。
   */
  overheadRatePercent: number;
  /** 諸経費の税区分。指定しなければ標準税率。 */
  overheadTaxCategory?: TaxCategory;
};

export type TaxBreakdown = {
  category: TaxCategory;
  /** 税率（0.1 など）。 */
  rate: number;
  /** 税率ごとに区分した対価の額（税抜き）。 */
  taxableAmount: number;
  /** 税率ごとに区分した消費税額等。 */
  taxAmount: number;
};

export type EstimateTotals = {
  /** 直接工事費 小計（kind="item" の合計）。 */
  directCostSubtotal: number;
  /** 諸経費。 */
  overheadAmount: number;
  /** 値引き前の小計（直接工事費 小計 + 諸経費）。 */
  subtotalBeforeDiscount: number;
  /** 値引き合計。値引きが無ければ 0、あれば負の数。 */
  discountAmount: number;
  /** 工事価格（税抜き）。 */
  netAmount: number;
  /** 税率ごとの内訳。対価の額が 0 の区分は含めない。 */
  taxBreakdown: TaxBreakdown[];
  /** 取引に係る消費税等。 */
  taxAmount: number;
  /** 合計（税込）。 */
  grandTotal: number;
};

/** 税区分の並び順。内訳の表示順を固定するために使う。 */
const TAX_CATEGORY_ORDER: readonly TaxCategory[] = [
  "standard",
  "reduced",
  "exempt",
];

/**
 * 浮動小数点の表現誤差だけを飲み込むための許容幅（ULP＝最小単位の個数）。
 *
 * 例えば 1.4 * 1400 は真値 1960 のはずが JS では 1959.9999999999998 になる。
 * この手のノイズは真値から 1 ULP（Number.EPSILON × 値の大きさ）程度しか
 * 離れない。8 ULP という余裕を持たせても、本物の小数の端数
 * （例えば 1.9999996 円のように、実際にその値である場合）は 1 の位から見て
 * 桁違いに離れているので誤って動かさない。固定の桁数で丸める方式
 * （1/1,000,000 円で丸める等）だと、本物の細かい端数まで動かしてしまう
 * ことが指摘されたため、値の大きさに比例する許容幅に直した。
 */
const FLOAT_NOISE_TOLERANCE_ULPS = 8;

/**
 * 浮動小数点の掛け算が生んだノイズで、値がすぐ隣の整数から
 * 許容幅の範囲内にずれているだけなら、その整数に寄せる。
 * 本物の端数（許容幅より大きく離れている）はそのまま返す。
 */
function snapToIntegerIfFloatNoise(value: number): number {
  const nearestInteger = Math.round(value);
  const tolerance =
    FLOAT_NOISE_TOLERANCE_ULPS *
    Number.EPSILON *
    Math.max(Math.abs(value), 1);
  return Math.abs(value - nearestInteger) <= tolerance
    ? nearestInteger
    : value;
}

/**
 * 円未満を切り捨てる。負の値は絶対値で切り捨てる（0 方向）。
 * 値引き行で -1.5 を -2 にしてしまうと値引き額が勝手に増えるため、
 * Math.floor ではなく Math.trunc を使う。
 */
function yen(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`金額が数値になりません: ${value}`);
  }
  return Math.trunc(snapToIntegerIfFloatNoise(value));
}

function assertFiniteNumber(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label}が数値ではありません: ${value}`);
  }
}

function assertValidLine(line: EstimateLine, index: number): void {
  const at = `${index + 1}行目`;

  // 種別を先に見る。知らない種別を黙って無視すると、その行が合計から
  // 静かに消えて、誰も気付けないまま金額が狂う。
  if (!LINE_KINDS.includes(line.kind)) {
    throw new RangeError(
      `${at}の種別が不正です: ${line.kind}（${LINE_KINDS.join(" / ")} のどちらか）`,
    );
  }

  assertFiniteNumber(line.quantity, `${at}の数量`);
  assertFiniteNumber(line.unitPrice, `${at}の単価`);
  if (!Number.isInteger(line.unitPrice)) {
    throw new RangeError(
      `${at}の単価が整数ではありません（金額は円単位の整数で持つ）: ${line.unitPrice}`,
    );
  }
  if (!(line.taxCategory in TAX_RATES)) {
    throw new RangeError(`${at}の税区分が不正です: ${line.taxCategory}`);
  }

  // 値引き行が正の金額だと、値引きなのに工事価格が増える。
  // 数量と単価の両方が負でも金額は正になるので、掛けた後の金額で見る。
  if (line.kind === "discount" && lineAmount(line) > 0) {
    throw new RangeError(
      `${at}は値引き行なのに金額が正です: ${lineAmount(line)}円。` +
        `金額を増やすなら種別を item にしてください。`,
    );
  }
}

/**
 * 明細1行の金額。数量 × 単価を円未満切り捨て。
 * 画面もPDFもこの関数を通す。行の金額を各所で掛け算し直さない。
 */
export function lineAmount(line: EstimateLine): number {
  assertFiniteNumber(line.quantity, "数量");
  assertFiniteNumber(line.unitPrice, "単価");
  return yen(line.quantity * line.unitPrice);
}

/** 税区分ごとに対価の額を積む入れ物を作る。 */
function emptyTaxableMap(): Record<TaxCategory, number> {
  return { standard: 0, reduced: 0, exempt: 0 };
}

/**
 * 見積の合計を出す。
 *
 * 端数処理の決めごと:
 * - 明細金額は行ごとに円未満切り捨て
 * - 諸経費は直接工事費 小計に率を掛けて円未満切り捨て
 * - 消費税は税区分ごとに対価の額を積み上げてから1回だけ切り捨てる
 *   （行ごとに税額を出して足し込まない）
 */
export function calcEstimate(input: EstimateInput): EstimateTotals {
  assertFiniteNumber(input.overheadRatePercent, "諸経費率");
  if (input.overheadRatePercent < 0) {
    throw new RangeError(
      `諸経費率が負の数です: ${input.overheadRatePercent}。値引きは値引き行で表してください。`,
    );
  }
  input.lines.forEach(assertValidLine);

  const overheadTaxCategory = input.overheadTaxCategory ?? "standard";
  if (!(overheadTaxCategory in TAX_RATES)) {
    throw new RangeError(`諸経費の税区分が不正です: ${overheadTaxCategory}`);
  }

  const taxable = emptyTaxableMap();

  // 1. 直接工事費 小計
  let directCostSubtotal = 0;
  for (const line of input.lines) {
    if (line.kind !== "item") continue;
    const amount = lineAmount(line);
    directCostSubtotal += amount;
    taxable[line.taxCategory] += amount;
  }

  // 2. 諸経費（直接工事費 小計に対する率）
  const overheadAmount = yen(
    (directCostSubtotal * input.overheadRatePercent) / 100,
  );
  taxable[overheadTaxCategory] += overheadAmount;

  const subtotalBeforeDiscount = directCostSubtotal + overheadAmount;

  // 3. 値引き（税抜きの段階で引く）
  let discountAmount = 0;
  for (const line of input.lines) {
    if (line.kind !== "discount") continue;
    const amount = lineAmount(line);
    discountAmount += amount;
    taxable[line.taxCategory] += amount;
  }

  // 4. 工事価格（税抜き）
  const netAmount = subtotalBeforeDiscount + discountAmount;

  // 5. 取引に係る消費税等（税区分ごとに1回だけ端数処理）
  const taxBreakdown: TaxBreakdown[] = [];
  let taxAmount = 0;
  for (const category of TAX_CATEGORY_ORDER) {
    const taxableAmount = taxable[category];
    if (taxableAmount === 0) continue;
    const rate = TAX_RATES[category];
    const categoryTax = yen(taxableAmount * rate);
    taxBreakdown.push({ category, rate, taxableAmount, taxAmount: categoryTax });
    taxAmount += categoryTax;
  }

  // 6. 合計（税込）
  const grandTotal = netAmount + taxAmount;

  return {
    directCostSubtotal,
    overheadAmount,
    subtotalBeforeDiscount,
    discountAmount,
    netAmount,
    taxBreakdown,
    taxAmount,
    grandTotal,
  };
}

/**
 * 原価に掛率をかけて売価の単価を出す。
 * 下請から返ってきた単価（原価）を見積に取り込むときに使う。
 * 単価は円未満切り捨てで整数にする（金額を小数で持たないため）。
 */
export function sellingUnitPrice(
  costUnitPrice: number,
  markupRate: number,
): number {
  assertFiniteNumber(costUnitPrice, "原価単価");
  assertFiniteNumber(markupRate, "掛率");
  if (markupRate < 0) {
    throw new RangeError(`掛率が負の数です: ${markupRate}`);
  }
  return yen(costUnitPrice * markupRate);
}

/** 金額を画面・PDF に出すときの表記（3桁区切り）。 */
export function formatYen(amount: number): string {
  assertFiniteNumber(amount, "金額");
  return amount.toLocaleString("ja-JP");
}
