// 下請からの回答（docs/design.md 3章「下請が返す見積書に求められる内訳」）の
// データアクセス。テーブル定義は
// supabase/migrations/20260806010100_group_responses.sql。
//
// 入口は token だけ。**owner による絞り込みを行わない**（token そのものが資格情報。
// 下請はログインしない）。そのぶん、ここで「その token の依頼が対象にしている明細か」
// を必ず確かめる。確かめないと、token を1つ持っている下請が、依頼されていない明細の
// 単価まで入れられてしまう。

import { getSupabaseClient } from "./client";
import type {
  NewQuoteGroupResponseInput,
  QuoteGroupResponse,
  QuoteResponseCostBreakdown,
  QuoteResponseLine,
} from "./types";
import { isUuid } from "./uuid";

const RESPONSE_COLUMNS =
  "id, quote_group_request_id, material_cost, labor_cost, legal_welfare_cost, safety_health_cost, retirement_mutual_aid_cost, work_days, material_supplied_note, responded_at";

const LINE_COLUMNS = "line_item_id, quantity, cost_unit_price";

type ResponseRow = {
  id: string;
  quote_group_request_id: string;
  material_cost: number | null;
  labor_cost: number | null;
  legal_welfare_cost: number | null;
  safety_health_cost: number | null;
  retirement_mutual_aid_cost: number | null;
  work_days: number | null;
  material_supplied_note: string;
  responded_at: string;
};

type ResponseLineRow = {
  line_item_id: string;
  quantity: number;
  cost_unit_price: number;
};

function toResponse(
  row: ResponseRow,
  lineRows: ResponseLineRow[],
): QuoteGroupResponse {
  return {
    id: row.id,
    quoteGroupRequestId: row.quote_group_request_id,
    breakdown: {
      materialCost: row.material_cost,
      laborCost: row.labor_cost,
      legalWelfareCost: row.legal_welfare_cost,
      safetyHealthCost: row.safety_health_cost,
      retirementMutualAidCost: row.retirement_mutual_aid_cost,
      workDays: row.work_days,
      materialSuppliedNote: row.material_supplied_note,
    },
    lines: lineRows.map((line) => ({
      lineItemId: line.line_item_id,
      quantity: Number(line.quantity),
      costUnitPrice: line.cost_unit_price,
    })),
    respondedAt: row.responded_at,
  };
}

function breakdownColumns(
  breakdown: QuoteResponseCostBreakdown,
): Record<string, number | string | null> {
  return {
    material_cost: breakdown.materialCost,
    labor_cost: breakdown.laborCost,
    legal_welfare_cost: breakdown.legalWelfareCost,
    safety_health_cost: breakdown.safetyHealthCost,
    retirement_mutual_aid_cost: breakdown.retirementMutualAidCost,
    work_days: breakdown.workDays,
    material_supplied_note: breakdown.materialSuppliedNote,
  };
}

/** 回答に必要な、依頼の側の情報。 */
type RequestForResponse = {
  id: string;
  status: string;
  lineItemIds: string[];
};

async function findRequestByToken(
  token: string,
): Promise<RequestForResponse | null> {
  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select("id, status, line_item_ids")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; status: string; line_item_ids: string[] };
  return { id: row.id, status: row.status, lineItemIds: row.line_item_ids };
}

/**
 * 下請の回答を保存する。
 *
 * ここで守ること（いずれもクライアント側の検証はバイパスできるので、サーバ側で行う。
 * app/projects/[id]/photos-actions.ts が既存の同種原則）：
 * - token が実在すること
 * - 既に回答済みの依頼を上書きさせないこと
 * - **明細が、その依頼の対象範囲（line_item_ids）に入っていること**
 * - 明細が1件も無い回答を作らせないこと（単価の無い見積書を成立させない）
 *
 * 必要経費の内訳は努力義務なので、未入力（null）のままでも保存できる。
 */
export async function createQuoteGroupResponse(
  input: NewQuoteGroupResponseInput,
): Promise<QuoteGroupResponse> {
  if (!isUuid(input.token)) {
    throw new Error("依頼が見つかりません。");
  }

  const request = await findRequestByToken(input.token);
  if (!request) {
    throw new Error("依頼が見つかりません。");
  }
  if (request.status !== "pending") {
    throw new Error("この依頼は既に回答済みです。");
  }
  if (input.lines.length === 0) {
    throw new Error("明細が1件もありません。");
  }

  const allowedLineIds = new Set(request.lineItemIds);
  if (input.lines.some((line) => !allowedLineIds.has(line.lineItemId))) {
    throw new Error("依頼されていない明細が含まれています。");
  }
  const uniqueLineIds = new Set(input.lines.map((line) => line.lineItemId));
  if (uniqueLineIds.size !== input.lines.length) {
    throw new Error("同じ明細が2行あります。");
  }

  // 3つの書き込み（回答・明細・依頼の状態）を1つのトランザクションで適用する。
  // 分けて書くと、途中で失敗したときに回答だけが残り、依頼は pending のままになる。
  // その状態では下請が再送しても quote_group_request_id の unique 制約に当たって
  // 必ず失敗し、**永久に回答できなくなる**（比較表にはその社の欄が空で残る）。
  // Supabase の JS クライアントにトランザクションのAPIが無いので、DB側の関数に寄せる
  // （supabase/migrations/20260806020100_response_atomic.sql）。
  const client = getSupabaseClient();
  const { error: rpcError } = await client.rpc("create_quote_group_response", {
    p_request_id: request.id,
    p_breakdown: breakdownColumns(input.breakdown),
    p_lines: input.lines.map((line) => ({
      line_item_id: line.lineItemId,
      quantity: line.quantity,
      cost_unit_price: line.costUnitPrice,
    })),
  });
  if (rpcError) throw rpcError;

  const stored = await getQuoteGroupResponseForRequest(request.id);
  if (!stored) {
    throw new Error("回答を保存できませんでした。");
  }
  return stored;
}


/** 依頼IDから回答を引く（元請の比較表が使う）。回答がなければ null。 */
export async function getQuoteGroupResponseForRequest(
  quoteGroupRequestId: string,
): Promise<QuoteGroupResponse | null> {
  if (!isUuid(quoteGroupRequestId)) return null;

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("quote_group_responses")
    .select(RESPONSE_COLUMNS)
    .eq("quote_group_request_id", quoteGroupRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ResponseRow;

  const { data: lineData, error: lineError } = await client
    .from("quote_group_response_lines")
    .select(LINE_COLUMNS)
    .eq("response_id", row.id);
  if (lineError) throw lineError;

  return toResponse(row, lineData as ResponseLineRow[]);
}

/** 明細ごとの原価単価を引く（比較表が「1明細を各社が何円で見たか」を並べるのに使う）。 */
export function costUnitPriceByLineId(
  response: QuoteGroupResponse,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of response.lines) {
    result[line.lineItemId] = line.costUnitPrice;
  }
  return result;
}

export type { QuoteResponseLine };
