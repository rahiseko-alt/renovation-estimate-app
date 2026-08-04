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
 * 整数の金額に小数の係数（数量・掛率など）を掛けて、円未満を切り捨てる（0方向）。
 *
 * 桁数に決まりの無い小数を浮動小数点のまま掛けると、真値からのズレが
 * 値の大きさに比例して大きくなる。単純な丸め誤差の吸収（許容幅を設けて
 * 近い整数に寄せる方式）では、この「ズレ」と「本物の細かい端数」が
 * 原理的に区別できない。実際に、数量が大きいときに本物の端数を誤って
 * 動かす例が見つかった（1円だけの違いだが、金額計算で「だいたい合ってる」は
 * 許されない）。
 *
 * 係数を固定精度の整数（factorScale 倍）に丸めてから BigInt の整数演算で
 * 正確に計算することで、この種の誤差を構造的に無くす。
 *
 * @param integerAmount 円の整数金額
 * @param decimalFactor 掛ける小数
 * @param factorScale 係数をこの倍数で固定精度の整数にする（例: 1000 なら 1/1000 単位まで）
 */
function exactMultiplyTrunc(
  integerAmount: number,
  decimalFactor: number,
  factorScale: number,
): number {
  const scaledFactor = Math.round(decimalFactor * factorScale);
  const exact = BigInt(integerAmount) * BigInt(scaledFactor);
  return Number(exact / BigInt(factorScale));
}

/**
 * 整数の金額にパーセントの率を掛けて、円未満を切り捨てる（0方向）。
 * exactMultiplyTrunc と同じ理由で BigInt を使う。÷100 も一緒に畳み込む。
 */
function exactPercentTrunc(
  integerAmount: number,
  ratePercent: number,
  precisionScale: number,
): number {
  const scaledRate = Math.round(ratePercent * precisionScale);
  const exact = BigInt(integerAmount) * BigInt(scaledRate);
  return Number(exact / (100n * BigInt(precisionScale)));
}

function assertFiniteNumber(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label}が数値ではありません: ${value}`);
  }
}

function assertIntegerAmount(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `${label}が整数ではありません（金額は円単位の整数で持つ）: ${value}`,
    );
  }
}

/**
 * 計算結果が安全整数（Number.isSafeInteger）に収まっているかを確かめる。
 *
 * BigInt で正確に計算しても、最後に number へ戻す時点で
 * Number.MAX_SAFE_INTEGER（約 900兆）を超えていれば、その number 自体が
 * 別の整数に化ける。個々の入力（数量・単価など）に上限を設けていても、
 * 何行分も積み上げた小計・税額・合計はその上限だけでは超えない保証が
 * 無いため、集計のたびにここで確かめる。
 */
function assertSafeAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${label}が扱える範囲を超えました: ${value}。入力を見直してください。`,
    );
  }
}

/**
 * BigInt で積み上げた金額を、安全整数の範囲を確かめてから number に変換する。
 *
 * number の `+=` で複数行を積み上げると、行数が多いときに「期中の部分和が
 * Number.MAX_SAFE_INTEGER を超えてから、後続の減算で範囲内に戻る」場合が
 * ありうる。この瞬間に浮動小数点の精度が失われ、最終値だけ
 * Number.isSafeInteger で確かめても「安全に見えるが実は違う整数」を
 * 見逃す（最終値が範囲内に収まっているため）。BigInt は多倍長の整数演算
 * なので、この種の中間オーバーフローが原理的に起きない。積み上げが終わった
 * 後、number へ変換する直前に一度だけ範囲を確かめることで、変換自体が
 * 別の整数を返すことも防ぐ。
 */
function bigIntToSafeAmount(value: bigint, label: string): number {
  if (
    value < BigInt(Number.MIN_SAFE_INTEGER) ||
    value > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new RangeError(
      `${label}が扱える範囲を超えました: ${value}。入力を見直してください。`,
    );
  }
  return Number(value);
}

/**
 * 数量として扱う最大の大きさ。exactMultiplyTrunc が数量を固定精度の整数
 * （quantity × QUANTITY_SCALE）に変換する処理が、浮動小数点の精度内で
 * 正確に行える前提にしている。㎡・m・人工といった実務の数量がこの上限を
 * 超えることは無い。
 */
const MAX_QUANTITY_MAGNITUDE = 1_000_000;
/** 数量の最小刻み（1/1000）。㎡・m・人工の実務でこれより細かい数量は無い。 */
const QUANTITY_SCALE = 1_000;

function assertValidQuantity(quantity: number, label: string): void {
  assertFiniteNumber(quantity, label);
  if (Math.abs(quantity) > MAX_QUANTITY_MAGNITUDE) {
    throw new RangeError(
      `${label}が大きすぎます: ${quantity}（上限 ${MAX_QUANTITY_MAGNITUDE}）`,
    );
  }
}

/** 諸経費率として扱う最大の大きさ。理由は MAX_QUANTITY_MAGNITUDE と同じ。 */
const MAX_OVERHEAD_RATE_PERCENT = 100_000;
/** 諸経費率の最小刻み（1/1000 パーセントポイント）。 */
const OVERHEAD_RATE_SCALE = 1_000;

/** 掛率として扱う最大の大きさ。理由は MAX_QUANTITY_MAGNITUDE と同じ。 */
const MAX_MARKUP_RATE = 1_000_000;
/** 掛率の最小刻み（1/10,000）。 */
const MARKUP_RATE_SCALE = 10_000;

/** 消費税率の最小刻み。TAX_RATES は自分たちで決めた定数なので上限検証は不要。 */
const TAX_RATE_SCALE = 100_000;

