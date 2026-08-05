// 下請への見積依頼（明細1件ぶんの単価を頼む）のデータアクセス。画面はここだけを通す。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// 依頼の作成・一覧・取り込みは projects.ts / photos.ts と同じく ownerId で絞る。
// 一方、下請の回答画面（/q/[token]）はログインさせない設計のため、token による取得・
// 回答の登録だけは owner による絞り込みを行わない（token を知っていることそのものが
// その1件への資格情報。IDOR対策の考え方は同じだが、境界に使う値が違う）。

import type { TaxCategory } from "../calc";
import { getSupabaseClient } from "./client";
import type { NewQuoteRequestInput, QuoteRequest, QuoteRequestStatus } from "./types";
import { isUuid } from "./uuid";

const COLUMNS =
  "id, project_id, owner_id, token, item_name, item_spec, quantity, unit, tax_category, markup_rate, cost_unit_price, status, responded_at, imported_at, created_at";

type QuoteRequestRow = {
  id: string;
  project_id: string;
  owner_id: string;
  token: string;
  item_name: string;
  item_spec: string;
  quantity: number;
  unit: string;
  tax_category: TaxCategory;
  markup_rate: number;
  cost_unit_price: number | null;
  status: QuoteRequestStatus;
  responded_at: string | null;
  imported_at: string | null;
  created_at: string;
};

function toQuoteRequest(row: QuoteRequestRow): QuoteRequest {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    token: row.token,
    itemName: row.item_name,
    itemSpec: row.item_spec,
    quantity: row.quantity,
    unit: row.unit,
    taxCategory: row.tax_category,
    markupRate: row.markup_rate,
    costUnitPrice: row.cost_unit_price,
    status: row.status,
    respondedAt: row.responded_at,
    importedAt: row.imported_at,
    createdAt: row.created_at,
  };
}

/**
 * 見積依頼を作る。呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う
 * （photos.ts の createPhoto と同じ役割分担）。
 */
export async function createQuoteRequest(
  input: NewQuoteRequestInput,
  ownerId: string,
): Promise<QuoteRequest> {
  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .insert({
      project_id: input.projectId,
      owner_id: ownerId,
      item_name: input.itemName,
      item_spec: input.itemSpec,
      quantity: input.quantity,
      unit: input.unit,
      tax_category: input.taxCategory,
      markup_rate: input.markupRate,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toQuoteRequest(data as QuoteRequestRow);
}

/** 案件の見積依頼一覧。呼び出し側で案件の所有者確認を済ませた上で使う。新しい依頼が先。 */
export async function listQuoteRequestsForProject(
  projectId: string,
  ownerId: string,
): Promise<QuoteRequest[]> {
  if (!isUuid(projectId)) return [];

  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as QuoteRequestRow[]).map(toQuoteRequest);
}

/**
 * 見積依頼が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。
 * 取り込み（importQuoteResponseAction）側で使う、所有者確認つきの取得。
 */
export async function getQuoteRequestForOwner(
  id: string,
  ownerId: string,
): Promise<QuoteRequest | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .select(COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteRequest(data as QuoteRequestRow) : null;
}

/**
 * token から見積依頼を取得する。下請の回答画面専用の入口で、owner による絞り込みは
 * 行わない（token そのものが資格情報。ここ以外から呼ばない）。
 */
export async function getQuoteRequestByToken(
  token: string,
): Promise<QuoteRequest | null> {
  if (!isUuid(token)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .select(COLUMNS)
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteRequest(data as QuoteRequestRow) : null;
}

/**
 * 下請の回答を登録する。status が pending の行にだけ書き込む（二重回答で先の回答を
 * 上書きしない）。対象が無ければ null を返す（token が不正・存在しない・
 * 既に回答済みのいずれか。呼び出し側でこれ以上の理由の書き分けはしない
 * ―― 回答済みかどうかは画面側で getQuoteRequestByToken の status から分かる）。
 */
export async function submitQuoteResponse(
  token: string,
  costUnitPrice: number,
): Promise<QuoteRequest | null> {
  if (!isUuid(token)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .update({
      cost_unit_price: costUnitPrice,
      status: "responded",
      responded_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteRequest(data as QuoteRequestRow) : null;
}

/**
 * 見積への取り込み済みにする。status が responded の行にだけ書き込む
 * （二重取り込みで見積に同じ明細が2行入るのを防ぐ）。
 * 呼び出し側で ownerId の所有者確認を済ませた上で使う。
 */
export async function markQuoteRequestImported(
  id: string,
  ownerId: string,
): Promise<QuoteRequest | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_requests")
    .update({ status: "imported", imported_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("status", "responded")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuoteRequest(data as QuoteRequestRow) : null;
}
