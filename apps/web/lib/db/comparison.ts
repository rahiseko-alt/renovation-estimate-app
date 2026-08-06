// 比較表（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）の読み取り。
//
// 「1明細を各社がいくらで見たか」を並べ、明細ごとに1社だけ採る（排他）ための材料を
// 1回で組み立てる。画面はここだけを通す。
//
// **これは元請だけが見る値**（他社の単価が並ぶ）。下請の画面から呼ばない。
// 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う。

import { calcEstimate } from "../calc";
import type { EstimateTotals } from "../calc";
import { getOrCreateEstimate } from "./estimates";
import { listLineAdoptionsForProject } from "./lineAdoptions";
import { priceEstimate } from "./pricedEstimate";
import { listQuoteGroupResponsesForRequests } from "./quoteGroupResponses";
import { getSupabaseClient } from "./client";
import type { PersistedEstimateLine } from "./types";
import { isUuid } from "./uuid";

/** 比較表の1列（＝1社への依頼）。 */
export type ComparisonColumn = {
  requestId: string;
  companyName: string;
  status: string;
  /** 明細IDごとの原価単価。回答が無い明細は持たない。 */
  costUnitPriceByLineId: Record<string, number>;
};

/** 比較表の1行（＝1明細）。 */
export type ComparisonRow = {
  line: PersistedEstimateLine;
  /** この明細で採用している依頼のID。未採用なら null。 */
  adoptedRequestId: string | null;
};

export type Comparison = {
  rows: ComparisonRow[];
  columns: ComparisonColumn[];
  /**
   * いま採用しているぶんで出した合計。**この画面から出す見積書と同じ金額**
   * （どちらも lib/db/pricedEstimate.ts の priceEstimate を通る）。
   *
   * 採用が1件も無ければ、保存されている単価だけの合計になる。
   */
  adoptedTotals: EstimateTotals;
};

type RequestRow = {
  id: string;
  status: string;
  subcontractors: { company_name: string };
};

/**
 * 案件の比較表を組み立てる。
 * 呼び出し側で所有者確認を済ませた上で使う（他の lib/db/ の read 関数と同じ役割分担）。
 */
/** この案件のグループに属する、自分の依頼だけを集める。 */
async function listRequestRows(
  projectId: string,
  ownerId: string,
): Promise<RequestRow[]> {
  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(
      `
        id,
        status,
        subcontractors!inner ( company_name ),
        quote_request_groups!inner ( project_id )
      `,
    )
    .eq("owner_id", ownerId)
    .eq("quote_request_groups.project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as RequestRow[];
}

/** 明細も依頼も無いときの合計（0円）。型を満たすためだけの値を手で書かない。 */
function zeroTotals(): EstimateTotals {
  return calcEstimate({ lines: [], overheadRatePercent: 0 });
}

/**
 * 案件の比較表を組み立てる。
 * 呼び出し側で所有者確認を済ませた上で使う（他の lib/db/ の read 関数と同じ役割分担）。
 *
 * **社ごとに1件ずつ引かない。** 直列に待つのは3回（見積・採用・依頼一覧を同時に →
 * 回答 → 回答明細）。以前は社の数だけ回答を順に引いていて、3社で往復9回になり、
 * 本番の比較表が4〜6秒かかっていた（`docs/failures.md` 2026-08-06）。
 */
export async function getComparisonForProject(
  projectId: string,
  ownerId: string,
): Promise<Comparison> {
  // 案件IDが形として不正なら、DBに触らずに空を返す（従来どおり）。
  if (!isUuid(projectId)) {
    return { rows: [], columns: [], adoptedTotals: zeroTotals() };
  }

  const [estimate, adoptions, requestRows] = await Promise.all([
    getOrCreateEstimate(projectId),
    listLineAdoptionsForProject(projectId, ownerId),
    listRequestRows(projectId, ownerId),
  ]);

  const adoptedByLineId = new Map(
    adoptions.map((adoption) => [
      adoption.lineItemId,
      adoption.quoteGroupRequestId,
    ]),
  );

  const responses = await listQuoteGroupResponsesForRequests(
    requestRows.map((request) => request.id),
  );
  const responseByRequestId = new Map(
    responses.map((response) => [response.quoteGroupRequestId, response]),
  );

  const columns: ComparisonColumn[] = requestRows.map((request) => {
    const costUnitPriceByLineId: Record<string, number> = {};
    for (const line of responseByRequestId.get(request.id)?.lines ?? []) {
      costUnitPriceByLineId[line.lineItemId] = line.costUnitPrice;
    }
    return {
      requestId: request.id,
      companyName: request.subcontractors.company_name,
      status: request.status,
      costUnitPriceByLineId,
    };
  });

  // 採用した明細だけ、その社の原価単価を拾う。
  const adoptedCostUnitPriceByLineId = new Map<string, number>();
  for (const line of estimate.lines) {
    const requestId = adoptedByLineId.get(line.id);
    if (requestId === undefined) continue;
    const costUnitPrice =
      responseByRequestId.get(requestId)?.lines.find(
        (responseLine) => responseLine.lineItemId === line.id,
      )?.costUnitPrice;
    if (costUnitPrice !== undefined) {
      adoptedCostUnitPriceByLineId.set(line.id, costUnitPrice);
    }
  }

  return {
    rows: estimate.lines.map((line) => ({
      line,
      adoptedRequestId: adoptedByLineId.get(line.id) ?? null,
    })),
    columns,
    adoptedTotals: priceEstimate(estimate, adoptedCostUnitPriceByLineId).totals,
  };
}

/**
 * 明細ごとの最安値の依頼IDを返す（同額なら先に回答した社。並び順は columns の順）。
 * 「安い順に並べる」ことは design.md が決めていないので、**自動では採用しない**。
 * 画面が目印を出すためだけに使う。
 */
export function cheapestRequestIdByLineId(
  comparison: Comparison,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of comparison.rows) {
    let best: { requestId: string; price: number } | null = null;
    for (const column of comparison.columns) {
      const price = column.costUnitPriceByLineId[row.line.id];
      if (price === undefined) continue;
      if (best === null || price < best.price) {
        best = { requestId: column.requestId, price };
      }
    }
    if (best) result[row.line.id] = best.requestId;
  }
  return result;
}
