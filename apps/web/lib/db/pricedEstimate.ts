// 「採用した下請の単価を重ねた見積」を組み立てる。
//
// **見積書PDFはここを通す。** `estimates` テーブルに保存されている単価は、元請が
// 見積エディタで手入力したぶんだけで、比較表で採用した下請の単価は入っていない
// （採用は `line_adoptions` に別で持つ。`docs/design.md` 7章
// 「取り込みは『追加』ではなく『採用』にする」）。保存値だけを見ると、
// 比較表に各社の単価が並んでいるのに見積書は全行0円になる。実際にそうなっていた。
//
// 採用した単価を `estimates` に書き戻す方式は採らない。採用の取り消し・採り直し・
// 下請の回答の訂正が入るたびに整合を自前で持つことになり、ずれたときに
// どちらが正か分からなくなる。**採用が正**として、読むたびに重ねる。

import { ADOPTED_MARKUP_RATE, calcEstimate, sellingUnitPrice } from "../calc";
import type { EstimateTotals } from "../calc";
import { getOrCreateEstimate } from "./estimates";
import { listLineAdoptionsForProject } from "./lineAdoptions";
import { listQuoteGroupResponsesForRequests } from "./quoteGroupResponses";
import type { Estimate, PersistedEstimateLine } from "./types";

export type PricedEstimate = {
  /** 保存されている見積そのもの（諸経費率・税区分をここから取る）。 */
  estimate: Estimate;
  /** 採用した単価を重ねた明細。採用が無い明細は保存された単価のまま。 */
  lines: PersistedEstimateLine[];
  totals: EstimateTotals;
};

/**
 * 採用した原価単価を明細に重ねて、合計まで出す。**DBに触らない。**
 *
 * 比較表（`lib/db/comparison.ts`）と見積書（`app/projects/[id]/pdf-actions.ts`）が
 * 同じ金額を出すために、計算そのものはこの1関数に閉じる。片方だけ直すと、
 * 画面に出ている合計と、その場で出した見積書の合計が食い違う。
 *
 * @param adoptedCostUnitPriceByLineId 明細ID → 採用した社の原価単価。
 *   採用していない明細は持たない（保存された単価をそのまま使う）。
 */
export function priceEstimate(
  estimate: Estimate,
  adoptedCostUnitPriceByLineId: ReadonlyMap<string, number>,
): PricedEstimate {
  const lines = estimate.lines.map((line) => {
    const costUnitPrice = adoptedCostUnitPriceByLineId.get(line.id);
    if (costUnitPrice === undefined) return line;
    return {
      ...line,
      unitPrice: sellingUnitPrice(costUnitPrice, ADOPTED_MARKUP_RATE),
    };
  });

  return {
    estimate,
    lines,
    totals: calcEstimate({
      lines,
      overheadRatePercent: estimate.overheadRatePercent,
      overheadTaxCategory: estimate.overheadTaxCategory,
    }),
  };
}

/**
 * 案件の見積を、採用した単価を重ねた状態で読む。
 *
 * 所有者確認は呼び出し側（Server Action・ページ）が済ませた上で使う
 * （lib/db/ の他の read 関数と同じ役割分担）。採用の絞り込みには ownerId を
 * 使うので、他人の採用が重なることはない。
 *
 * 直列に待つのは最大3回（見積と採用を同時に → 回答 → 回答明細）。
 * 本番は往復1回が0.5秒前後かかるので、ここを1件ずつ引く形に戻さないこと。
 */
export async function getPricedEstimate(
  projectId: string,
  ownerId: string,
): Promise<PricedEstimate> {
  const [estimate, adoptions] = await Promise.all([
    getOrCreateEstimate(projectId),
    listLineAdoptionsForProject(projectId, ownerId),
  ]);

  if (adoptions.length === 0) {
    return priceEstimate(estimate, new Map());
  }

  const responses = await listQuoteGroupResponsesForRequests([
    ...new Set(adoptions.map((adoption) => adoption.quoteGroupRequestId)),
  ]);

  // 依頼ID → その社が明細ごとに付けた原価単価。
  const costByRequestAndLine = new Map<string, Map<string, number>>();
  for (const response of responses) {
    costByRequestAndLine.set(
      response.quoteGroupRequestId,
      new Map(response.lines.map((line) => [line.lineItemId, line.costUnitPrice])),
    );
  }

  const adoptedCostUnitPriceByLineId = new Map<string, number>();
  for (const adoption of adoptions) {
    const costUnitPrice = costByRequestAndLine
      .get(adoption.quoteGroupRequestId)
      ?.get(adoption.lineItemId);
    // 採用した社が、その明細に単価を付けていない場合がありうる（回答の対象範囲が
    // 採用より狭い等）。その明細は保存された単価のままにする。
    if (costUnitPrice !== undefined) {
      adoptedCostUnitPriceByLineId.set(adoption.lineItemId, costUnitPrice);
    }
  }

  return priceEstimate(estimate, adoptedCostUnitPriceByLineId);
}
