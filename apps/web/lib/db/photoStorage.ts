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
  // 実体は tryDeletePhotoObjects に持たせる。バケット名と分割の規則を2箇所に置かない。
  // ここは戻り値を捨てる＝失敗を握る側の入口（呼び出し順の都合。上のコメント参照）。
  await tryDeletePhotoObjects([path]);
}

/** Storage の remove に一度に渡す最大件数。 */
const STORAGE_REMOVE_CHUNK = 1000;

/**
 * ストレージのオブジェクトをまとめて削除し、全部消せたかどうかを返す。
 *
 * `deletePhotoObject` と違い、失敗を呼び出し側に伝える。
 * **DB行を消す前に**ストレージを消す手順（デモの掃除がこれ）では、失敗を握ると
 * 行が消えたあとにオブジェクトの場所が分からなくなり、二度と回収できなくなる。
 *
 * どれが消せなかったかは返さない。呼び出し側は案件単位で渡し、
 * 1つでも失敗したらその案件を丸ごと次回に回す（中途半端に消さない）。
 */
export async function tryDeletePhotoObjects(
  paths: readonly string[],
): Promise<boolean> {
  if (paths.length === 0) return true;
  // Storage の remove は一度に受け取れる数に上限がある。分けて投げる。
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + STORAGE_REMOVE_CHUNK);
    const { error } = await getSupabaseClient()
      .storage.from(BUCKET)
      .remove([...chunk]);
    if (error) {
      // path は projectId（利用者が制御できる値）に由来する。第一引数は固定の
      // 文字列にし、値は別引数で渡す（書式指定子として解釈されうる。CWE-134）。
      console.error("写真ストレージの削除に失敗した:", {
        count: chunk.length,
        error,
      });
      return false;
    }
  }
  return true;
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
