import { describe, expect, it, vi } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { getComparisonForProject } from "../lib/db/comparison";
import { seedDemoData } from "../lib/db/demoSeed";
import type { EstimateDocumentInput } from "../lib/pdf/estimateDocument";

/**
 * **見積書PDFに何を渡しているか**を直接見る検査。
 *
 * 3タップ目に出た書類が全行0円だった（`docs/failures.md` 2026-08-06）。
 * 比較表の合計を見る検査（`scripts/prod-demo-check.sh`）だけでは、
 * **このアクションだけが保存済みの0円データに戻ったときに気づけない**
 * （比較表が正しければ本番スモークは緑のまま。CodeRabbit の指摘）。
 *
 * PDFのバイト列から金額は読めない（埋め込みフォントのグリフになることを実測で確認した）。
 * そこで、書類を組み立てる関数への**入力**を捕まえて、そこに採用単価が乗っているかを見る。
 * `generateEstimatePdf` 自体は本物をそのまま呼ぶので、PDFが壊れれば従来どおり落ちる。
 */
const currentUser = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../lib/auth/server", () => ({
  getCurrentUser: async () => currentUser.value,
}));

const lastPdfInput = vi.hoisted(() => ({
  value: null as EstimateDocumentInput | null,
}));
vi.mock("../lib/pdf/estimateDocument", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../lib/pdf/estimateDocument")>();
  return {
    ...original,
    generateEstimatePdf: async (input: EstimateDocumentInput) => {
      lastPdfInput.value = input;
      return original.generateEstimatePdf(input);
    },
  };
});

const { generateEstimatePdfAction } = await import(
  "../app/projects/[id]/pdf-actions"
);

/** 捕まえた入力。まだ呼ばれていなければ落とす（見ていないのに緑にしない）。 */
function capturedPdfInput(): EstimateDocumentInput {
  const input = lastPdfInput.value;
  if (!input) throw new Error("generateEstimatePdf が呼ばれていない");
  return input;
}

describe("generateEstimatePdfAction", () => {
  it("デモのまま押すと、全明細が採用した単価で書類に渡る（0円で出ない）", async () => {
    const ownerId = newDemoOwnerId();
    currentUser.value = ownerId;
    lastPdfInput.value = null;
    const projectId = await seedDemoData(ownerId);

    const result = await generateEstimatePdfAction(projectId);
    expect(result.filename).toBe(`estimate-${projectId}.pdf`);
    expect(Buffer.from(result.base64, "base64").subarray(0, 5).toString()).toBe(
      "%PDF-",
    );

    const input = capturedPdfInput();
    expect(input.lines.length).toBeGreaterThan(0);
    for (const line of input.lines) {
      expect(line.unitPrice, `${line.name} の単価`).toBeGreaterThan(0);
    }
    expect(input.totals.grandTotal).toBeGreaterThan(0);
  });

  it("書類の合計が、比較表に出している合計と一致する", async () => {
    // 画面で見せた金額と、その場で出した書類の金額が違うと商談がそこで終わる。
    const ownerId = newDemoOwnerId();
    currentUser.value = ownerId;
    lastPdfInput.value = null;
    const projectId = await seedDemoData(ownerId);

    await generateEstimatePdfAction(projectId);
    const comparison = await getComparisonForProject(projectId, ownerId);

    expect(capturedPdfInput().totals.grandTotal).toBe(
      comparison.adoptedTotals.grandTotal,
    );
  });

  it("他人の案件IDを知っていても書類は出ない（IDOR対策）", async () => {
    const ownerA = newDemoOwnerId();
    currentUser.value = ownerA;
    const projectId = await seedDemoData(ownerA);

    currentUser.value = newDemoOwnerId();
    await expect(generateEstimatePdfAction(projectId)).rejects.toThrow(
      "案件が見つかりません。",
    );
  });

  it("ログインしていなければ書類は出ない", async () => {
    const ownerId = newDemoOwnerId();
    currentUser.value = ownerId;
    const projectId = await seedDemoData(ownerId);

    currentUser.value = null;
    await expect(generateEstimatePdfAction(projectId)).rejects.toThrow(
      "ログインしていません。",
    );
  });
});
