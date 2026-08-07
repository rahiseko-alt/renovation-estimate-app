"use server";

import { getCurrentUser } from "../../../lib/auth/server";
import {
  PHOTO_ALLOWED_TYPES,
  PHOTO_AREAS,
  PHOTO_MAX_UPLOAD_MB,
  PHOTO_SIGNED_URL_EXPIRES_SECONDS,
} from "../../../lib/content";
import {
  createPhoto,
  deletePhotoRowForOwner,
  getPhotoForOwner,
} from "../../../lib/db/photos";
import {
  createPhotoSignedUrl,
  deletePhotoObject,
  newPhotoStoragePath,
  uploadPhotoObject,
} from "../../../lib/db/photoStorage";
import { getProjectForOwner } from "../../../lib/db/projects";
import type { Photo } from "../../../lib/db/types";

const PHOTO_AREA_SET: ReadonlySet<string> = new Set(PHOTO_AREAS);
const PHOTO_ALLOWED_TYPE_SET: ReadonlySet<string> = new Set(PHOTO_ALLOWED_TYPES);
const MAX_UPLOAD_BYTES = PHOTO_MAX_UPLOAD_MB * 1024 * 1024;

export type PhotoWithUrl = Photo & { url: string | null };

/**
 * 写真を追加する。saveEstimateAction / generateEstimatePdfAction と同じ理由
 * （IDOR対策）で、ログイン状態と案件の所有者をここでも確かめてから保存する。
 *
 * formData には圧縮済みの File（key: "photo"）と箇所（key: "area"）を入れて渡す。
 * 明細行ID（key: "lineId"）は任意で、入っていればその明細に結びつける。
 * **結びつけないと、その写真は書類のどの枠にも入らない**（lib/db/quoteRequestDoc.ts が
 * line_id をキーに枠へ流し込む）。渡された明細IDがこの案件の見積に無ければ
 * createPhoto が弾く（lib/db/photos.ts）。
 * 圧縮・種別・サイズの制限はクライアント側（lib/photo/compress.ts）でも行うが、
 * Server Action はブラウザを経由しない呼び出しからも直接叩けるため、
 * クライアント側の検証はバイパスできる前提でここでも同じ制限を確かめる
 * （lib.content.ts の PHOTO_ALLOWED_TYPES / PHOTO_MAX_UPLOAD_MB と同じ値を使う）。
 */
export async function uploadPhotoAction(
  projectId: string,
  formData: FormData,
): Promise<PhotoWithUrl> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProjectForOwner(projectId, user);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  const area = formData.get("area");
  if (typeof area !== "string" || !PHOTO_AREA_SET.has(area)) {
    throw new Error("箇所が不正です。");
  }

  // 明細行ID は任意。空文字は「付けない」と同じに扱う（フォームの未選択は空で届く）。
  const lineIdValue = formData.get("lineId");
  if (lineIdValue !== null && typeof lineIdValue !== "string") {
    throw new Error("明細行が不正です。");
  }
  const lineId = lineIdValue === null || lineIdValue === "" ? null : lineIdValue;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("写真が選択されていません。");
  }
  if (!PHOTO_ALLOWED_TYPE_SET.has(file.type)) {
    throw new Error("対応していない画像形式です。");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("写真が大きすぎます。");
  }

  const storagePath = newPhotoStoragePath(projectId, file.type);
  await uploadPhotoObject(storagePath, file);

  let photo: Photo;
  try {
    photo = await createPhoto({ projectId, area, lineId, storagePath }, user);
  } catch (error) {
    // DB行の作成に失敗したら、アップロード済みのオブジェクトを残さない
    // （参照の無いオブジェクトがストレージに溜まり続けるのを防ぐ）。
    await deletePhotoObject(storagePath);
    throw error;
  }

  const url = await createPhotoSignedUrl(storagePath, PHOTO_SIGNED_URL_EXPIRES_SECONDS);
  return { ...photo, url };
}

/** 写真を削除する。案件の所有者確認に加え、写真自体の所有者・所属案件も確かめる。 */
export async function deletePhotoAction(
  projectId: string,
  photoId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProjectForOwner(projectId, user);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  const photo = await getPhotoForOwner(photoId, user);
  if (!photo || photo.projectId !== projectId) {
    throw new Error("写真が見つかりません。");
  }

  const deleted = await deletePhotoRowForOwner(photoId, user);
  if (!deleted) {
    throw new Error("写真が見つかりません。");
  }
  // DB行を先に消してからストレージを消す（supabase/migrations/ の photos.storage_path
  // コメントと同じ理由。ストレージ削除の失敗は参照の無いオブジェクトが残るだけで済む）。
  await deletePhotoObject(photo.storagePath);
}
