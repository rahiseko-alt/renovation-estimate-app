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
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      // 実寸より広い画面では拡大しない（1倍を上限にする）。
      if (width) setScale(Math.min(width / pageWidthPx, 1));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [pageWidthPx]);

  return (
    <div ref={wrapperRef} className="doc-print-root w-full overflow-hidden">
      <div
        className="doc-scaler"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
