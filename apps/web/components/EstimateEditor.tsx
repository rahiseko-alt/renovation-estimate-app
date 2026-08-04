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
import { EstimateLineRow, type EditableLine } from "./EstimateLineRow";

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

/** 数値に変換できない行（入力途中の空欄など）は集計・保存の対象から外す。 */
function toEstimateLine(line: EditableLine): EstimateLine | null {
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
  return {
    kind: line.kind,
    name: line.name,
    spec: line.spec,
    quantity,
    unit: line.unit,
    unitPrice,
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
};

/** 見積エディタ。明細の追加・編集・削除と、合計のリアルタイム表示を行う。 */
export function EstimateEditor({
  projectId,
  initialLines,
  initialOverheadRatePercent,
}: Props) {
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialLines.map(toEditableLine),
  );
  const [overheadRatePercent, setOverheadRatePercent] = useState(
    String(initialOverheadRatePercent),
  );
  const [saved, setSaved] = useState(false);
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

  function handleSave(): void {
    const validLines = lines
      .map(toEstimateLine)
      .filter((line): line is EstimateLine => line !== null);
    const rate = Number(overheadRatePercent);
    startSaving(async () => {
      await saveEstimateAction(
        projectId,
        validLines,
        Number.isFinite(rate) ? rate : 0,
      );
      setSaved(true);
    });
  }

  const overheadRateNumber = Number(overheadRatePercent);
  let totals = null;
  let calcErrorMessage: string | null = null;
  try {
    const validLines = lines
      .map(toEstimateLine)
      .filter((line): line is EstimateLine => line !== null);
    totals = calcEstimate({
      lines: validLines,
      overheadRatePercent: Number.isFinite(overheadRateNumber)
        ? overheadRateNumber
        : 0,
    });
  } catch (error) {
    calcErrorMessage = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {lines.map((line) => (
          <EstimateLineRow
            key={line.key}
            line={line}
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
          className="tabular mt-2 w-full rounded border-2 border-gray-500 px-4 py-3"
        />
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
      ) : totals ? (
        <dl className="rounded border-2 border-gray-400 p-4">
          {TOTALS_ROWS.map((row) => (
            <div key={row.label} className="flex justify-between py-1">
              <dt>{ESTIMATE_TOTALS_TEXT[row.label]}</dt>
              <dd className="tabular font-bold">
                {formatYen(row.amount(totals))}円
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="tap rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        {ESTIMATE_EDITOR_TEXT.save}
      </button>

      {saved ? (
        <p role="status" className="text-green-800">
          {ESTIMATE_EDITOR_TEXT.saved}
        </p>
      ) : null}
    </div>
  );
}
