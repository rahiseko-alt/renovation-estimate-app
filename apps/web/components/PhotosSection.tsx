"use client";

import { useRef, useState, useTransition } from "react";

import {
  deletePhotoAction,
  uploadPhotoAction,
  type PhotoWithUrl,
} from "../app/projects/[id]/photos-actions";
import {
  compressPhotoForUpload,
  InvalidPhotoTypeError,
  PhotoTooLargeError,
} from "../lib/photo/compress";
import { PHOTO_AREAS, PHOTO_TEXT, photoAreaForLineName } from "../lib/content";

/** 写真を紐づける先の明細行。工事の行だけを渡す（値引き行は撮る対象ではない）。 */
export type PhotoTargetLine = {
  id: string;
  name: string;
};

type Props = {
  projectId: string;
  initialPhotos: PhotoWithUrl[];
  lines: PhotoTargetLine[];
};

function errorMessageFor(error: unknown): string {
  if (error instanceof InvalidPhotoTypeError) return PHOTO_TEXT.invalidType;
  if (error instanceof PhotoTooLargeError) return PHOTO_TEXT.tooLarge;
  return PHOTO_TEXT.uploadFailed;
}

/**
 * 案件詳細画面の写真セクション。追加フォームと、箇所ごとにグループ化した一覧を持つ。
 *
 * **どの明細行の写真かを選ばせる。** これを付けずに撮った写真は、書類のどの枠にも
 * 入らず黙って落ちる（lib/db/quoteRequestDoc.ts は line_id が null の写真を捨てる。
 * どの工事の現況か決まっていないものを別の行に入れると、写真と工事名が食い違うため）。
 *
 * 箇所（area）は選ばせない。2026-08-07 に「箇所を選ばせる形」はやめており
 * （lib/content.ts の photoAreaForLineName 参照。選択肢が8つしか無く、
 * 給排水設備工事と解体・廃棄物処理費が永久に撮れなかった）、値は明細名から決まる。
 * この画面はその移行から漏れていて、2026-09-01 まで箇所だけを選ばせ line_id を
 * 送っていなかった。結果、**デモの外では撮った写真が1枚も見積依頼書に入らなかった。**
 */
export function PhotosSection({ projectId, initialPhotos, lines }: Props) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [lineId, setLineId] = useState<string>(lines[0]?.id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrorMessage(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage(PHOTO_TEXT.noFileSelected);
      return;
    }

    const line = lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      setErrorMessage(PHOTO_TEXT.noLineSelected);
      return;
    }

    startUpload(async () => {
      try {
        const compressed = await compressPhotoForUpload(file);
        const formData = new FormData();
        // area は photos の必須の列。値は明細名から決まる（lib/content.ts）。
        formData.set("area", photoAreaForLineName(line.name));
        // これを付けないと、撮っても書類のどの枠にも入らない（lib/db/quoteRequestDoc.ts）。
        formData.set("lineId", line.id);
        formData.set("photo", compressed, compressed.name || "photo.jpg");

        const photo = await uploadPhotoAction(projectId, formData);
        setPhotos((current) => [...current, photo]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        setErrorMessage(errorMessageFor(error));
      }
    });
  }

  function handleDelete(photoId: string): void {
    setErrorMessage(null);
    setDeletingId(photoId);
    startDelete(async () => {
      try {
        await deletePhotoAction(projectId, photoId);
        setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      } catch {
        setErrorMessage(PHOTO_TEXT.deleteFailed);
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{PHOTO_TEXT.heading}</h2>

      {lines.length === 0 ? (
        // 明細が無いと写真の入る枠が決まらない。撮らせてから「入らなかった」と
        // 言うより、先に見積を作ってもらう。
        <p className="mt-4 rounded border-2 border-gray-400 bg-gray-50 px-4 py-3 text-gray-800">
          {PHOTO_TEXT.noLinesYet}
        </p>
      ) : (
        <form onSubmit={handleUpload} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="photo-line" className="font-bold">
              {PHOTO_TEXT.lineLabel}
            </label>
            <select
              id="photo-line"
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
              className="rounded border-2 border-gray-500 px-2 py-3"
            >
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="photo-file" className="font-bold">
              {PHOTO_TEXT.fileLabel}
            </label>
            <input
              id="photo-file"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="rounded border-2 border-gray-500 px-4 py-3"
            />
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
          >
            {isUploading ? PHOTO_TEXT.uploading : PHOTO_TEXT.uploadButton}
          </button>
        </form>
      )}

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {errorMessage}
        </p>
      ) : null}

      {photos.length === 0 ? (
        <p className="mt-4 text-gray-700">{PHOTO_TEXT.empty}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {PHOTO_AREAS.filter((value) =>
            photos.some((photo) => photo.area === value),
          ).map((value) => (
            <div key={value}>
              <h3 className="font-bold">{value}</h3>
              <ul className="mt-2 grid grid-cols-2 gap-3">
                {photos
                  .filter((photo) => photo.area === value)
                  .map((photo) => (
                    <li
                      key={photo.id}
                      className="flex flex-col gap-2 rounded border-2 border-gray-400 p-2"
                    >
                      {photo.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLは短命で都度発行するため next/image の最適化キャッシュと相性が悪い
                        <img
                          src={photo.url}
                          alt={value}
                          className="aspect-square w-full rounded object-cover"
                        />
                      ) : (
                        <div className="aspect-square w-full rounded bg-gray-200" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(photo.id)}
                        disabled={isDeleting}
                        className="tap rounded border-2 border-red-700 px-3 py-2 text-sm font-bold text-red-900 disabled:opacity-50"
                      >
                        {isDeleting && deletingId === photo.id
                          ? PHOTO_TEXT.deleting
                          : PHOTO_TEXT.deleteButton}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
