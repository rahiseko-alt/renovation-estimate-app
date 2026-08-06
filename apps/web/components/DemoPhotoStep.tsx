"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { uploadPhotoAction } from "../app/projects/[id]/photos-actions";
import { DEFAULT_PHOTO_AREA } from "../lib/content";
import { DEMO_PHOTO_TEXT } from "../lib/demoText";
import { compressPhotoForUpload } from "../lib/photo/compress";

type Props = {
  projectId: string;
  /** 撮り終えたあとの行き先。画面はどこへ行くかを自分で決めない。 */
  nextHref: string;
};

/**
 * デモの2タップ目。撮ると比較表へ着地する。
 *
 * **失敗しても先へ進める。** 商談の場で写真が上がらなかったときに、
 * そこでデモが終わってしまう方が損失が大きい。撮れたら付ける、
 * 駄目なら付けずに進む、のどちらでも同じ画面にたどり着く。
 */
export function DemoPhotoStep({ projectId, nextHref }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** 写真を付けずに次へ進む。 */
  function goNext(): void {
    startTransition(() => {
      router.push(nextHref);
    });
  }

  /** 撮った写真を圧縮して案件に付け、成否によらず次の画面へ進む。 */
  function handleFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      try {
        const compressed = await compressPhotoForUpload(file);
        const formData = new FormData();
        formData.append("photo", compressed);
        formData.append("area", DEFAULT_PHOTO_AREA);
        await uploadPhotoAction(projectId, formData);
      } catch {
        // 写真はデモの主役ではない。付けられなかったことだけ伝えて先へ進む。
        setMessage(DEMO_PHOTO_TEXT.failed);
      }
      router.push(nextHref);
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <button
        type="button"
        disabled={isPending}
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

      {message ? <p className="text-gray-700">{message}</p> : null}
    </div>
  );
}
