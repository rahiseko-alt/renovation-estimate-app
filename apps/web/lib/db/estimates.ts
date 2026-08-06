// 見積のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// フェーズ1のこの実装は、案件1件につき見積1件（改版なし）に単純化している
// （estimates テーブルの project_id は UNIQUE 制約）。
// 見積の改版履歴を持つ場合も、画面からの呼び出し方は変えずにこの中だけを直せばよい。

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EstimateLine, TaxCategory } from "../calc";
import { DEFAULT_DISPOSAL_ITEM_NAME } from "../doc/templates/estimate";
import { getSupabaseClient } from "./client";
import type { Estimate, PersistedEstimateLine } from "./types";

const COLUMNS =
  "id, project_id, lines, overhead_rate_percent, overhead_tax_category, updated_at";

// Postgres の一意制約違反のエラーコード。
const UNIQUE_VIOLATION = "23505";

type EstimateRow = {
  id: string;
  project_id: string;
  lines: PersistedEstimateLine[];
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

function defaultLines(): PersistedEstimateLine[] {
  return [
    {
      id: crypto.randomUUID(),
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

/**
 * 明細を読んで・書き換えてから保存し直すまでの間に、別の追加が割り込む回数の上限。
 * 現実的には1〜2回競合すれば十分で、これを使い切るのは異常系（バグ・過度な同時実行）。
 */
const MAX_APPEND_RETRIES = 5;

/**
 * 見積に明細行を1件だけ追加する。下請への見積依頼の取り込み専用の入口
 * （app/projects/[id]/estimate/quote-actions.ts の importQuoteResponseAction）。
 *
 * saveEstimate（明細全体を渡して丸ごと書き換える）をここで使うと、2件の依頼を
 * ほぼ同時に取り込んだときに「読む→配列に足す→書く」が競合し、後から保存した方が
 * 先の追加ごと上書きしてしまう（互いの存在を知らないまま両方が「元の配列＋自分の1行」を
 * 書き込むため）。updated_at を使った楽観ロックで、保存時点の行が読んだ時点と
 * 変わっていないことを確かめ、変わっていたら読み直して1回だけ足し直す。
 *
 * 呼び出し側は id を持たない EstimateLine を渡す。安定IDは追加のたびにここで
 * 発行する（docs/design.md 7章「明細行に安定したIDを持たせる」）。
 */
export async function appendEstimateLine(
  projectId: string,
  newLine: EstimateLine,
): Promise<Estimate> {
  const client = getSupabaseClient();
  const persistedLine: PersistedEstimateLine = {
    ...newLine,
    id: crypto.randomUUID(),
  };

  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt += 1) {
    const estimate = await getOrCreateEstimate(projectId);
    const { data, error } = await client
      .from("estimates")
      .update({
        lines: [...estimate.lines, persistedLine],
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("updated_at", estimate.updatedAt)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    // data が無い = updated_at が読んだ時点から変わっていた（別の追加が割り込んだ）。
    // 机上の空論ではない競合（フェーズ2の getOrCreateEstimate と同じ理由）なので、
    // 上書きせず読み直して1回だけ足し直す。
    if (data) return toEstimate(data as EstimateRow);
  }
  throw new Error(
    "見積の更新が競合し続けました。もう一度お試しください。",
  );
}

/**
 * 明細行のIDが、空でなく・重複していないことを確かめる。
 * saveEstimate は明細を丸ごと書き換えるため、呼び出し側（見積エディタ）が壊れた
 * IDを送ってくると、id をキーにする画面側の処理（React の行key、写真の紐づけ、
 * 下請からの単価採用）が複数行を同時に更新・削除する事故につながる
 * （CodeRabbit のレビューで指摘。ここで検証してから保存する）。
 */
function assertValidLineIds(lines: PersistedEstimateLine[]): void {
  const ids = lines.map((line) => line.id);
  if (ids.some((id) => id.trim() === "")) {
    throw new Error("明細行のIDが空です。");
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("明細行のIDが重複しています。");
  }
}

export async function saveEstimate(
  projectId: string,
  lines: PersistedEstimateLine[],
  overheadRatePercent: number,
): Promise<Estimate> {
  assertValidLineIds(lines);

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
