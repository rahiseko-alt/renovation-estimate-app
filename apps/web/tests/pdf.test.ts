import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";

import { calcEstimate, type EstimateLine } from "../lib/calc";
import { generateEstimatePdf, type EstimateDocumentInput } from "../lib/pdf/estimateDocument";

function line(partial: Partial<EstimateLine> = {}): EstimateLine {
  return {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: 1,
    unit: "㎡",
    unitPrice: 1000,
    taxCategory: "standard",
    ...partial,
  };
}

function input(partial: Partial<EstimateDocumentInput> = {}): EstimateDocumentInput {
  const lines = partial.lines ?? [line()];
  const totals = calcEstimate({ lines, overheadRatePercent: 10 });
  return {
    customerName: "山田太郎",
    siteAddress: "東京都千代田区1-1",
    lines,
    totals,
    issuedAt: new Date(2026, 7, 4),
    ...partial,
  };
}

describe("generateEstimatePdf", () => {
  it("PDFのマジックバイトで始まる", async () => {
    const bytes = await generateEstimatePdf(input());
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("生成したPDFを pdf-lib で読み直せる（壊れたPDFを作っていないことの確認）", async () => {
    const bytes = await generateEstimatePdf(input());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("明細が少なければ1ページに収まる", async () => {
    const bytes = await generateEstimatePdf(input());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("明細が多いと複数ページに分かれる（表を黙って途中で切らない）", async () => {
    const lines = Array.from({ length: 60 }, (_, i) =>
      line({ name: `工事項目${i + 1}` }),
    );
    const bytes = await generateEstimatePdf(input({ lines }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("値引き行があっても例外を投げない", async () => {
    const lines = [
      line({ quantity: 1, unitPrice: 100000 }),
      line({
        kind: "discount",
        name: "出精値引き",
        spec: "",
        quantity: 1,
        unit: "式",
        unitPrice: -10000,
      }),
    ];
    const bytes = await generateEstimatePdf(input({ lines }));
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("極端に長い工事項目名でも例外を投げない（省略記号で詰める）", async () => {
    const lines = [line({ name: "あ".repeat(200) })];
    const bytes = await generateEstimatePdf(input({ lines }));
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("単価が上限に近い金額でも例外を投げない（金額の桁を黙って削らない側の経路）", async () => {
    const lines = [line({ quantity: 1, unitPrice: 999_000_000 })];
    const bytes = await generateEstimatePdf(input({ lines }));
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("明細が0行でも例外を投げない", async () => {
    const bytes = await generateEstimatePdf(input({ lines: [] }));
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });
});
