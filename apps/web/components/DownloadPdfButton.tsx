"use client";

import { useState, useTransition } from "react";

import { generateEstimatePdfAction } from "../app/projects/[id]/pdf-actions";
import { PROJECT_DETAIL_TEXT } from "../lib/content";

/**
 * `label` は押す前に出す文字だけを差し替える。**PDFを出す処理は1つのまま**
 * （AGENTS.md「同じ処理を呼ぶ入口は1つにする」）。D7 だけ「見積書を出す」と呼ぶ
 * ため（docs/flows.md「デモの画面の並び」）に足したもので、省くとこれまでどおり
 * PROJECT_DETAIL_TEXT.pdfLink になる。作成中の文字は経路によらず同じ。
 */
type Props = { projectId: string; label?: string };

function downloadBase64Pdf(base64: string, filename: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 見積書PDFのダウンロードボタン。生成はサーバー側、保存はブラウザ側で行う。 */
export function DownloadPdfButton({
  projectId,
  label = PROJECT_DETAIL_TEXT.pdfLink,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick(): void {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const { base64, filename } = await generateEstimatePdfAction(projectId);
        downloadBase64Pdf(base64, filename);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="tap flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold disabled:opacity-50"
      >
        {isPending ? PROJECT_DETAIL_TEXT.pdfGenerating : label}
      </button>
      {errorMessage ? (
        <p
          role="alert"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
