// 見積のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// フェーズ1のこの実装は、案件1件につき見積1件（改版なし）に単純化している
// （estimates テーブルの project_id は UNIQUE 制約）。
// 見積の改版履歴を持つ場合も、画面からの呼び出し方は変えずにこの中だけを直せばよい。

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EstimateLine, TaxCategory } from "../calc";
import { DEFAULT_DISPOSAL_ITEM_NAME } from "../content";
import { getSupabaseClient } from "./client";
import type { Estimate } from "./types";

const COLUMNS =
  "id, project_id, lines, overhead_rate_percent, overhead_tax_category, updated_at";

// Postgres の一意制約違反のエラーコード。
const UNIQUE_VIOLATION = "23505";

type EstimateRow = {
  id: string;
  project_id: string;
  lines: EstimateLine[];
  overhead_rate_percent: number;
  overhead_tax_category: string;
  updated_at: string;
};

function toEstimate(row: EstimateRow): Estimate {
  return {
    id: row.id,
    projectId: row.project_id,
    lines: row.lines,
    overheadRatePercent: row.overhead_rate_percent,
    overheadTaxCategory: row.overhead_tax_category as TaxCategory,
    updatedAt: row.updated_at,
  };
}

function defaultLines(): EstimateLine[] {
  return [
    {
      kind: "item",
      name: DEFAULT_DISPOSAL_ITEM_NAME,
      spec: "",
      quantity: 1,
      unit: "式",
      unitPrice: 0,
      taxCategory: "standard",
    },
  ];
}

async function selectEstimate(
  client: SupabaseClient,
  projectId: string,
): Promise<Estimate | null> {
  const { data, error } = await client
    .from("estimates")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEstimate(data as EstimateRow) : null;
}

/** 見積が無ければ既定行（解体・廃棄物処理費）だけを持つ見積を作って返す。 */
export async function getOrCreateEstimate(projectId: string): Promise<Estimate> {
  const client = getSupabaseClient();

  const existing = await selectEstimate(client, projectId);
  if (existing) return existing;

  const { data, error } = await client
    .from("estimates")
    .insert({
      project_id: projectId,
      lines: defaultLines(),
      overhead_rate_percent: 0,
      overhead_tax_category: "standard",
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // 同じ案件を2つのタブで同時に開く等、間に合わせた別のリクエストが先に作成済みの場合。
    // project_id は UNIQUE 制約なので、その競合はここに 23505 として現れる。
    // 机上の空論ではない競合なので、作成し直さず取りに行き直す。
    if (error.code === UNIQUE_VIOLATION) {
      const raced = await selectEstimate(client, projectId);
      if (raced) return raced;
    }
    throw error;
  }
  return toEstimate(data as EstimateRow);
}

export async function saveEstimate(
  projectId: string,
  lines: EstimateLine[],
  overheadRatePercent: number,
): Promise<Estimate> {
  const { data, error } = await getSupabaseClient()
    .from("estimates")
    // overhead_tax_category はここでは扱わない（更新時は既存値を保つ。新規作成時は
    // カラムの既定値 'standard' が入る）。PostgREST の upsert は、送っていない列には
    // 触れない（ON CONFLICT DO UPDATE の SET に現れない）。
    .upsert(
      {
        project_id: projectId,
        lines,
        overhead_rate_percent: overheadRatePercent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toEstimate(data as EstimateRow);
}
