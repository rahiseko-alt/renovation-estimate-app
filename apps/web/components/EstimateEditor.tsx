"use client";

import { useState, useTransition } from "react";

import { saveEstimateAction } from "../app/projects/[id]/estimate/actions";
import {
  calcEstimate,
  formatYen,
  type EstimateLine,
  type EstimateTotals,
} from "../lib/calc";
import {
  ESTIMATE_EDITOR_TEXT,
  ESTIMATE_TOTALS_TEXT,
  OVERHEAD_TEXT,
  UNITS,
} from "../lib/content";
import type { PriceMasterItem } from "../lib/db/types";
import { isValidNumberInput } from "../lib/estimateLineValidation";
import { EstimateLineRow, type EditableLine } from "./EstimateLineRow";
import { PriceMasterPicker } from "./PriceMasterPicker";

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `line-${nextKey}`;
}

function toEditableLine(line: EstimateLine): EditableLine {
  return {
    key: newKey(),
    kind: line.kind,
    name: line.name,
    spec: line.spec,
    quantity: String(line.quantity),
    unit: line.unit,
    unitPrice: String(line.unitPrice),
    taxCategory: line.taxCategory,
  };
}

/** isValidNumberInput（lib/estimateLineValidation）で確かめた後にだけ呼ぶ。数値化できる前提で変換する。 */
function parseEstimateLine(line: EditableLine): EstimateLine {
  return {
    kind: line.kind,
    name: line.name,
    spec: line.spec,
    quantity: Number(line.quantity),
    unit: line.unit,
    unitPrice: Number(line.unitPrice),
    taxCategory: line.taxCategory,
  };
}

function emptyLine(): EditableLine {
  return {
    key: newKey(),
    kind: "item",
    name: "",
    spec: "",
    quantity: "1",
    unit: UNITS[0],
    unitPrice: "0",
    taxCategory: "standard",
  };
}

function lineFromMasterItem(item: PriceMasterItem): EditableLine {
  return {
    key: newKey(),
    kind: "item",
    name: item.name,
    spec: item.spec,
    quantity: "1",
    unit: item.unit,
    unitPrice: String(item.unitPrice),
    taxCategory: item.taxCategory,
  };
}

const TOTALS_ROWS: {
  label: keyof typeof ESTIMATE_TOTALS_TEXT;
  amount: (totals: EstimateTotals) => number;
}[] = [
  {
    label: "directCostSubtotal",
    amount: (totals) => totals.directCostSubtotal,
  },
  { label: "overhead", amount: (totals) => totals.overheadAmount },
  { label: "discount", amount: (totals) => totals.discountAmount },
  { label: "netAmount", amount: (totals) => totals.netAmount },
  { label: "tax", amount: (totals) => totals.taxAmount },
  { label: "grandTotal", amount: (totals) => totals.grandTotal },
];

type Props = {
  projectId: string;
  initialLines: EstimateLine[];
  initialOverheadRatePercent: number;
  /** 呼び出せる単価マスタの一覧（この案件の持ち主のもの）。 */
  priceMasterItems: PriceMasterItem[];
};

