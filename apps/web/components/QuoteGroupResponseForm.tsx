"use client";

// 下請の回答フォーム（作り直した版。ログイン不要）。
//
// 明細ごとに数量・単価を入れさせ、依頼全体に必要経費の内訳欄を出す
// （docs/design.md 3章。単価1つだけの形はガイドラインが望ましくない行為事例①、
// 内訳を書かない形は事例②として名指ししている）。
// **内訳は努力義務なので入力必須にしない。ただし欄は必ず出す**（欄が無ければ書けない）。

import { useState, useTransition } from "react";

import { submitQuoteGroupResponseAction } from "../app/q/[token]/group-actions";
import { QUOTE_GROUP_RESPONSE_TEXT } from "../lib/content";
import type { QuoteLineForSubcontractor } from "../lib/db/quoteRequestGroups";
import type { QuoteResponseCostBreakdown } from "../lib/db/types";
import { isValidNumberInput } from "../lib/estimateLineValidation";

/** 内訳の欄。未入力を許すので、空文字は null として送る。 */
const BREAKDOWN_FIELDS = [
  { key: "materialCost", label: QUOTE_GROUP_RESPONSE_TEXT.materialCostLabel },
  { key: "laborCost", label: QUOTE_GROUP_RESPONSE_TEXT.laborCostLabel },
  {
    key: "legalWelfareCost",
    label: QUOTE_GROUP_RESPONSE_TEXT.legalWelfareCostLabel,
  },
  {
    key: "safetyHealthCost",
    label: QUOTE_GROUP_RESPONSE_TEXT.safetyHealthCostLabel,
  },
  {
    key: "retirementMutualAidCost",
    label: QUOTE_GROUP_RESPONSE_TEXT.retirementMutualAidCostLabel,
  },
  { key: "workDays", label: QUOTE_GROUP_RESPONSE_TEXT.workDaysLabel },
] as const;

type BreakdownKey = (typeof BREAKDOWN_FIELDS)[number]["key"];

/** 空欄は「未入力」として null にする。0と書かれたら0のまま送る（区別を保つ）。 */
function toOptionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function QuoteGroupResponseForm({
  token,
  lines,
}: {
  token: string;
  lines: QuoteLineForSubcontractor[];
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, String(line.quantity)])),
  );
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, ""])),
  );
  const [breakdown, setBreakdown] = useState<Record<BreakdownKey, string>>({
    materialCost: "",
    laborCost: "",
    legalWelfareCost: "",
    safetyHealthCost: "",
    retirementMutualAidCost: "",
    workDays: "",
  });
  const [materialSuppliedNote, setMaterialSuppliedNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  // 明細の数量・単価は必須。内訳は努力義務なので、空欄でも送信できる。
  const linesValid = lines.every(
    (line) =>
      isValidNumberInput(quantities[line.id] ?? "") &&
      isValidNumberInput(unitPrices[line.id] ?? ""),
  );
  const breakdownValid = BREAKDOWN_FIELDS.every((field) => {
    const value = breakdown[field.key];
    return value.trim() === "" || isValidNumberInput(value);
  });
  const canSubmit = linesValid && breakdownValid;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) return;
    setErrorMessage(null);
    startSubmitting(async () => {
      try {
        const payload: QuoteResponseCostBreakdown = {
          materialCost: toOptionalNumber(breakdown.materialCost),
          laborCost: toOptionalNumber(breakdown.laborCost),
          legalWelfareCost: toOptionalNumber(breakdown.legalWelfareCost),
          safetyHealthCost: toOptionalNumber(breakdown.safetyHealthCost),
          retirementMutualAidCost: toOptionalNumber(
            breakdown.retirementMutualAidCost,
          ),
          workDays: toOptionalNumber(breakdown.workDays),
          materialSuppliedNote,
        };
        await submitQuoteGroupResponseAction(
          token,
          lines.map((line) => ({
            lineItemId: line.id,
            quantity: Number(quantities[line.id]),
            costUnitPrice: Number(unitPrices[line.id]),
          })),
          payload,
        );
        setSubmitted(true);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : QUOTE_GROUP_RESPONSE_TEXT.failed,
        );
      }
    });
  }

  if (submitted) {
    return (
      <p role="status" className="mt-6 font-bold">
        {QUOTE_GROUP_RESPONSE_TEXT.thanks}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-bold">
          {QUOTE_GROUP_RESPONSE_TEXT.linesHeading}
        </h2>
        <div className="mt-3 flex flex-col gap-5">
          {lines.map((line) => (
            <div
              key={line.id}
              className="rounded border-2 border-gray-400 p-4"
            >
              <div className="font-bold">{line.name}</div>
              {line.spec ? (
                <div className="text-gray-700">{line.spec}</div>
              ) : null}

              <label
                htmlFor={`quantity-${line.id}`}
                className="mt-3 block font-bold"
              >
                {`${QUOTE_GROUP_RESPONSE_TEXT.quantityLabel}（${line.unit}）`}
              </label>
              <input
                id={`quantity-${line.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantities[line.id] ?? ""}
                onChange={(event) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [line.id]: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded border-2 border-gray-400 px-3"
              />

              <label
                htmlFor={`unit-price-${line.id}`}
                className="mt-3 block font-bold"
              >
                {QUOTE_GROUP_RESPONSE_TEXT.costUnitPriceLabel}
              </label>
              <input
                id={`unit-price-${line.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={unitPrices[line.id] ?? ""}
                onChange={(event) =>
                  setUnitPrices((prev) => ({
                    ...prev,
                    [line.id]: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded border-2 border-gray-400 px-3"
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">
          {QUOTE_GROUP_RESPONSE_TEXT.breakdownHeading}
        </h2>
        <p className="mt-1 text-gray-700">
          {QUOTE_GROUP_RESPONSE_TEXT.breakdownNote}
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {BREAKDOWN_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className="block font-bold">
                {field.label}
              </label>
              <input
                id={field.key}
                type="number"
                inputMode="numeric"
                min={0}
                value={breakdown[field.key]}
                onChange={(event) =>
                  setBreakdown((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded border-2 border-gray-400 px-3"
              />
            </div>
          ))}
          <div>
            <label
              htmlFor="material-supplied-note"
              className="block font-bold"
            >
              {QUOTE_GROUP_RESPONSE_TEXT.materialSuppliedNoteLabel}
            </label>
            <input
              id="material-supplied-note"
              type="text"
              value={materialSuppliedNote}
              onChange={(event) => setMaterialSuppliedNote(event.target.value)}
              className="mt-1 w-full rounded border-2 border-gray-400 px-3"
            />
          </div>
        </div>
      </section>

      {!linesValid ? (
        <p role="alert" className="text-red-900">
          {QUOTE_GROUP_RESPONSE_TEXT.needAllLines}
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-red-900">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || isSubmitting}
        className="tap rounded bg-blue-700 font-bold text-white disabled:bg-gray-500"
      >
        {isSubmitting
          ? QUOTE_GROUP_RESPONSE_TEXT.submitting
          : QUOTE_GROUP_RESPONSE_TEXT.submit}
      </button>
    </form>
  );
}
