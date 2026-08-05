// 単価マスタのデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// 一覧・取得はすべて ownerId で絞る（lib/db/projects.ts と同じ境界）。
// 絞り込まない取得関数はこのファイルに置かない
// （他人の単価マスタIDを知っているだけで読み書きできる状態を防ぐ境界を、ここ1箇所に固定する）。

import type { TaxCategory } from "../calc";
import { getSupabaseClient } from "./client";
import type { NewPriceMasterItemInput, PriceMasterItem } from "./types";
import { isUuid } from "./uuid";

const COLUMNS = "id, owner_id, name, spec, unit, unit_price, tax_category, created_at";

type PriceMasterItemRow = {
  id: string;
  owner_id: string;
  name: string;
  spec: string;
  unit: string;
  unit_price: number;
  tax_category: string;
  created_at: string;
};

function toPriceMasterItem(row: PriceMasterItemRow): PriceMasterItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    spec: row.spec,
    unit: row.unit,
    unitPrice: row.unit_price,
    taxCategory: row.tax_category as TaxCategory,
    createdAt: row.created_at,
  };
}

export async function listPriceMasterForOwner(
  ownerId: string,
): Promise<PriceMasterItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("price_master_items")
    .select(COLUMNS)
    .eq("owner_id", ownerId);
  if (error) throw error;

  // 日本語の並び順は Postgres 側の照合順序に委ねない（フレッシュな環境の既定照合順序は
  // 仮名・漢字を意図通りに並べる保証が無い）。JS の localeCompare("ja") で揃える
  // （仮実装のときと同じ並び順を維持する）。
  return (data as PriceMasterItemRow[])
    .map(toPriceMasterItem)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 単価マスタの項目が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getPriceMasterItemForOwner(
  id: string,
  ownerId: string,
): Promise<PriceMasterItem | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("price_master_items")
    .select(COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toPriceMasterItem(data as PriceMasterItemRow) : null;
}

export async function createPriceMasterItem(
  input: NewPriceMasterItemInput,
  ownerId: string,
): Promise<PriceMasterItem> {
  const { data, error } = await getSupabaseClient()
    .from("price_master_items")
    .insert({
      owner_id: ownerId,
      name: input.name,
      spec: input.spec,
      unit: input.unit,
      unit_price: input.unitPrice,
      tax_category: input.taxCategory,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toPriceMasterItem(data as PriceMasterItemRow);
}

/** 削除できたら true。他人の持ち物・存在しないIDなら何もせず false。 */
export async function deletePriceMasterItemForOwner(
  id: string,
  ownerId: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const { data, error } = await getSupabaseClient()
    .from("price_master_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}
