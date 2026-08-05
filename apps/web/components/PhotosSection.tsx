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
import { PHOTO_AREAS, PHOTO_TEXT } from "../lib/content";

type Props = {
  projectId: string;
  initialPhotos: PhotoWithUrl[];
};

function errorMessageFor(error: unknown): string {
  if (error instanceof InvalidPhotoTypeError) return PHOTO_TEXT.invalidType;
  if (error instanceof PhotoTooLargeError) return PHOTO_TEXT.tooLarge;
  return PHOTO_TEXT.uploadFailed;
}

/** 案件詳細画面の写真セクション。追加フォームと、箇所ごとにグループ化した一覧を持つ。 */
export function PhotosSection({ projectId, initialPhotos }: Props) {
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [area, setArea] = useState<string>(PHOTO_AREAS[0]);
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

    startUpload(async () => {
      try {
        const compressed = await compressPhotoForUpload(file);
        const formData = new FormData();
        formData.set("area", area);
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

      <form onSubmit={handleUpload} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="photo-area" className="font-bold">
            {PHOTO_TEXT.areaLabel}
          </label>
          <select
            id="photo-area"
            value={area}
            onChange={(event) => setArea(event.target.value)}
            className="rounded border-2 border-gray-500 px-2 py-3"
          >
            {PHOTO_AREAS.map((value) => (
              <option key={value} value={value}>
                {value}
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
                        disabled={isDeleting && deletingId === photo.id}
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
