// D8 見積もり書類（1社ずつ）の、**書類として読む部分**
// （docs/flows.md「デモの画面の並び」D8）。
//
// 実機で「詳細画面が詳細じゃない。もっとリアルな情報が無いと意味がない」と言われて
// 足したもの（利用者の指摘 2026-08-07）。何を載せるかは推論で決めていない。
// 国交省の見積書様式例と、経路の異なる6団体の実物で一致した欄だけを出す
// （一次情報とその出典は `docs/design.md` 3章
// 「下請の見積書の鑑（表紙）と内訳（2026-08-07）」）。
//
// **ボタン・リンク・遷移をここに置かない。** D8 に出てよい操作は明細ごとの
// 採用・保留（components/QuoteDocumentLines.tsx）と「一覧へ」（ページ側）だけで、
// 表に無いものを足さないことが利用者との約束である。
//
// 印字される文字はテンプレート（lib/doc/templates/subcontractor-quote.ts）が持ち、
// 画面の出し方（未入力の書き方）は lib/flowText.ts が持つ。**この部品は描画器**
// なので両方を知ってよい（docs/design.md 7章「文言の住所を1つに決める規則」）。

import { formatYen } from "../lib/calc";
import type { EstimateTotals } from "../lib/calc";
import { QUOTE_DOCUMENT_TEXT, TAX_RATES } from "../lib/content";
import type { QuoteDocumentCover } from "../lib/db/quoteDocuments";
import type { QuoteResponseCostBreakdown } from "../lib/db/types";
import { formatDateJst } from "../lib/doc/date";
import {
  SUBCONTRACTOR_QUOTE_LEGAL_NOTICE,
  SUBCONTRACTOR_QUOTE_TEXT as TEXT,
} from "../lib/doc/templates/subcontractor-quote";

/** 「ラベル：値」の1行。書類の欄はすべてこの形で出す。 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 border-b border-gray-300 py-2">
      <dt className="w-40 shrink-0 text-gray-700">{label}</dt>
      <dd className="grow font-bold">{value}</dd>
    </div>
  );
}

/**
 * 金額の1行。**未入力（null）は「0円」にしない**（QUOTE_DOCUMENT_TEXT.notEntered）。
 * 内訳明示は努力義務で、書かずに返す社がある。
 */
function amountText(amount: number | null): string {
  return amount === null
    ? QUOTE_DOCUMENT_TEXT.notEntered
    : `${formatYen(amount)}円`;
}

/** 税率（%）。区分は明細から出た区分をそのまま使い、無ければ標準税率。 */
function taxRatePercent(totals: EstimateTotals): number {
  const rate = totals.taxBreakdown[0]?.rate ?? TAX_RATES.standard;
  // 0.1 * 100 は浮動小数点で 10 にならない。表示前に丸める。
  return Math.round(rate * 1000) / 10;
}

