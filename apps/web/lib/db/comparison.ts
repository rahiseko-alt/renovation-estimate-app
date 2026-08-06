// 比較表（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）の読み取り。
//
// 「1明細を各社がいくらで見たか」を並べ、明細ごとに1社だけ採る（排他）ための材料を
// 1回で組み立てる。画面はここだけを通す。
//
// **これは元請だけが見る値**（他社の単価が並ぶ）。下請の画面から呼ばない。
// 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う。

import { getOrCreateEstimate } from "./estimates";
import { listLineAdoptionsForProject } from "./lineAdoptions";
import { getQuoteGroupResponseForRequest } from "./quoteGroupResponses";
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
export async function getComparisonForProject(
  projectId: string,
  ownerId: string,
): Promise<Comparison> {
  if (!isUuid(projectId)) return { rows: [], columns: [] };

  const estimate = await getOrCreateEstimate(projectId);
  const adoptions = await listLineAdoptionsForProject(projectId, ownerId);
  const adoptedByLineId = new Map(
    adoptions.map((adoption) => [
      adoption.lineItemId,
      adoption.quoteGroupRequestId,
    ]),
  );

  // この案件のグループに属する、自分の依頼だけを集める。
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

  const requestRows = data as unknown as RequestRow[];
  const columns: ComparisonColumn[] = [];
  for (const request of requestRows) {
    const response = await getQuoteGroupResponseForRequest(request.id);
    const costUnitPriceByLineId: Record<string, number> = {};
    for (const line of response?.lines ?? []) {
      costUnitPriceByLineId[line.lineItemId] = line.costUnitPrice;
    }
    columns.push({
      requestId: request.id,
      companyName: request.subcontractors.company_name,
      status: request.status,
      costUnitPriceByLineId,
    });
  }

  return {
    rows: estimate.lines.map((line) => ({
      line,
      adoptedRequestId: adoptedByLineId.get(line.id) ?? null,
    })),
    columns,
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
