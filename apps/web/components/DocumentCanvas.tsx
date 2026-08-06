"use client";

// 書類を画面幅に合わせて縮小して見せる入れ物。
//
// docs/design.md 7章「現場画面：書類は見せる、入力はシートで受ける」：
// A4縦（793.7px）を幅375pxのスマホに収める倍率は0.47で、本文16pxは実効7.6px、
// タップ48pxは実効22.7pxになる。だから**書類は読み取り専用の縮小ビューとして見せ、
// 入力は等倍のシートで受ける**。ここが担うのは縮小表示だけで、入力は受けない。
//
// 印刷時は縮小を外して実寸で出す（app/globals.css の @media print が
// .doc-print-root .doc-scaler の transform を消す）。

import { useEffect, useRef, useState, type ReactNode } from "react";

export function DocumentCanvas({
  pageWidthPx,
  children,
}: {
  pageWidthPx: number;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const scaler = scalerRef.current;
    if (!wrapper || !scaler) return;

    // transform: scale() は**レイアウト上の高さを縮めない**。書類の実寸（A4縦で
    // 1122.5px）がそのまま場所を取り続けるので、0.47倍のときは書類の下に
    // 600px近い空白が残り、指で送っても何も無い領域を延々とたどることになる。
    // 縮小後の高さを親に持たせて、書類の見えている大きさと場所取りを一致させる。
    const update = (): void => {
      const width = wrapper.clientWidth;
      if (!width) return;
      // 実寸より広い画面では拡大しない（1倍を上限にする）。
      const next = Math.min(width / pageWidthPx, 1);
      setScale(next);
      setScaledHeight(scaler.scrollHeight * next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    observer.observe(scaler);
    return () => observer.disconnect();
  }, [pageWidthPx]);

  return (
    <div
      ref={wrapperRef}
      className="doc-print-root w-full overflow-hidden"
      // 印刷時は実寸で出すため、この高さを CSS 側で auto に戻す（globals.css）。
      style={scaledHeight === null ? undefined : { height: scaledHeight }}
    >
      <div
        ref={scalerRef}
        className="doc-scaler"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
