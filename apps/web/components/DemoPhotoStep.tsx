"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  uploadPhotoAction,
  type PhotoWithUrl,
} from "../app/projects/[id]/photos-actions";
import { PHOTO_MAX_PER_LINE, PHOTO_STEP_TEXT } from "../lib/content";
import { DEMO_PHOTO_TEXT } from "../lib/demoText";
import { compressPhotoForUpload } from "../lib/photo/compress";

/**
 * 枠1つぶん＝見積の明細行1件。**枠がそのまま書類の枠になる。**
 * `area` は `photos.area`（必須の列）に入れる値で、決めるのは
 * `lib/content.ts` の `photoAreaForLineName`（画面は箇所を選ばせない）。
 */
export type PhotoLine = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  area: string;
};

type Props = {
  projectId: string;
  /** 撮り終えたあとの行き先。画面はどこへ行くかを自分で決めない。 */
  nextHref: string;
  /** 枠として並べる工事。並び順は見積の明細のまま（書類と同じ順で見える）。 */
  lines: PhotoLine[];
  /** 既に撮ってある写真。D4 から「修正」で戻ったときに枚数と見え方を引き継ぐ。 */
  initialPhotos: PhotoWithUrl[];
};

/**
 * 工事1件ぶんの枠。**枠そのものが撮影のボタン**で、押すとこの工事の撮影になる。
 *
 * 枠の中に出すのは、工事名・数量と単位・撮れた枚数・撮った写真。
 * 数量と単位を添えるのは、書類の明細と同じ見え方にして、撮った写真が
 * そのままこの行の枠に入ると伝えるため（docs/flows.md の D3）。
 *
 * `<ul>` を中に入れない（button の中に置けるのは phrasing content だけ）。
 */
function WorkLineFrame({
  line,
  photos,
  disabled,
  onPick,
}: {
  line: PhotoLine;
  photos: PhotoWithUrl[];
  disabled: boolean;
  onPick: (line: PhotoLine) => void;
}) {
  const isFull = photos.length >= PHOTO_MAX_PER_LINE;
  // **書類に載る写真と同じものを見せる。** 書類（lib/db/quoteRequestDoc.ts）は
  // 上限を超えた行では**新しいほうから**上限枚を採る。ここで古いほうから採ると、
  // 撮り直したのに枠の中身が変わらず、書類だけが変わる。
  const shown = photos.slice(-PHOTO_MAX_PER_LINE);

  return (
    <button
      type="button"
      disabled={disabled || isFull}
      onClick={() => onPick(line)}
      className="tap flex w-full flex-col gap-3 rounded border-2 border-dashed border-blue-800 bg-blue-50 p-4 text-left disabled:border-gray-400 disabled:bg-gray-100"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">{line.name}</span>
        <span className="shrink-0 text-sm text-gray-700">
          {PHOTO_STEP_TEXT.quantityLabel(line.quantity, line.unit)}
        </span>
      </span>

      {/* 押せる場所だと分かる形にする。**別のボタンではない**（枠ごと1つのボタン）。 */}
      <span className="flex items-center justify-between gap-3 text-sm">
        <span
          className={
            isFull
              ? "rounded bg-gray-300 px-3 py-1 font-bold text-gray-700"
              : "rounded bg-blue-800 px-3 py-1 font-bold text-white"
          }
        >
          {isFull ? PHOTO_STEP_TEXT.limitReached : DEMO_PHOTO_TEXT.take}
        </span>
        <span className="text-gray-700">
          {PHOTO_STEP_TEXT.countLabel(photos.length)}
        </span>
      </span>

      {/* 上限ぶんの枠を最初から出す。何枚撮れるかが、押す前に見えている必要がある。 */}
      <span className="grid grid-cols-3 gap-2">
        {Array.from({ length: PHOTO_MAX_PER_LINE }, (_, index) => {
          const photo = shown[index];
          if (photo?.url) {
            return (
              // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLは短命で都度発行するため next/image の最適化キャッシュと相性が悪い
              <img
                key={photo.id}
                src={photo.url}
                alt={PHOTO_STEP_TEXT.photoAlt(line.name, index + 1)}
                className="aspect-square w-full rounded border-2 border-gray-300 object-cover"
              />
            );
          }
          return (
            <span
              key={photo?.id ?? `empty-${index}`}
              className={
                photo
                  ? "aspect-square w-full rounded bg-gray-200"
                  : "aspect-square w-full rounded border border-dashed border-gray-400 bg-white"
              }
            />
          );
        })}
      </span>
    </button>
  );
}

