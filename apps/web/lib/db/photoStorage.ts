// 写真本体（バイト列）の Supabase Storage 操作。行のCRUDは lib/db/photos.ts に分ける
// （このファイルはバケット "photos" とのやり取りだけを扱う）。
//
// バケットは非公開（supabase/migrations/ 参照）で、サーバーは service_role で接続するため
// Storage の RLS を無条件にバイパスする。したがって、どのオブジェクトを読み書きしてよいかの
// 判断はここではなく呼び出し側（Server Action）が案件の所有者確認を済ませた上で
// 渡してくる storage_path を信頼する形に置く（lib/db/ 全体で一貫させている境界と同じ）。

import { randomUUID } from "node:crypto";

import { getSupabaseClient } from "./client";

const BUCKET = "photos";

/** アップロード先のオブジェクトキーを発行する。案件IDを含めて、案件単位で見渡せるようにする。 */
export function newPhotoStoragePath(projectId: string, contentType: string): string {
  const extension = contentType === "image/png" ? "png" : "jpg";
  return `${projectId}/${randomUUID()}.${extension}`;
}

export async function uploadPhotoObject(
  path: string,
  file: File,
): Promise<void> {
  const bytes = await file.arrayBuffer();
  const { error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: file.type });
  if (error) throw error;
}

/**
 * ストレージのオブジェクトを削除する。失敗しても投げない
 * （呼び出し側は「DB行削除→ストレージ削除」の順で呼ぶため、ここでの失敗は
 * 参照の無いオブジェクトが残るだけで利用者には見えない。DB行削除の成功を
 * ストレージ削除の成否で覆さない）。
 */
export async function deletePhotoObject(path: string): Promise<void> {
  const { error } = await getSupabaseClient().storage.from(BUCKET).remove([path]);
  if (error) {
    // path を console.error の第一引数（フォーマット文字列扱いされる位置）に
    // テンプレートリテラルで埋め込まない。path は最終的に projectId（URLパラメータ・
    // 利用者が制御できる値）に由来するため、埋め込むと書式指定子として
    // 解釈されうる（CWE-134）。第一引数は固定の文字列にし、値は別引数で渡す。
    console.error("写真ストレージの削除に失敗した:", { path, error });
  }
}

/**
 * ストレージのオブジェクトを削除し、消せたかどうかを返す。
 *
 * `deletePhotoObject` と違い、失敗を呼び出し側に伝える。
 * **DB行を消す前に**ストレージを消す手順（デモの掃除がこれ）では、失敗を握ると
 * 行が消えたあとにオブジェクトの場所が分からなくなり、二度と回収できなくなる。
 */
export async function tryDeletePhotoObject(path: string): Promise<boolean> {
  const { error } = await getSupabaseClient().storage.from(BUCKET).remove([path]);
  return !error;
}

/** 表示用の署名付きURLを発行する。呼び出し側で対象写真の所有者確認を済ませた上で使う。 */
export async function createPhotoSignedUrl(
  path: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) {
    // deletePhotoObject と同じ理由（CWE-134）で、path をテンプレートリテラルで
    // 第一引数に埋め込まない。
    console.error("写真の署名付きURL発行に失敗した:", { path, error });
    return null;
  }
  return data.signedUrl;
}
