// 見積書PDFの生成。画面と同じく lib/calc.ts が計算した結果だけを使い、
// ここで金額を再計算しない（AGENTS.md「結合を増やさない」2）。
//
// 住宅リフォーム推進協議会「住宅リフォーム工事 御見積書」書式Ⅳ-1 を土台にした
// レイアウト。会社情報（請負者名・代表者・住所・印）を入力する画面がまだ無いため、
// その欄は省略している（docs/handoff.md 参照。設定画面ができたら追加する）。

import { PDFDocument, type PDFFont } from "@cantoo/pdf-lib";
import * as fontkit from "fontkit";

import { formatYen, lineAmount, type EstimateLine, type EstimateTotals } from "../calc";
import {
  ESTIMATE_COLUMN_HEADINGS,
  ESTIMATE_DOCUMENT_TEXT,
  ESTIMATE_TOTALS_AMOUNT_BY_KEY,
  ESTIMATE_TOTALS_ROWS,
} from "../doc/templates/estimate";
import { loadBoldFontBytes, loadRegularFontBytes } from "./fonts";
import {
  CONTENT_WIDTH,
  GRAY,
  MARGIN,
  addPage,
  drawHorizontalRule,
  drawLine,
  drawNumericCell,
  drawTextCell,
  ensureSpace,
  formatDate,
  newCursor,
  type Cursor,
} from "./layout";