/** 鑑（表紙）。宛先・工事・金額まで。 */
export function QuoteCoverSheet({
  cover,
  totals,
}: {
  cover: QuoteDocumentCover;
  totals: EstimateTotals;
}) {
  return (
    <section className="mt-6 rounded border-2 border-gray-400 p-4">
      <p className="tabular text-right text-gray-700">
        {`${TEXT.quoteNumberLabel} ${cover.quoteNumber}`}
      </p>
      <p className="tabular text-right text-gray-700">
        {`${TEXT.issuedAtLabel} ${formatDateJst(cover.issuedAt)}`}
      </p>

      <h2 className="mt-3 text-center text-xl font-bold tracking-widest">
        {TEXT.title}
      </h2>

      <p className="mt-4 text-lg font-bold">
        {cover.recipientName
          ? `${cover.recipientName} ${TEXT.recipientSuffix}`
          : TEXT.recipientUnset}
      </p>

      <div className="mt-4 rounded bg-gray-100 p-3">
        <h3 className="font-bold">{TEXT.issuerHeading}</h3>
        <p className="mt-1 text-lg font-bold">{cover.issuer.companyName}</p>
        <dl className="mt-1">
          <Field label={TEXT.issuerAddressLabel} value={cover.issuer.address} />
          <Field label={TEXT.issuerTelLabel} value={cover.issuer.tel} />
          <Field
            label={TEXT.issuerContactLabel}
            value={cover.issuer.contactName}
          />
          <Field label={TEXT.issuerEmailLabel} value={cover.issuer.email} />
        </dl>
      </div>

      <dl className="mt-4">
        <Field label={TEXT.workNameLabel} value={cover.workName} />
        <Field label={TEXT.workPlaceLabel} value={cover.workPlace} />
        <Field
          label={TEXT.workPeriodLabel}
          value={TEXT.workPeriodValue(
            formatDateJst(cover.workPeriodStart),
            formatDateJst(cover.workPeriodEnd),
          )}
        />
        <Field
          label={TEXT.validUntilLabel}
          value={formatDateJst(cover.validUntil)}
        />
        <Field label={TEXT.paymentTermsLabel} value={cover.paymentTerms} />
        <Field label={TEXT.deliveryPlaceLabel} value={cover.deliveryPlace} />
      </dl>

      <dl className="tabular mt-4">
        <Field
          label={TEXT.netAmountLabel}
          value={`${formatYen(totals.netAmount)}円`}
        />
        <Field
          label={TEXT.taxRateLabel}
          value={TEXT.taxRateValue(taxRatePercent(totals))}
        />
        <Field
          label={TEXT.taxAmountLabel}
          value={`${formatYen(totals.taxAmount)}円`}
        />
      </dl>
      <p className="tabular mt-3 flex flex-wrap items-baseline justify-between gap-x-3 rounded bg-gray-800 px-3 py-3 text-white">
        <span className="font-bold">{TEXT.grandTotalLabel}</span>
        <span className="text-xl font-bold">
          {`${formatYen(totals.grandTotal)}円`}
        </span>
      </p>

      <p className="mt-4">{TEXT.closing}</p>
    </section>
  );
}

/**
 * 内訳明示（建設業法第20条第1項の記載事項）と、様式に印字される法令の注意文。
 *
 * **5経費の直後に注意文を置く。** 原文が「上記５つの経費の額について」で始まるため、
 * 間に別のものを挟むと「上記」が何を指すか読めなくなる。
 */
export function QuoteBreakdownSheet({
  breakdown,
}: {
  breakdown: QuoteResponseCostBreakdown | null;
}) {
  const rows: Array<[string, string]> = [
    [TEXT.materialCostLabel, amountText(breakdown?.materialCost ?? null)],
    [TEXT.laborCostLabel, amountText(breakdown?.laborCost ?? null)],
    [
      TEXT.legalWelfareCostLabel,
      amountText(breakdown?.legalWelfareCost ?? null),
    ],
    [TEXT.safetyHealthCostLabel, amountText(breakdown?.safetyHealthCost ?? null)],
    [
      TEXT.retirementMutualAidCostLabel,
      amountText(breakdown?.retirementMutualAidCost ?? null),
    ],
  ];
  const workDays = breakdown?.workDays ?? null;

  return (
    <section className="mt-6 rounded border-2 border-gray-400 p-4">
      <h2 className="text-lg font-bold">{TEXT.breakdownHeading}</h2>
      <dl className="tabular mt-2">
        {rows.map(([label, value]) => (
          <Field key={label} label={label} value={value} />
        ))}
        <Field
          label={TEXT.workDaysLabel}
          value={
            workDays === null
              ? QUOTE_DOCUMENT_TEXT.notEntered
              : TEXT.workDaysValue(workDays)
          }
        />
        <Field
          label={TEXT.materialSuppliedLabel}
          value={breakdown?.materialSuppliedNote || TEXT.materialSuppliedNone}
        />
      </dl>

      {SUBCONTRACTOR_QUOTE_LEGAL_NOTICE.map((line) => (
        <p key={line} className="mt-3 text-sm text-gray-700">
          {line}
        </p>
      ))}
    </section>
  );
}
