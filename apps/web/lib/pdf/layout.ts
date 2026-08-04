// PDF描画の共通部品（ページ送り・文字の描画・はみ出し対策）。
// 見積書に固有の内容（列・集計欄の文言など）は estimateDocument.ts 側に置き、
// ここは帳票の種類によらず使える低レベルな部品だけを持つ。

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export const BLACK = rgb(0, 0, 0);
export const GRAY = rgb(0.35, 0.35, 0.35);
export const LINE_GRAY = rgb(0.6, 0.6, 0.6);

export type Cursor = { page: PDFPage; y: number };

export function addPage(doc: PDFDocument, cursor: Cursor): void {
  cursor.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cursor.y = PAGE_HEIGHT - MARGIN;
}

export function newCursor(doc: PDFDocument): Cursor {
  return { page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };
}

/** 残り高さが足りなければ新しいページを足す。 */
export function ensureSpace(doc: PDFDocument, cursor: Cursor, height: number): void {
  if (cursor.y - height < MARGIN) {
    addPage(doc, cursor);
  }
}

/** 幅に収まるまで末尾を削って「…」を付ける。工事項目・摘要など自由記述の列専用。
 * 金額の列には使わない（金額を黙って削ると額面が変わって見えるため）。 */
export function fitText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let result = text;
  while (
    result.length > 0 &&
    font.widthOfTextAtSize(result + ellipsis, size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }
  return result.length > 0 ? result + ellipsis : ellipsis;
}

/** ページ全体を基準にした1行の文字列（タイトル・宛名など）。 */
export function drawLine(
  cursor: Cursor,
  font: PDFFont,
  text: string,
  size: number,
  align: "left" | "center" | "right",
  color = BLACK,
): void {
  const width = font.widthOfTextAtSize(text, size);
  const x =
    align === "center"
      ? (PAGE_WIDTH - width) / 2
      : align === "right"
        ? PAGE_WIDTH - MARGIN - width
        : MARGIN;
  cursor.page.drawText(text, { x, y: cursor.y, size, font, color });
}

/** 表の1マス（自由記述）。幅を超えたら省略記号で詰める。 */
export function drawTextCell(
  cursor: Cursor,
  font: PDFFont,
  text: string,
  size: number,
  x: number,
  width: number,
  align: "left" | "right",
  color = BLACK,
): void {
  const fitted = fitText(font, text, size, width);
  const textWidth = font.widthOfTextAtSize(fitted, size);
  const drawX = align === "right" ? x + width - textWidth : x;
  cursor.page.drawText(fitted, { x: drawX, y: cursor.y, size, font, color });
}

/**
 * 表の1マス（金額・数量）。省略記号では詰めない
 * （桁を黙って削ると額面が変わって見えるため）。幅を超えたら文字サイズを
 * 下げて収める。最小サイズでも収まらない極端な値は、はみ出したまま描く
 * （見た目で気付ける方が、黙って桁を削るより安全）。
 */
export function drawNumericCell(
  cursor: Cursor,
  font: PDFFont,
  text: string,
  baseSize: number,
  x: number,
  width: number,
  align: "left" | "right",
  color = BLACK,
): void {
  const MIN_SIZE = 6;
  let size = baseSize;
  while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > width) {
    size -= 0.5;
  }
  const textWidth = font.widthOfTextAtSize(text, size);
  const drawX = align === "right" ? x + width - textWidth : x;
  cursor.page.drawText(text, { x: drawX, y: cursor.y, size, font, color });
}

export function drawHorizontalRule(cursor: Cursor): void {
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: cursor.y },
    thickness: 1,
    color: LINE_GRAY,
  });
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
