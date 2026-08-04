import type { LineKind, TaxCategory } from "../lib/calc";
import {
  ESTIMATE_COLUMNS,
  ESTIMATE_EDITOR_TEXT,
  LUMP_SUM_SPEC_HINT,
  TAX_CATEGORY_LABELS,
  UNITS,
} from "../lib/content";

/** 明細1行の入力中の値。空欄・変換不能な入力も許すため、数値も文字列で持つ。 */
export type EditableLine = {
  key: string;
  kind: LineKind;
  name: string;
  spec: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxCategory: TaxCategory;
};

const TAX_CATEGORIES = Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[];

type Props = {
  line: EditableLine;
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
};

/** 見積エディタの明細1行。入力の見た目だけを持ち、状態は親（EstimateEditor）が持つ。 */
export function EstimateLineRow({ line, onChange, onRemove }: Props) {
  return (
    <li className="flex flex-col gap-3 rounded border-2 border-gray-400 p-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold">種別</label>
        <select
          value={line.kind}
          onChange={(e) => onChange({ kind: e.target.value as LineKind })}
          className="rounded border-2 border-gray-500 px-2 py-3"
        >
          <option value="item">{ESTIMATE_EDITOR_TEXT.kindItem}</option>
          <option value="discount">{ESTIMATE_EDITOR_TEXT.kindDiscount}</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold">{ESTIMATE_COLUMNS.name}</label>
        <input
          type="text"
          value={line.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="rounded border-2 border-gray-500 px-4 py-3"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold">{ESTIMATE_COLUMNS.spec}</label>
        <input
          type="text"
          value={line.spec}
          onChange={(e) => onChange({ spec: e.target.value })}
          className="rounded border-2 border-gray-500 px-4 py-3"
        />
        {line.unit === "式" ? (
          <p className="text-sm text-gray-700">{LUMP_SUM_SPEC_HINT}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold">
            {ESTIMATE_COLUMNS.quantity}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className="tabular rounded border-2 border-gray-500 px-3 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold">{ESTIMATE_COLUMNS.unit}</label>
          <select
            value={line.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="rounded border-2 border-gray-500 px-2 py-3"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold">
            {ESTIMATE_COLUMNS.unitPrice}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            className="tabular rounded border-2 border-gray-500 px-3 py-3"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold">税区分</label>
        <select
          value={line.taxCategory}
          onChange={(e) =>
            onChange({ taxCategory: e.target.value as TaxCategory })
          }
          className="rounded border-2 border-gray-500 px-2 py-3"
        >
          {TAX_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {TAX_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="tap rounded border-2 border-red-700 px-4 py-3 font-bold text-red-900"
      >
        {ESTIMATE_EDITOR_TEXT.deleteLine}
      </button>
    </li>
  );
}
