"use client";

// PR-B・スパイク（docs/plan-rebuild.md B-1）。
//
// 目的は1つだけ：書類ビュー＋シートが実機のスマホで成立するかを外部事実にする。
// 保存もDBも無い使い捨て。様式はベタ書き、対象の箇所は1つだけ（キッチン工事）。
// 検証は実機のスマホで行う（docs/design.md 7章「現場画面：書類は見せる、入力は
// シートで受ける」）。S1〜S6 のどれかが崩れたら本実装（テンプレート抽出）に進まず、
// 見せ方を設計判断としてやり直す。
//
// 通ってから apps/web/lib/doc/ にテンプレート層として抽出する
// （AGENTS.md「実装の進め方」：入口から出口までを1回通してから中身を作り込む）。

import { useEffect, useRef, useState } from "react";

// 96dpi換算のA4縦（design.md 7章の計算値）。書類はこの実寸で組み、
// 画面幅に合わせて縮小表示する。
const A4_WIDTH_PX = 793.7;
const A4_HEIGHT_PX = 1122.5;

// 写真枠は200px四方（design.md 7章：0.47倍に縮小しても実効95pxを保てるため、
// 書類の上で直接タップできる唯一の要素にできる）。
const PHOTO_FRAME_PX = 200;

// 行ブロックの最小高さ。0.47倍に縮小しても効果的な高さを保つため、
// 48pxタップ目標に近づくよう十分な余白を取る。
const ROW_MIN_HEIGHT_PX = 100;

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export default function DocumentSpikePage() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / A4_WIDTH_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    // 同じファイルを選び直しても onChange が発火するようにする。
    event.target.value = "";
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <p className="mb-4 rounded border-2 border-blue-700 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        実機確認用のスパイクです（保存されません）。書類の「キッチン工事」の行を
        親指で押してください。行の中の写真枠は直接押すとカメラが開きます。
      </p>

      {/* 書類ビュー：実寸で組み、幅に合わせて縮小する。 */}
      <div ref={wrapperRef} className="w-full overflow-hidden">
        <div
          style={{
            width: A4_WIDTH_PX,
            height: A4_HEIGHT_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="border border-gray-400 bg-white"
        >
          <div style={{ padding: 32 }}>
            <h1
              style={{ fontSize: 22, textAlign: "center", fontWeight: 700 }}
            >
              御見積依頼書
            </h1>

            <dl style={{ marginTop: 24, fontSize: 14, lineHeight: 1.8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <dt style={{ width: 96, color: "#555" }}>工事名称</dt>
                <dd>サンプル様邸 リフォーム工事</dd>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <dt style={{ width: 96, color: "#555" }}>施工場所</dt>
                <dd>東京都渋谷区サンプル1-2-3</dd>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <dt style={{ width: 96, color: "#555" }}>見積回答期限</dt>
                <dd>2026年8月20日まで</dd>
              </div>
            </dl>

            <h2
              style={{
                marginTop: 32,
                fontSize: 16,
                fontWeight: 700,
                borderBottom: "2px solid #333",
                paddingBottom: 8,
              }}
            >
              工事内容
            </h2>

            {/* この行だけが対話可能な唯一の箇所（スパイクの範囲）。 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSheetOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSheetOpen(true);
                }
              }}
              style={{
                minHeight: ROW_MIN_HEIGHT_PX,
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderBottom: "1px solid #ccc",
                padding: "12px 0",
                cursor: "pointer",
              }}
            >
              {/* 写真枠：書類の上で直接押せる（行ブロックのクリックとは独立させる）。 */}
              <label
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: PHOTO_FRAME_PX,
                  height: PHOTO_FRAME_PX,
                  flexShrink: 0,
                  border: "2px dashed #999",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999",
                  overflow: "hidden",
                }}
              >
                {photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoDataUrl}
                    alt="キッチンの現況写真"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <CameraIcon />
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </label>

              <div style={{ flex: 1, fontSize: 15 }}>
                <div style={{ fontWeight: 700 }}>キッチン工事</div>
                <div style={{ marginTop: 4, color: quantity ? "#111" : "#999" }}>
                  {quantity ? `数量：${quantity} 式` : "数量未入力"}
                </div>
              </div>
            </div>

            <p style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
              ※ 責任施工範囲・施工条件等の定型文は、会社設定の初期値がここに
              印字されます（このスパイクでは省略）。
            </p>
          </div>
        </div>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold">キッチン工事</h2>

            <label className="tap mt-4 flex items-center justify-center gap-2 border-2 border-dashed border-gray-400 text-gray-600">
              {photoDataUrl ? "撮り直す" : "写真を撮る"}
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
                alt="キッチンの現況写真"
                className="mt-3 w-full rounded"
              />
            ) : null}

            <label htmlFor="spike-quantity" className="mt-5 block font-bold">
              数量（式）
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
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
