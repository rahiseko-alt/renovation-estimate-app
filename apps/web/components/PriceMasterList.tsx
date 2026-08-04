import { deletePriceMasterItemAction } from "../app/price-master/actions";
import { formatYen } from "../lib/calc";
import { PRICE_MASTER_TEXT, TAX_CATEGORY_LABELS } from "../lib/content";
import type { PriceMasterItem } from "../lib/db/types";

type Props = {
  items: PriceMasterItem[];
};

/** 単価マスタの一覧と削除フォーム。 */
export function PriceMasterList({ items }: Props) {
  if (items.length === 0) {
    return <p className="mt-4 text-gray-700">{PRICE_MASTER_TEXT.empty}</p>;
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded border-2 border-gray-400 p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold">{item.name}</span>
            <span className="tabular font-bold">
              {formatYen(item.unitPrice)}円 / {item.unit}
            </span>
          </div>
          {item.spec ? (
            <span className="text-gray-700">{item.spec}</span>
          ) : null}
          <span className="text-sm text-gray-700">
            {TAX_CATEGORY_LABELS[item.taxCategory]}
          </span>
          <form action={deletePriceMasterItemAction}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className="tap self-start rounded border-2 border-red-700 px-4 py-2 font-bold text-red-900"
            >
              {PRICE_MASTER_TEXT.delete}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
