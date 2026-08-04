"use client";

import { useState } from "react";

import { formatYen } from "../lib/calc";
import { PRICE_MASTER_TEXT } from "../lib/content";
import type { PriceMasterItem } from "../lib/db/types";

type Props = {
  items: PriceMasterItem[];
  onAdd: (item: PriceMasterItem) => void;
};

/** 見積エディタから単価マスタの項目を選んで明細行として追加する部品。 */
export function PriceMasterPicker({ items, onAdd }: Props) {
  const [selectedId, setSelectedId] = useState(() => items[0]?.id ?? "");

  return (
    <div className="rounded border-2 border-gray-400 p-4">
      <label className="font-bold" htmlFor="priceMasterSelect">
        {PRICE_MASTER_TEXT.addFromMasterLabel}
      </label>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-700">
          {PRICE_MASTER_TEXT.addFromMasterEmpty}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <select
            id="priceMasterSelect"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 rounded border-2 border-gray-500 px-2 py-3"
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}（{formatYen(item.unitPrice)}円/{item.unit}）
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const item = items.find((i) => i.id === selectedId);
              if (item) onAdd(item);
            }}
            className="tap rounded border-2 border-gray-500 px-5 py-3 font-bold"
          >
            {PRICE_MASTER_TEXT.addFromMasterButton}
          </button>
        </div>
      )}
    </div>
  );
}
