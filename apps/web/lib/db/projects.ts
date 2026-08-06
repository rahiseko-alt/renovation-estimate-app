// 案件のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// 一覧・取得はすべて ownerId で絞る。呼び出し側が推測した他人の案件 ID を渡しても
// 中身が返らないようにするため、絞り込まない取得関数はこのファイルに置かない
// （他人の案件IDを知っているだけで読み書きできる状態を防ぐ境界を、ここ1箇所に固定する）。

import { buildDefaultWorkName } from "../content";
import { getSupabaseClient } from "./client";
import type { NewProjectInput, Project } from "./types";
import { isUuid } from "./uuid";

const COLUMNS =
  "id, owner_id, customer_name, site_address, work_name, created_at";

type ProjectRow = {
  id: string;
  owner_id: string;
  customer_name: string;
  site_address: string;
  work_name: string;
  created_at: string;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    customerName: row.customer_name,
    siteAddress: row.site_address,
    workName: row.work_name,
    createdAt: row.created_at,
  };
}

export async function listProjectsForOwner(ownerId: string): Promise<Project[]> {
  const { data, error } = await getSupabaseClient()
    .from("projects")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ProjectRow[]).map(toProject);
}

/** 案件が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getProjectForOwner(
  id: string,
  ownerId: string,
): Promise<Project | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("projects")
    .select(COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toProject(data as ProjectRow) : null;
}

export async function createProject(
  input: NewProjectInput,
  ownerId: string,
): Promise<Project> {
  const { data, error } = await getSupabaseClient()
    .from("projects")
    .insert({
      owner_id: ownerId,
      customer_name: input.customerName,
      site_address: input.siteAddress,
      work_name: buildDefaultWorkName(input.siteAddress),
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toProject(data as ProjectRow);
}

/**
 * 案件を消す。`ownerId` の持ち物のときだけ消える（他人のIDを渡しても何も起きない）。
 *
 * 用途は**作りかけの後始末**。案件を作った直後の処理が失敗したとき、中途半端な案件を
 * 残さず消すために使う（`app/projects/new/actions.ts`）。写真・見積・依頼などは
 * すべて `on delete cascade` で一緒に消える。
 */
export async function deleteProjectForOwner(
  id: string,
  ownerId: string,
): Promise<void> {
  if (!isUuid(id)) return;

  const { error } = await getSupabaseClient()
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw error;
}
