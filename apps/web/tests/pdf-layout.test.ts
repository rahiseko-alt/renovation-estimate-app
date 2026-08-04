import { PDFDocument } from "@cantoo/pdf-lib";
import * as fontkit from "fontkit";
import { beforeAll, describe, expect, it } from "vitest";

import { loadRegularFontBytes } from "../lib/pdf/fonts";
import { fitText } from "../lib/pdf/layout";

// fitText は PDFFont（文字幅を計測できるもの）を要求するので、
// 生成PDFと同じ組み合わせ（@cantoo/pdf-lib + fontkit）で1つだけ埋め込んで使い回す。
let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  // @types/fontkit と @cantoo/pdf-lib の Fontkit 型が完全には一致しない
  // （lib/pdf/estimateDocument.ts と同じ回避）。
  doc.registerFontkit(fontkit as unknown as Parameters<typeof doc.registerFontkit>[0]);
  font = await doc.embedFont(loadRegularFontBytes(), { subset: true });
});

const SIZE = 10;

describe("fitText", () => {
  it("幅に収まる文字列はそのまま返す", () => {
    const text = "クロス張替え";
    expect(fitText(font, text, SIZE, 1000)).toBe(text);
  });

  it("幅を超えたら省略記号で詰め、結果が幅に収まる", () => {
    const text = "あ".repeat(50);
    const maxWidth = font.widthOfTextAtSize("あ".repeat(10), SIZE);
    const result = fitText(font, text, SIZE, maxWidth);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(text.length);
    expect(font.widthOfTextAtSize(result, SIZE)).toBeLessThanOrEqual(maxWidth);
  });

  it("省略記号1文字すら収まらない極端に狭い幅でも、省略記号だけを返す（はみ出しても例外は投げない）", () => {
    const text = "あ".repeat(50);
    const result = fitText(font, text, SIZE, 0.001);
    expect(result).toBe("…");
  });

  it("削れるだけ削った結果は、1文字多い候補より必ず幅が収まる側にある（二分探索の境界が正しい）", () => {
    const text = "リフォーム工事の御見積書".repeat(3);
    const maxWidth = font.widthOfTextAtSize(text, SIZE) / 2;
    const result = fitText(font, text, SIZE, maxWidth);
    const kept = result.slice(0, -1); // 末尾の「…」を除いた本体
    const oneMore = text.slice(0, kept.length + 1) + "…";
    expect(font.widthOfTextAtSize(result, SIZE)).toBeLessThanOrEqual(maxWidth);
    expect(font.widthOfTextAtSize(oneMore, SIZE)).toBeGreaterThan(maxWidth);
  });
});
