"use server";

import { getCurrentUser } from "../../../lib/auth/server";
import { PHOTO_AREAS } from "../../../lib/content";
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

// 一覧表示のたびに都度発行し直す短命の署名付きURL。
// 案件詳細画面を開くたびに再取得されるので、長く持たせる必要が無い
// （長く持たせるほど、URLの単独漏えい時の露出時間も伸びる）。
const SIGNED_URL_EXPIRES_SECONDS = 300;

export type PhotoWithUrl = Photo & { url: string | null };

/**
 * 写真を追加する。saveEstimateAction / generateEstimatePdfAction と同じ理由
 * （IDOR対策）で、ログイン状態と案件の所有者をここでも確かめてから保存する。
 *
 * formData には圧縮済みの File（key: "photo"）と箇所（key: "area"）を入れて渡す。
 * 圧縮はクライアント側（lib/photo/compress.ts）で済ませたものだけを受け取る想定だが、
 * ここでも種別・サイズを信頼しない前提で area の妥当性だけは検証する
 * （ファイル自体の中身の検証は Supabase Storage 側のアップロードに委ねる）。
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

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("写真が選択されていません。");
  }

  const storagePath = newPhotoStoragePath(projectId, file.type);
  await uploadPhotoObject(storagePath, file);

  let photo: Photo;
  try {
    photo = await createPhoto({ projectId, area, storagePath }, user);
  } catch (error) {
    // DB行の作成に失敗したら、アップロード済みのオブジェクトを残さない
    // （参照の無いオブジェクトがストレージに溜まり続けるのを防ぐ）。
    await deletePhotoObject(storagePath);
    throw error;
  }

  const url = await createPhotoSignedUrl(storagePath, SIGNED_URL_EXPIRES_SECONDS);
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
