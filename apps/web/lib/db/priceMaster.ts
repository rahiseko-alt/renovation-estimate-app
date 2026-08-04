// 単価マスタのデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// 今は lib/db/memory.ts の仮実装。Supabase に差し替えるときはこのファイルの中身だけを直す。
//
// 一覧・取得はすべて ownerId で絞る（lib/db/projects.ts と同じ境界）。
// 絞り込まない取得関数はこのファイルに置かない
// （他人の単価マスタIDを知っているだけで読み書きできる状態を防ぐ境界を、ここ1箇所に固定する）。

import { newId, nowIso } from "./memory";
import type { NewPriceMasterItemInput, PriceMasterItem } from "./types";

const items = new Map<string, PriceMasterItem>();

export async function listPriceMasterForOwner(
  ownerId: string,
): Promise<PriceMasterItem[]> {
  return [...items.values()]
    .filter((item) => item.ownerId === ownerId)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 単価マスタの項目が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getPriceMasterItemForOwner(
  id: string,
  ownerId: string,
): Promise<PriceMasterItem | null> {
  const item = items.get(id);
  return item && item.ownerId === ownerId ? item : null;
}

export async function createPriceMasterItem(
  input: NewPriceMasterItemInput,
  ownerId: string,
): Promise<PriceMasterItem> {
  const item: PriceMasterItem = {
    id: newId(),
    ownerId,
    name: input.name,
    spec: input.spec,
    unit: input.unit,
    unitPrice: input.unitPrice,
    taxCategory: input.taxCategory,
    createdAt: nowIso(),
  };
  items.set(item.id, item);
  return item;
}

/** 削除できたら true。他人の持ち物・存在しないIDなら何もせず false。 */
export async function deletePriceMasterItemForOwner(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const item = items.get(id);
  if (!item || item.ownerId !== ownerId) return false;
  items.delete(id);
  return true;
}