/**
 * 単価として扱う最大の大きさ。
 * これと MAX_QUANTITY_MAGNITUDE を掛けた最大値（10^15）が
 * Number.MAX_SAFE_INTEGER（約900兆）の1割程度に収まるよう選んでいる。
 * 輸入石材や特注一式のような高額品でも、この上限（10億円/単位）を
 * 超える単価は実務で無い。
 */
const MAX_UNIT_PRICE = 1_000_000_000;

function assertValidUnitPrice(value: number, label: string): void {
  assertIntegerAmount(value, label);
  if (Math.abs(value) > MAX_UNIT_PRICE) {
    throw new RangeError(
      `${label}が大きすぎます: ${value}（上限 ${MAX_UNIT_PRICE}）`,
    );
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

  assertValidQuantity(line.quantity, `${at}の数量`);
  assertValidUnitPrice(line.unitPrice, `${at}の単価`);
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
  assertValidQuantity(line.quantity, "数量");
  assertValidUnitPrice(line.unitPrice, "単価");
  const amount = exactMultiplyTrunc(line.unitPrice, line.quantity, QUANTITY_SCALE);
  assertSafeAmount(amount, "明細の金額");
  return amount;
}

/**
 * 税区分ごとに対価の額を積む入れ物を作る。
 * 複数行にまたがって積み上げるので BigInt で持つ（bigIntToSafeAmount 参照）。
 */
function emptyTaxableMap(): Record<TaxCategory, bigint> {
  return { standard: 0n, reduced: 0n, exempt: 0n };
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
  if (input.overheadRatePercent > MAX_OVERHEAD_RATE_PERCENT) {
    throw new RangeError(
      `諸経費率が大きすぎます: ${input.overheadRatePercent}（上限 ${MAX_OVERHEAD_RATE_PERCENT}）`,
    );
  }
  input.lines.forEach(assertValidLine);

  const overheadTaxCategory = input.overheadTaxCategory ?? "standard";
  if (!(overheadTaxCategory in TAX_RATES)) {
    throw new RangeError(`諸経費の税区分が不正です: ${overheadTaxCategory}`);
  }

  const taxable = emptyTaxableMap();

  // 1. 直接工事費 小計
  // ループの途中は BigInt のまま積み上げる（理由は bigIntToSafeAmount 参照）。
  let directCostSubtotalRaw = 0n;
  for (const line of input.lines) {
    if (line.kind !== "item") continue;
    const amount = lineAmount(line);
    directCostSubtotalRaw += BigInt(amount);
    taxable[line.taxCategory] += BigInt(amount);
  }
  const directCostSubtotal = bigIntToSafeAmount(
    directCostSubtotalRaw,
    "直接工事費 小計",
  );

  // 2. 諸経費（直接工事費 小計に対する率）
  const overheadAmount = exactPercentTrunc(
    directCostSubtotal,
    input.overheadRatePercent,
    OVERHEAD_RATE_SCALE,
  );
  assertSafeAmount(overheadAmount, "諸経費");
  taxable[overheadTaxCategory] += BigInt(overheadAmount);

  const subtotalBeforeDiscount = directCostSubtotal + overheadAmount;
  assertSafeAmount(subtotalBeforeDiscount, "値引き前の小計");

  // 3. 値引き（税抜きの段階で引く）
  let discountAmountRaw = 0n;
  for (const line of input.lines) {
    if (line.kind !== "discount") continue;
    const amount = lineAmount(line);
    discountAmountRaw += BigInt(amount);
    taxable[line.taxCategory] += BigInt(amount);
  }
  const discountAmount = bigIntToSafeAmount(discountAmountRaw, "値引き合計");

  // 4. 工事価格（税抜き）
  const netAmount = subtotalBeforeDiscount + discountAmount;
  assertSafeAmount(netAmount, "工事価格（税抜き）");

  // 5. 取引に係る消費税等（税区分ごとに1回だけ端数処理）
  const taxBreakdown: TaxBreakdown[] = [];
  let taxAmountRaw = 0n;
  for (const category of TAX_CATEGORY_ORDER) {
    const taxableAmountRaw = taxable[category];
    if (taxableAmountRaw === 0n) continue;
    const taxableAmount = bigIntToSafeAmount(
      taxableAmountRaw,
      `${category}税率の対価の額`,
    );
    const rate = TAX_RATES[category];
    const categoryTax = exactMultiplyTrunc(taxableAmount, rate, TAX_RATE_SCALE);
    assertSafeAmount(categoryTax, `${category}税率の消費税額`);
    taxBreakdown.push({ category, rate, taxableAmount, taxAmount: categoryTax });
    taxAmountRaw += BigInt(categoryTax);
  }
  const taxAmount = bigIntToSafeAmount(taxAmountRaw, "取引に係る消費税等");

  // 6. 合計（税込）
  const grandTotal = netAmount + taxAmount;
  assertSafeAmount(grandTotal, "合計（税込）");

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
  assertValidUnitPrice(costUnitPrice, "原価単価");
  assertFiniteNumber(markupRate, "掛率");
  if (markupRate < 0) {
    throw new RangeError(`掛率が負の数です: ${markupRate}`);
  }
  if (markupRate > MAX_MARKUP_RATE) {
    throw new RangeError(
      `掛率が大きすぎます: ${markupRate}（上限 ${MAX_MARKUP_RATE}）`,
    );
  }
  const amount = exactMultiplyTrunc(costUnitPrice, markupRate, MARKUP_RATE_SCALE);
  assertSafeAmount(amount, "売価単価");
  return amount;
}

/** 金額を画面・PDF に出すときの表記（3桁区切り）。 */
export function formatYen(amount: number): string {
  assertFiniteNumber(amount, "金額");
  return amount.toLocaleString("ja-JP");
}
