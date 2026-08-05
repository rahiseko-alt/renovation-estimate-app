"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { requestQuoteAction } from "../app/projects/[id]/estimate/quote-actions";
import { MAX_MARKUP_RATE } from "../lib/calc";
import { QUOTE_REQUEST_FORM_TEXT } from "../lib/content";
import { isValidNumberInput } from "../lib/estimateLineValidation";

type Item = {
  name: string;
  spec: string;
  quantity: number;
  unit: string;
  taxCategory: string;
};

type Props = {
  projectId: string;
  item: Item;
};

/**
 * 見積エディタの明細1行（工事）に出す、下請への依頼ボタン。
 * 開く・掛率を入れる・リンクを発行する・コピーするまでを自己完結で持つ
 * （DownloadPdfButton.tsx と同じ、状態を自分だけで持つボタン部品のパターン）。
 * 発行したリンクはこのボタンの中にだけ出す。永続的な一覧は
 * QuoteRequestsList（見積エディタの外、依頼の一覧）が別に持つ。
 */
export function QuoteRequestButton({ projectId, item }: Props) {
  const router = useRouter();
  const markupInputId = useId();
  const [open, setOpen] = useState(false);
  const [markupRate, setMarkupRate] = useState("1");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  // requestQuoteAction（サーバー側）は MAX_MARKUP_RATE を超える掛率を弾く。
  // ここで同じ上限を見ておかないと、送信ボタンが有効なままサーバー側でだけ弾かれ、
  // 汎用の失敗文言しか出せない（AGENTS.md「結合を増やさない」1：同じ値を1箇所に）。
  const markupRateValid =
    isValidNumberInput(markupRate) &&
    Number(markupRate) >= 0 &&
    Number(markupRate) <= MAX_MARKUP_RATE;

  function handleOpen(): void {
    setOpen(true);
    setLink(null);
    setCopied(false);
    setErrorMessage(null);
  }

  function handleSubmit(): void {
    if (!markupRateValid) return;
    setErrorMessage(null);
    startSubmitting(async () => {
      try {
        const quoteRequest = await requestQuoteAction(
          projectId,
          item,
          Number(markupRate),
        );
        setLink(`${window.location.origin}/q/${quoteRequest.token}`);
        // 下請への依頼一覧（QuoteRequestsList）は Server Component 側から
        // initialQuoteRequests を受け取るだけで自前の状態を持たないため、
        // router.refresh() で再取得すればここで作った依頼がそのまま並ぶ。
        // このボタン自身の開閉・発行済みリンクの表示はローカル state なので、
        // refresh() では消えない（見積の estimate.updatedAt は変わらないため
        // EstimateEditor 自体も作り直されない）。
        router.refresh();
      } catch {
        setErrorMessage(QUOTE_REQUEST_FORM_TEXT.failed);
      }
    });
  }

  function handleCopy(): void {
    if (!link) return;
    setErrorMessage(null);
    navigator.clipboard.writeText(link).then(
      () => setCopied(true),
      () => setErrorMessage(QUOTE_REQUEST_FORM_TEXT.copyFailed),
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="tap rounded border-2 border-gray-500 px-4 py-3 text-sm font-bold"
      >
        {QUOTE_REQUEST_FORM_TEXT.openButton}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border-2 border-gray-400 p-3">
      {link ? (
        <>
          <p className="text-sm">{QUOTE_REQUEST_FORM_TEXT.linkReady}</p>
          <p className="tabular break-all rounded bg-gray-100 p-2 text-sm">{link}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="tap rounded border-2 border-gray-500 px-4 py-3 text-sm font-bold"
          >
            {copied ? QUOTE_REQUEST_FORM_TEXT.copied : QUOTE_REQUEST_FORM_TEXT.copyButton}
          </button>
        </>
      ) : (
        <>
          <label htmlFor={markupInputId} className="text-sm font-bold">
            {QUOTE_REQUEST_FORM_TEXT.markupRateLabel}
          </label>
          <input
            id={markupInputId}
            type="text"
            inputMode="decimal"
            value={markupRate}
            onChange={(e) => setMarkupRate(e.target.value)}
            aria-invalid={!markupRateValid}
            className="tabular rounded border-2 border-gray-500 px-3 py-3"
          />
          <p className="text-sm text-gray-700">{QUOTE_REQUEST_FORM_TEXT.markupRateHint}</p>
          {!markupRateValid ? (
            <p role="alert" className="text-sm text-red-900">
              {QUOTE_REQUEST_FORM_TEXT.invalidMarkupRate}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!markupRateValid || isSubmitting}
              className="tap rounded bg-blue-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSubmitting
                ? QUOTE_REQUEST_FORM_TEXT.submitting
                : QUOTE_REQUEST_FORM_TEXT.submit}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap rounded border-2 border-gray-500 px-4 py-3 text-sm font-bold"
            >
              {QUOTE_REQUEST_FORM_TEXT.cancel}
            </button>
          </div>
        </>
      )}

      {errorMessage ? (
        <p role="alert" className="text-sm text-red-900">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