export type EstimateDocumentInput = {
  customerName: string;
  siteAddress: string;
  lines: EstimateLine[];
  totals: EstimateTotals;
  issuedAt: Date;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

type ColumnKey = "name" | "spec" | "quantity" | "unit" | "unitPrice" | "amount";
type Column = { key: ColumnKey; width: number; align: "left" | "right" };

// 種別・税区分は画面編集用の列で、協議会様式の4列相当
// （工事項目／摘要／数量・単位・単価／金額）には無いため出さない。
const COLUMNS: Column[] = [
  { key: "name", width: 140, align: "left" },
  { key: "spec", width: 115, align: "left" },
  { key: "quantity", width: 55, align: "right" },
  { key: "unit", width: 35, align: "right" },
  { key: "unitPrice", width: 85, align: "right" },
  { key: "amount", width: 85, align: "right" },
];

const TABLE_FONT_SIZE = 9;
const ROW_HEIGHT = 20;

// 印字される言葉と並び順は書類テンプレートが持つ（docs/design.md 7章）。
const TOTALS_ROWS: {
  key: (typeof ESTIMATE_TOTALS_ROWS)[number]["key"];
  label: string;
  amount: (totals: EstimateTotals) => number;
}[] = ESTIMATE_TOTALS_ROWS.map((row) => ({
  key: row.key,
  label: row.label,
  amount: ESTIMATE_TOTALS_AMOUNT_BY_KEY[row.key],
}));

function drawHeaderBlock(cursor: Cursor, fonts: Fonts, input: EstimateDocumentInput): void {
  drawLine(cursor, fonts.bold, ESTIMATE_DOCUMENT_TEXT.title, 20, "center");
  cursor.y -= 30;

  const issuedLabel = `${ESTIMATE_DOCUMENT_TEXT.issuedAtLabel}：${formatDate(input.issuedAt)}`;
  drawLine(cursor, fonts.regular, issuedLabel, 10, "right", GRAY);
  cursor.y -= 22;

  const recipient = `${input.customerName}${ESTIMATE_DOCUMENT_TEXT.recipientSuffix}`;
  drawLine(cursor, fonts.bold, recipient, 16, "left");
  cursor.y -= 20;

  drawLine(cursor, fonts.regular, input.siteAddress, 10, "left", GRAY);
  cursor.y -= 24;
}

function drawTableHeaderRow(cursor: Cursor, fonts: Fonts): void {
  let x = MARGIN;
  for (const col of COLUMNS) {
    drawTextCell(cursor, fonts.bold, ESTIMATE_COLUMN_HEADINGS[col.key], TABLE_FONT_SIZE, x, col.width, col.align);
    x += col.width;
  }
  cursor.y -= 6;
  drawHorizontalRule(cursor);
  cursor.y -= ROW_HEIGHT;
}

/** 明細1行分の表示値。値引き行の金額欄だけ「▲」表記にする（協議会様式の慣行）。 */
function lineCellValues(line: EstimateLine): Record<ColumnKey, string> {
  const amount = lineAmount(line);
  const amountText =
    line.kind === "discount" ? `▲${formatYen(Math.abs(amount))}` : formatYen(amount);
  return {
    name: line.name,
    spec: line.spec,
    quantity: String(line.quantity),
    unit: line.unit,
    unitPrice: formatYen(line.unitPrice),
    amount: amountText,
  };
}

function drawEstimateLineRow(cursor: Cursor, fonts: Fonts, line: EstimateLine): void {
  const values = lineCellValues(line);
  let x = MARGIN;
  for (const col of COLUMNS) {
    const text = values[col.key];
    if (col.key === "unitPrice" || col.key === "amount") {
      drawNumericCell(cursor, fonts.regular, text, TABLE_FONT_SIZE, x, col.width, col.align);
    } else {
      drawTextCell(cursor, fonts.regular, text, TABLE_FONT_SIZE, x, col.width, col.align);
    }
    x += col.width;
  }
  cursor.y -= ROW_HEIGHT;
}

function drawTable(doc: PDFDocument, cursor: Cursor, fonts: Fonts, lines: EstimateLine[]): void {
  ensureSpace(doc, cursor, ROW_HEIGHT * 3);
  drawTableHeaderRow(cursor, fonts);

  for (const line of lines) {
    if (cursor.y - ROW_HEIGHT < MARGIN) {
      addPage(doc, cursor);
      drawTableHeaderRow(cursor, fonts);
    }
    drawEstimateLineRow(cursor, fonts, line);
  }
}

function drawTotalsBlock(doc: PDFDocument, cursor: Cursor, fonts: Fonts, totals: EstimateTotals): void {
  ensureSpace(doc, cursor, ROW_HEIGHT * (TOTALS_ROWS.length + 2));
  cursor.y -= 10;

  const labelX = MARGIN + CONTENT_WIDTH - 220;
  const valueRight = MARGIN + CONTENT_WIDTH;

  for (const row of TOTALS_ROWS) {
    const isGrandTotal = row.key === "grandTotal";
    const font = isGrandTotal ? fonts.bold : fonts.regular;
    const size = isGrandTotal ? 13 : 10;

    cursor.page.drawText(row.label, {
      x: labelX,
      y: cursor.y,
      size,
      font,
    });
    const amountText = `${formatYen(row.amount(totals))}円`;
    const amountWidth = font.widthOfTextAtSize(amountText, size);
    cursor.page.drawText(amountText, {
      x: valueRight - amountWidth,
      y: cursor.y,
      size,
      font,
    });
    cursor.y -= isGrandTotal ? 24 : 18;
  }
}

function drawFooterNotes(doc: PDFDocument, cursor: Cursor, fonts: Fonts): void {
  ensureSpace(doc, cursor, 60);
  cursor.y -= 16;
  drawLine(cursor, fonts.regular, ESTIMATE_DOCUMENT_TEXT.attachmentNote, 9, "left", GRAY);
  cursor.y -= 16;
  drawLine(cursor, fonts.regular, ESTIMATE_DOCUMENT_TEXT.keepNote, 9, "left", GRAY);
}

export async function generateEstimatePdf(input: EstimateDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // @types/fontkit の型定義は @cantoo/pdf-lib が期待する Fontkit 型と
  // 完全には一致しない（Font 型に持たせているプロパティの過不足）。
  // 実際の埋め込み・サブセット化は動作確認済み（lib/pdf/fonts.ts のコメント参照）。
  doc.registerFontkit(fontkit as unknown as Parameters<typeof doc.registerFontkit>[0]);

  const regular = await doc.embedFont(loadRegularFontBytes(), { subset: true });
  const bold = await doc.embedFont(loadBoldFontBytes(), { subset: true });
  const fonts: Fonts = { regular, bold };

  const cursor = newCursor(doc);

  drawHeaderBlock(cursor, fonts, input);
  drawTable(doc, cursor, fonts, input.lines);
  drawTotalsBlock(doc, cursor, fonts, input.totals);
  drawFooterNotes(doc, cursor, fonts);

  return doc.save();
}
