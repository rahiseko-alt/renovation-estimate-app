"use client";

import { useState, useTransition } from "react";

import { submitQuoteResponseAction } from "../app/q/[token]/actions";
import { QUOTE_RESPONSE_TEXT } from "../lib/content";
import { isValidNumberInput } from "../lib/estimateLineValidation";

type Props = {
  token: string;
};

/**
 * 下請の回答フォーム。原価単価だけを入力させる（ログイン不要）。
 * 送信できたら、フォームを感謝の文言に置き換える（もう一度は開けない画面にする）。
 */
export function QuoteResponseForm({ token }: Props) {
  const [costUnitPrice, setCostUnitPrice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const valid = isValidNumberInput(costUnitPrice);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!valid) return;
    setErrorMessage(null);
    startSubmitting(async () => {
      try {
        await submitQuoteResponseAction(token, Number(costUnitPrice));
        setSubmitted(true);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : QUOTE_RESPONSE_TEXT.failed,
        );
      }
    });
  }

  if (submitted) {
    return (
      <p role="status" className="mt-6 text-lg font-bold text-green-800">
        {QUOTE_RESPONSE_TEXT.thanks}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="costUnitPrice" className="text-sm font-bold">
          {QUOTE_RESPONSE_TEXT.costUnitPriceLabel}
        </label>
        <input
          id="costUnitPrice"
          type="text"
          inputMode="decimal"
          value={costUnitPrice}
          onChange={(e) => setCostUnitPrice(e.target.value)}
          aria-invalid={costUnitPrice !== "" && !valid}
          className="tabular rounded border-2 border-gray-500 px-4 py-3"
        />
        {costUnitPrice !== "" && !valid ? (
          <p role="alert" className="text-sm text-red-900">
            {QUOTE_RESPONSE_TEXT.invalidCostUnitPrice}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!valid || isSubmitting}
        className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {isSubmitting ? QUOTE_RESPONSE_TEXT.submitting : QUOTE_RESPONSE_TEXT.submit}
      </button>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
