"use client";

// PR-B・書類UI（docs/plan-rebuild.md B-1 / B-2 / B-3）。
//
// 書類ビュー＋シート＋印刷を、テンプレート層（lib/doc/）から描く画面。
// まだ保存もDBも繋いでいない（データは固定値。PR-Cで案件のデータに繋ぐ）。
//
// 様式をベタ書きしていた初版から、テンプレート駆動に置き換えた。様式を差し替える
// ときに触るのは lib/doc/templates/quote-request.ts だけになる。

import { useState } from "react";

import { DocumentCanvas } from "../../../components/DocumentCanvas";
import { QUOTE_REQUEST_TEMPLATE } from "../../../lib/doc/templates/quote-request";
import { DocumentView } from "../../../lib/doc/render/html";
import type { DocData } from "../../../lib/doc/schema";
import { SPIKE_TEXT } from "../../../lib/content";

const LINE_ID = "spike-line-1";

// 実データに繋ぐまでの仮の中身（PR-Cで案件・見積・写真に置き換える）。
const BASE_DATA: DocData = {
  workName: "東京都渋谷区サンプル1-2-3 リフォーム工事",
  siteAddress: "東京都渋谷区サンプル1-2-3",
  customerName: "",
  responseDueAt: new Date("2026-08-20T00:00:00+09:00"),
  issuedAt: new Date("2026-08-06T00:00:00+09:00"),
  lines: [
    {
      id: LINE_ID,
      kind: "item",
      name: "キッチン工事",
      spec: "",
      quantity: 0,
      unit: "式",
      unitPrice: 0,
      taxCategory: "standard",
    },
  ],
  totals: null,
  photoUrlByLineId: { [LINE_ID]: null },
  legalItems: [
    { label: "責任施工範囲", body: "本書に記載の工事範囲一式とします。" },
    { label: "工事着手・完了の時期", body: "着工日は別途協議のうえ決定します。" },
    { label: "建設副産物の運搬・処理", body: "元請の負担とします。" },
  ],
};

export default function DocumentSpikePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    // 同じファイルを選び直しても onChange が発火するようにする。
    event.target.value = "";
  }

  const parsedQuantity = Number(quantity);
  const data: DocData = {
    ...BASE_DATA,
    lines: [
      {
        ...BASE_DATA.lines[0]!,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
      },
    ],
    photoUrlByLineId: { [LINE_ID]: photoDataUrl },
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <p className="doc-screen-only mb-4 rounded border-2 border-blue-700 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        {SPIKE_TEXT.note}
      </p>

      <div className="doc-screen-only mb-4 flex gap-3">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="tap flex-1 rounded bg-blue-700 px-4 font-bold text-white"
        >
          {SPIKE_TEXT.openSheet}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="tap flex-1 rounded border-2 border-blue-700 px-4 font-bold text-blue-700"
        >
          {SPIKE_TEXT.print}
        </button>
      </div>

      {/* 書類ビュー：読み取り専用。押せるのは行ブロックと写真枠だけ。 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={SPIKE_TEXT.openSheet}
        onClick={() => setSheetOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSheetOpen(true);
          }
        }}
        className="cursor-pointer"
      >
        <DocumentCanvas pageWidthPx={QUOTE_REQUEST_TEMPLATE.pageWidthPx}>
          <DocumentView
            template={QUOTE_REQUEST_TEMPLATE}
            data={data}
            audience="subcontractor"
          />
        </DocumentCanvas>
      </div>

      {sheetOpen ? (
        <div
          className="doc-screen-only fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold">{data.lines[0]!.name}</h2>

            <label className="tap mt-4 flex items-center justify-center gap-2 border-2 border-dashed border-gray-400 text-gray-600">
              {photoDataUrl ? SPIKE_TEXT.retakePhoto : SPIKE_TEXT.takePhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="sr-only"
              />
            </label>

            {photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoDataUrl}
                alt={`${data.lines[0]!.name}の現況写真`}
                className="mt-3 w-full rounded"
              />
            ) : null}

            <label htmlFor="spike-quantity" className="mt-5 block font-bold">
              {`${SPIKE_TEXT.quantityLabel}（${data.lines[0]!.unit}）`}
            </label>
            <input
              id="spike-quantity"
              type="number"
              inputMode="decimal"
              min={0}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-2 w-full rounded border-2 border-gray-400 px-3"
            />

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="tap mt-6 w-full rounded bg-blue-700 font-bold text-white"
            >
              {SPIKE_TEXT.closeSheet}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
