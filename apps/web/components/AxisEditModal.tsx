"use client";

import { useState } from "react";

import type { AxisTickRole } from "./balanceChartHelpers";
import { AXIS_EDIT_TEXT } from "../lib/content";

interface AxisEditModalProps {
  role: AxisTickRole;
  currentValue: number;
  onApply: (value: number) => void;
  onReset: () => void;
  onClose: () => void;
}

const HEADING: Record<AxisTickRole, string> = {
  top: AXIS_EDIT_TEXT.headingTop,
  middle: AXIS_EDIT_TEXT.headingMiddle,
  bottom: AXIS_EDIT_TEXT.headingBottom,
};

/** グラフ縦軸の目盛り（上端・中間・下端）を任意の金額に上書きする窓。 */
export function AxisEditModal({
  role,
  currentValue,
  onApply,
  onReset,
  onClose,
}: AxisEditModalProps) {
  const [value, setValue] = useState(String(currentValue));
  const [error, setError] = useState(false);

  function handleApply() {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed)) {
      setError(true);
      return;
    }
    onApply(parsed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">{HEADING[role]}</h3>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-600">
          {AXIS_EDIT_TEXT.inputLabel}
          <input
            type="number"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            className="min-h-11 rounded-lg border border-gray-300 px-3 text-lg font-semibold text-gray-900"
            autoFocus
          />
        </label>
        {error ? <p className="mt-1 text-xs text-red-600">{AXIS_EDIT_TEXT.invalidNumber}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="min-h-11 rounded-lg bg-blue-600 text-sm font-semibold text-white"
          >
            {AXIS_EDIT_TEXT.applyButton}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReset}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-600"
            >
              {AXIS_EDIT_TEXT.resetButton}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-600"
            >
              {AXIS_EDIT_TEXT.cancelButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
