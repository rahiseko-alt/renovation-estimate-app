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
  /** 数量が数字として読めないとき true（保存から静かに消さず、その場で知らせるため）。 */
  quantityInvalid: boolean;
  /** 単価が数字として読めないとき true。 */
  unitPriceInvalid: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
};

const NUMBER_FIELD_BASE = "tabular rounded border-2 px-3 py-3";
const NUMBER_FIELD_VALID = `${NUMBER_FIELD_BASE} border-gray-500`;
const NUMBER_FIELD_INVALID = `${NUMBER_FIELD_BASE} border-red-700 bg-red-50`;

/**
 * 見積エディタの明細1行。入力の見た目だけを持ち、状態は親（EstimateEditor）が持つ。
 * すべての入力欄の id は line.key から作る（行が増減しても他の行と衝突しない）。
 * ラベルは htmlFor で対応する入力欄と結び付け、支援技術が読み上げられるようにする。
 */
export function EstimateLineRow({
  line,
  quantityInvalid,
  unitPriceInvalid,
  onChange,
  onRemove,
}: Props) {
  const kindId = `${line.key}-kind`;
  const nameId = `${line.key}-name`;
  const specId = `${line.key}-spec`;
  const quantityId = `${line.key}-quantity`;
  const quantityErrorId = `${quantityId}-error`;
  const unitId = `${line.key}-unit`;
  const unitPriceId = `${line.key}-unitPrice`;
  const unitPriceErrorId = `${unitPriceId}-error`;
  const taxCategoryId = `${line.key}-taxCategory`;

  return (
    <li className="flex flex-col gap-3 rounded border-2 border-gray-400 p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={kindId} className="text-sm font-bold">
          {ESTIMATE_COLUMNS.kind}
        </label>
        <select
          id={kindId}
          value={line.kind}
          onChange={(e) => onChange({ kind: e.target.value as LineKind })}
          className="rounded border-2 border-gray-500 px-2 py-3"
        >
          <option value="item">{ESTIMATE_EDITOR_TEXT.kindItem}</option>
          <option value="discount">{ESTIMATE_EDITOR_TEXT.kindDiscount}</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-bold">
          {ESTIMATE_COLUMNS.name}
        </label>
        <input
          id={nameId}
          type="text"
          value={line.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="rounded border-2 border-gray-500 px-4 py-3"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={specId} className="text-sm font-bold">
          {ESTIMATE_COLUMNS.spec}
        </label>
        <input
          id={specId}
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
          <label htmlFor={quantityId} className="text-sm font-bold">
            {ESTIMATE_COLUMNS.quantity}
          </label>
          <input
            id={quantityId}
            type="text"
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            aria-invalid={quantityInvalid}
            aria-describedby={quantityInvalid ? quantityErrorId : undefined}
            className={
              quantityInvalid ? NUMBER_FIELD_INVALID : NUMBER_FIELD_VALID
            }
          />
          {quantityInvalid ? (
            <p id={quantityErrorId} role="alert" className="text-sm text-red-900">
              {ESTIMATE_EDITOR_TEXT.invalidNumberField}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={unitId} className="text-sm font-bold">
            {ESTIMATE_COLUMNS.unit}
          </label>
          <select
            id={unitId}
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
          <label htmlFor={unitPriceId} className="text-sm font-bold">
            {ESTIMATE_COLUMNS.unitPrice}
          </label>
          <input
            id={unitPriceId}
            type="text"
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            aria-invalid={unitPriceInvalid}
            aria-describedby={unitPriceInvalid ? unitPriceErrorId : undefined}
            className={
              unitPriceInvalid ? NUMBER_FIELD_INVALID : NUMBER_FIELD_VALID
            }
          />
          {unitPriceInvalid ? (
            <p id={unitPriceErrorId} role="alert" className="text-sm text-red-900">
              {ESTIMATE_EDITOR_TEXT.invalidNumberField}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={taxCategoryId} className="text-sm font-bold">
          {ESTIMATE_COLUMNS.taxCategory}
        </label>
        <select
          id={taxCategoryId}
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