/**
 * D3 写真を撮る（`docs/flows.md`「デモの画面の並び」）。
 *
 * **出るのは「工事の枠」「写真なしで進む」「次へ」だけ。**
 * 表に無いボタン・画面・遷移は足さない（利用者との約束 2026-08-07）。
 *
 * 守っている決まりが3つある。
 * 1. **枠を押すと、その工事の撮影になる。** 箇所（`WORK_AREAS`）を選ばせる形は
 *    2026-08-07 にやめた。選択肢が8つしか無く、デモの明細のうち給排水設備工事と
 *    解体・廃棄物処理費が**どうやっても撮れず、書類の枠が2つ永久に空**だった
 *    （実機の撮影で分かった）。枠＝明細行そのものなので、語彙とずれようがない。
 * 2. **1枠につき `PHOTO_MAX_PER_LINE` 枚まで。** 上限に達した枠は押せなくする。
 * 3. **撮っても画面は移らない。** 移るのは「次へ」と「写真なしで進む」を押したときだけ。
 *    以前はここで撮影直後に遷移していたため、2枚目が撮れなかった（実機で報告された）。
 *
 * **失敗しても先へ進める。** 商談の場で写真が上がらなかったときに、そこでデモが
 * 終わってしまう方が損失が大きい。撮れたら付ける、駄目なら付けずに進む。
 */
export function DemoPhotoStep({
  projectId,
  nextHref,
  lines,
  initialPhotos,
}: Props) {
  const router = useRouter();
  // **隠し input は1つを使い回す**（枠ごとには置かない）。枠ごとに置くと、明細が
  // 増えたぶんだけ隠し input が並び、押した枠との対応を DOM の構造が持つことになる。
  const fileInputRef = useRef<HTMLInputElement>(null);
  // いま撮ろうとしている枠。**state ではなく ref で持つ。** 画面の見た目を変えない
  // 一時的な値で、state にすると押した直後の再描画を待ってからでないと撮影を開けない。
  const pickedLineRef = useRef<PhotoLine | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>(initialPhotos);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** 次の画面へ進む。「次へ」と「写真なしで進む」の行き先は同じ（表 D3）。 */
  function goNext(): void {
    startTransition(() => {
      router.push(nextHref);
    });
  }

  /** 枠を押した。どの枠かを覚えてから、カメラ（ファイル選択）を開く。 */
  function pickLine(line: PhotoLine): void {
    pickedLineRef.current = line;
    fileInputRef.current?.click();
  }

  /** 撮った写真を圧縮して、押した枠の明細行に結びつけて保存する。 */
  function handleFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const input = event.target;
    const file = input.files?.[0];
    // 同じ枠で続けて撮れるように、選択を空に戻す（同じファイル名でも onChange が起きる）。
    input.value = "";
    const line = pickedLineRef.current;
    pickedLineRef.current = null;
    if (!file || !line) return;

    setMessage(null);
    startTransition(async () => {
      try {
        const compressed = await compressPhotoForUpload(file);
        const formData = new FormData();
        formData.append("photo", compressed, compressed.name || "photo.jpg");
        // area は photos の必須の列。値は明細名から決まる（lib/content.ts）。
        formData.append("area", line.area);
        // これを付けないと、撮っても書類のどの枠にも入らない（lib/db/quoteRequestDoc.ts）。
        formData.append("lineId", line.id);

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <ul className="flex flex-col gap-4">
        {lines.map((line) => (
          <li key={line.id}>
            <WorkLineFrame
              line={line}
              photos={photos.filter((photo) => photo.lineId === line.id)}
              disabled={isPending}
              onPick={pickLine}
            />
          </li>
        ))}
      </ul>

      {isPending ? (
        <p className="text-gray-700">{DEMO_PHOTO_TEXT.uploading}</p>
      ) : null}
      {message ? <p className="text-gray-700">{message}</p> : null}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          disabled={isPending}
          onClick={goNext}
          className="tap flex items-center justify-center rounded border-2 border-gray-400 px-6 py-4 font-bold disabled:opacity-60"
        >
          {DEMO_PHOTO_TEXT.skip}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={goNext}
          className="tap flex items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white disabled:opacity-60"
        >
          {PHOTO_STEP_TEXT.next}
        </button>
      </div>
    </div>
  );
}
