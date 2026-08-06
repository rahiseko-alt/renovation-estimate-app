// 比較表の下に出す「いま採用しているぶんの合計」。
//
// **この画面から出す見積書と必ず同じ金額**（どちらも lib/db/pricedEstimate.ts の
// priceEstimate を通る）。見積書を押す前に金額が見えること自体が体感になる。
//
// 同時に、**外から「0円のまま書類が出る」状態を見つけられる唯一の場所**でもある
// （PDFのバイト列から金額は読めない。docs/failures.md 2026-08-06）。
// scripts/prod-demo-check.sh と e2e/demo-three-taps.spec.ts が
// COMPARISON_TEXT.adoptedTotalLabel を目印にこの区画を探す。

import type { EstimateTotals } from "../lib/calc";
import { formatYen } from "../lib/calc";
import { COMPARISON_TEXT } from "../lib/content";

export function AdoptedTotal({ totals }: { totals: EstimateTotals }) {
  return (
    <section
      aria-label={COMPARISON_TEXT.adoptedTotalLabel}
      className="mt-6 rounded border border-gray-300 p-4"
    >
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-gray-700">{COMPARISON_TEXT.adoptedTotalLabel}</span>
        {/*
          金額と「円」を1つの文字列にして描く。分けて書くと React が間に
          コメントノードを挟み、外から金額を読む検査が数字と単位を別々に拾う。
          ComparisonTable の単価も同じ書き方。
        */}
        <span className="text-2xl font-bold">
          {`${formatYen(totals.grandTotal)}円`}
        </span>
      </p>
      <p className="mt-1 text-sm text-gray-700">
        {COMPARISON_TEXT.adoptedTotalNote}
      </p>
    </section>
  );
}
