// 下請台帳（docs/design.md 7章「画面は5つ」）のデータアクセス。画面はここだけを通す。
// テーブル定義は supabase/migrations/20260805060300_subcontractors.sql。

import { getSupabaseClient } from "./client";
import type { NewSubcontractorInput, Subcontractor } from "./types";
import { isUuid } from "./uuid";

const COLUMNS = "id, owner_id, company_name, email, created_at";

type SubcontractorRow = {
  id: string;
  owner_id: string;
  company_name: string;
  email: string;
  created_at: string;
};

function toSubcontractor(row: SubcontractorRow): Subcontractor {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyName: row.company_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

export async function listSubcontractorsForOwner(
  ownerId: string,
): Promise<Subcontractor[]> {
  const { data, error } = await getSupabaseClient()
    .from("subcontractors")
    .select(COLUMNS)
    .eq("owner_id", ownerId);
  if (error) throw error;
  // 日本語の並び順は Postgres 側の照合順序に委ねない（priceMaster.ts と同じ理由）。
  return (data as SubcontractorRow[])
    .map(toSubcontractor)
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "ja"));
}

/** 下請台帳の項目が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getSubcontractorForOwner(
  id: string,
  ownerId: string,
): Promise<Subcontractor | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("subcontractors")
    .select(COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toSubcontractor(data as SubcontractorRow) : null;
}

export async function createSubcontractor(
  input: NewSubcontractorInput,
  ownerId: string,
): Promise<Subcontractor> {
  const { data, error } = await getSupabaseClient()
    .from("subcontractors")
    .insert({
      owner_id: ownerId,
      company_name: input.companyName,
      email: input.email,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toSubcontractor(data as SubcontractorRow);
}

/** 削除できたら true。他人の持ち物・存在しないIDなら何もせず false。 */
export async function deleteSubcontractorForOwner(
  id: string,
  ownerId: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const { data, error } = await getSupabaseClient()
    .from("subcontractors")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}