/** 見積エディタ。明細の追加・編集・削除と、合計のリアルタイム表示を行う。 */
export function EstimateEditor({
  projectId,
  initialLines,
  initialOverheadRatePercent,
  priceMasterItems,
}: Props) {
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialLines.map(toEditableLine),
  );
  const [overheadRatePercent, setOverheadRatePercent] = useState(
    String(initialOverheadRatePercent),
  );
  const [saved, setSaved] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(
    null,
  );
  const [isSaving, startSaving] = useTransition();

  function updateLine(key: string, patch: Partial<EditableLine>): void {
    setSaved(false);
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string): void {
    setSaved(false);
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function addLine(): void {
    setSaved(false);
    setLines((prev) => [...prev, emptyLine()]);
  }

  function addLineFromMaster(item: PriceMasterItem): void {
    setSaved(false);
    setLines((prev) => [...prev, lineFromMasterItem(item)]);
  }

  const invalidQuantityKeys = new Set(
    lines.filter((line) => !isValidNumberInput(line.quantity)).map((l) => l.key),
  );
  const invalidUnitPriceKeys = new Set(
    lines
      .filter((line) => !isValidNumberInput(line.unitPrice))
      .map((l) => l.key),
  );
  const overheadRateValid = isValidNumberInput(overheadRatePercent);
  const hasInputError =
    invalidQuantityKeys.size > 0 ||
    invalidUnitPriceKeys.size > 0 ||
    !overheadRateValid;

  function handleSave(): void {
    if (hasInputError) return; // 保存ボタンは無効化済みだが、念のため二重に止める
    const validLines = lines.map(parseEstimateLine);
    const rate = Number(overheadRatePercent);
    setSaveErrorMessage(null);
    startSaving(async () => {
      try {
        await saveEstimateAction(projectId, validLines, rate);
        setSaved(true);
      } catch (error) {
        setSaveErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }

  let totals: EstimateTotals | null = null;
  let calcErrorMessage: string | null = null;
  if (hasInputError) {
    calcErrorMessage = ESTIMATE_EDITOR_TEXT.invalidNumberSummary;
  } else {
    try {
      totals = calcEstimate({
        lines: lines.map(parseEstimateLine),
        overheadRatePercent: Number(overheadRatePercent),
      });
    } catch (error) {
      calcErrorMessage =
        error instanceof Error ? error.message : String(error);
    }
  }

  // totals は let で持つため、JSX 内のコールバックに渡す前に const へ写して
  // null の絞り込みを固定する（クロージャ内で絞り込みが失われる場合がある）。
  const resolvedTotals = totals;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {lines.map((line) => (
          <EstimateLineRow
            key={line.key}
            line={line}
            quantityInvalid={invalidQuantityKeys.has(line.key)}
            unitPriceInvalid={invalidUnitPriceKeys.has(line.key)}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => removeLine(line.key)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={addLine}
        className="tap rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {ESTIMATE_EDITOR_TEXT.addLine}
      </button>

      <PriceMasterPicker items={priceMasterItems} onAdd={addLineFromMaster} />

      <div className="rounded border-2 border-gray-400 p-4">
        <label className="font-bold" htmlFor="overheadRate">
          {OVERHEAD_TEXT.rateLabel}
        </label>
        <input
          id="overheadRate"
          type="text"
          inputMode="decimal"
          value={overheadRatePercent}
          onChange={(e) => {
            setSaved(false);
            setOverheadRatePercent(e.target.value);
          }}
          aria-invalid={!overheadRateValid}
          className={`tabular mt-2 w-full rounded border-2 px-4 py-3 ${
            overheadRateValid
              ? "border-gray-500"
              : "border-red-700 bg-red-50"
          }`}
        />
        {overheadRateValid ? null : (
          <p role="alert" className="mt-2 text-sm text-red-900">
            {ESTIMATE_EDITOR_TEXT.invalidNumberField}
          </p>
        )}
        <p className="mt-2 text-sm text-gray-700">
          {OVERHEAD_TEXT.noDefaultNote}
        </p>
      </div>

      {calcErrorMessage ? (
        <p
          role="alert"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {calcErrorMessage}
        </p>
      ) : resolvedTotals !== null ? (
        <dl className="rounded border-2 border-gray-400 p-4">
          {TOTALS_ROWS.map((row) => (
            <div key={row.label} className="flex justify-between py-1">
              <dt>{ESTIMATE_TOTALS_TEXT[row.label]}</dt>
              <dd className="tabular font-bold">
                {formatYen(row.amount(resolvedTotals))}円
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || calcErrorMessage !== null}
        className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {ESTIMATE_EDITOR_TEXT.save}
      </button>

      {saveErrorMessage ? (
        <p
          role="alert"
          className="rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {saveErrorMessage}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-green-800">
          {ESTIMATE_EDITOR_TEXT.saved}
        </p>
      ) : null}
    </div>
  );
}
