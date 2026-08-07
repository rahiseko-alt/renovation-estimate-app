// 案件に紐づく写真のメタデータへのデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// Supabase（PostgreSQL）を使う。テーブル定義は supabase/migrations/ を参照。
//
// 一覧・取得・削除はすべて ownerId で絞る（lib/db/projects.ts と同じ境界）。
// 絞り込まない取得関数はこのファイルに置かない
// （他人の写真IDを知っているだけで読み書きできる状態を防ぐ境界を、ここ1箇所に固定する）。
//
// Storage 上のオブジェクト本体の操作（アップロード・削除・署名付きURL発行）は
// lib/db/photoStorage.ts に分ける（このファイルは行のCRUDだけを扱う）。

import { getSupabaseClient } from "./client";
import type { NewPhotoInput, Photo } from "./types";
import { isUuid } from "./uuid";

const COLUMNS =
  "id, project_id, owner_id, area, line_id, storage_path, created_at";

type PhotoRow = {
  id: string;
  project_id: string;
  owner_id: string;
  area: string;
  line_id: string | null;
  storage_path: string;
  created_at: string;
};

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    area: row.area,
    lineId: row.line_id,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

/** 案件の写真一覧。呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う。 */
export async function listPhotosForProject(
  projectId: string,
  ownerId: string,
): Promise<Photo[]> {
  if (!isUuid(projectId)) return [];

  const { data, error } = await getSupabaseClient()
    .from("photos")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PhotoRow[]).map(toPhoto);
}

/** 写真が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getPhotoForOwner(
  id: string,
  ownerId: string,
): Promise<Photo | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await getSupabaseClient()
    .from("photos")
    .select(COLUMNS)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toPhoto(data as PhotoRow) : null;
}

export async function createPhoto(
  input: NewPhotoInput,
  ownerId: string,
): Promise<Photo> {
  const { data, error } = await getSupabaseClient()
    .from("photos")
    .insert({
      project_id: input.projectId,
      owner_id: ownerId,
      area: input.area,
      line_id: input.lineId ?? null,
      storage_path: input.storagePath,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toPhoto(data as PhotoRow);
}

/** 削除できたら true。他人の持ち物・存在しないIDなら何もせず false。 */
export async function deletePhotoRowForOwner(
  id: string,
  ownerId: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const { data, error } = await getSupabaseClient()
    .from("photos")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw error;
  return (data as { id: string }[]).length > 0;
}
