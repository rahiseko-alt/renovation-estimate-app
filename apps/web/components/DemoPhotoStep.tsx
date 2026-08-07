"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  uploadPhotoAction,
  type PhotoWithUrl,
} from "../app/projects/[id]/photos-actions";
import {
  DEFAULT_PHOTO_AREA,
  PHOTO_AREAS,
  PHOTO_MAX_PER_AREA,
  PHOTO_STEP_TEXT,
} from "../lib/content";
import { DEMO_PHOTO_TEXT } from "../lib/demoText";
import { compressPhotoForUpload } from "../lib/photo/compress";

type Props = {
  projectId: string;
  /** 撮り終えたあとの行き先。画面はどこへ行くかを自分で決めない。 */
  nextHref: string;
  /**
   * 箇所ごとの明細行ID（`lib/content.ts` の `lineIdByPhotoArea`）。
   * 対応する明細が無い箇所は null で、そこで撮った写真は書類の枠に入らない。
   */
  lineIdByArea: Record<string, string | null>;
  /** 既に撮ってある写真。D4 から「修正」で戻ったときに枚数と見え方を引き継ぐ。 */
  initialPhotos: PhotoWithUrl[];
};

/** 撮った写真を箇所ごとに並べる。何枚撮れたかが見えないと、上限まで撮れない。 */
function TakenPhotos({ photos }: { photos: PhotoWithUrl[] }) {
  const areasWithPhotos = PHOTO_AREAS.filter((value) =>
    photos.some((photo) => photo.area === value),
  );
  if (areasWithPhotos.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-bold">{PHOTO_STEP_TEXT.takenHeading}</h2>
      {areasWithPhotos.map((value) => {
        const inArea = photos.filter((photo) => photo.area === value);
        return (
          <div key={value}>
            <h3 className="text-sm text-gray-700">
              {`${value}　${PHOTO_STEP_TEXT.countLabel(inArea.length)}`}
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {inArea.map((photo, index) => (
                <li key={photo.id}>
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLは短命で都度発行するため next/image の最適化キャッシュと相性が悪い
                    <img
                      src={photo.url}
                      alt={PHOTO_STEP_TEXT.photoAlt(value, index + 1)}
                      className="aspect-square w-full rounded border-2 border-gray-300 object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded bg-gray-200" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/**
 * D3 写真を撮る（`docs/flows.md`「デモの画面の並び」）。
 *
 * **出るのは「箇所を選ぶ」「写真を撮る／写真なしで進む」「次へ」だけ。**
 * 表に無いボタン・画面・遷移は足さない（利用者との約束 2026-08-07）。
 *
 * 守っている決まりが3つある。
 * 1. **1箇所につき `PHOTO_MAX_PER_AREA` 枚まで。** 上限に達したら撮影を止める。
 * 2. **撮っても画面は移らない。** 移るのは「次へ」と「写真なしで進む」を押したときだけ。
 *    以前はここで撮影直後に遷移していたため、2枚目が撮れなかった（実機で報告された）。
 * 3. **撮った写真は、その箇所の工事の明細行に結びつける。** `lineId` を渡さないと
 *    `photos.line_id` が null になり、書類（`lib/db/quoteRequestDoc.ts`）は
 *    それを枠に入れないので、撮っても書類に1枚も出ない（同じく実機で報告された）。
 *
 * **失敗しても先へ進める。** 商談の場で写真が上がらなかったときに、そこでデモが
 * 終わってしまう方が損失が大きい。撮れたら付ける、駄目なら付けずに進む。
 */
export function DemoPhotoStep({
  projectId,
  nextHref,
  lineIdByArea,
  initialPhotos,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [area, setArea] = useState<string>(DEFAULT_PHOTO_AREA);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const takenInArea = photos.filter((photo) => photo.area === area).length;
  const isFull = takenInArea >= PHOTO_MAX_PER_AREA;
  const lineId = lineIdByArea[area] ?? null;

  /** 次の画面へ進む。「次へ」と「写真なしで進む」の行き先は同じ（表 D3）。 */
  function goNext(): void {
    startTransition(() => {
      router.push(nextHref);
    });
  }

  /** 撮った写真を圧縮して、いま選んでいる箇所の明細行に結びつけて保存する。 */
  function handleFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const input = event.target;
    const file = input.files?.[0];
    // 同じ箇所で続けて撮れるように、選択を空に戻す（同じファイル名でも onChange が起きる）。
    input.value = "";
    if (!file) return;

    const takenArea = area;
    const takenLineId = lineId;
    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressPhotoForUpload(file);
        const formData = new FormData();
        formData.append("photo", compressed, compressed.name || "photo.jpg");
        formData.append("area", takenArea);
        // 対応する明細が無い箇所では付けない（枠に入らない写真として残る）。
        if (takenLineId) formData.append("lineId", takenLineId);

        const photo = await uploadPhotoAction(projectId, formData);
        setPhotos((current) => [...current, photo]);
      } catch {
        // 写真はデモの主役ではない。付けられなかったことだけ伝えて、画面には留まる。
        setMessage(DEMO_PHOTO_TEXT.failed);
      }
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="demo-photo-area" className="font-bold">
          {PHOTO_STEP_TEXT.areaLabel}
        </label>
        <select
          id="demo-photo-area"
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
        <p className="text-sm text-gray-700">
          {PHOTO_STEP_TEXT.countLabel(takenInArea)}
        </p>
        {lineId === null ? (
          <p className="text-sm text-gray-700">{PHOTO_STEP_TEXT.noLineNote}</p>
        ) : null}
        {isFull ? (
          <p className="text-sm text-gray-700">
            {PHOTO_STEP_TEXT.limitReached}
          </p>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex flex-col gap-4">
        <button
          type="button"
          disabled={isPending || isFull}
          onClick={() => fileInputRef.current?.click()}
          className="tap flex items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white disabled:opacity-60"
        >
          {isPending ? DEMO_PHOTO_TEXT.uploading : DEMO_PHOTO_TEXT.take}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={goNext}
          className="tap flex items-center justify-center rounded border-2 border-gray-400 px-6 py-4 font-bold disabled:opacity-60"
        >
          {DEMO_PHOTO_TEXT.skip}
        </button>
      </div>

      {message ? <p className="text-gray-700">{message}</p> : null}

      <TakenPhotos photos={photos} />

      <button
        type="button"
        disabled={isPending}
        onClick={goNext}
        className="tap flex items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white disabled:opacity-60"
      >
        {PHOTO_STEP_TEXT.next}
      </button>
    </div>
  );
}
