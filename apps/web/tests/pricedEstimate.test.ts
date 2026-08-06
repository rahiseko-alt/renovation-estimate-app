import { describe, expect, it } from "vitest";

import { getComparisonForProject } from "../lib/db/comparison";
import { appendEstimateLine, saveEstimate } from "../lib/db/estimates";
import { adoptLine, cancelLineAdoption } from "../lib/db/lineAdoptions";
import { getPricedEstimate } from "../lib/db/pricedEstimate";
import { createProject } from "../lib/db/projects";
import { createQuoteGroupResponse } from "../lib/db/quoteGroupResponses";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../lib/db/subcontractors";

const OWNER_A = "priced-a@example.com";
const OWNER_B = "priced-b@example.com";

/** 保存されている単価（元請が見積エディタで入れたぶん）。 */
const SAVED_UNIT_PRICE_ONE = 1_000;
const SAVED_UNIT_PRICE_TWO = 2_000;
/** 下請が返してきた原価単価。保存値とは必ず違う値にする（差が見えないと検査にならない）。 */
const COST_A_ONE = 3_300;
const COST_A_TWO = 4_400;
const COST_B_ONE = 5_500;

const QUANTITY_ONE = 10;
const QUANTITY_TWO = 4;

/**
 * 明細2行・下請2社・回答2件まで作った案件を用意する。
 * 保存されている単価と下請の原価単価の両方が入っているので、
 * 「どちらが見積書に出ているか」を金額で見分けられる。
 */
async function setup(label: string) {
  const project = await createProject(
    { customerName: label, siteAddress: `${label}の現場` },
    OWNER_A,
  );
  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);

  // 既定行（解体・廃棄物処理費）に1行足して2行にし、両方に保存単価を入れ直す。
  const appended = await appendEstimateLine(project.id, {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: QUANTITY_ONE,
    unit: "㎡",
    unitPrice: 0,
    taxCategory: "standard",
  });
  const estimate = await saveEstimate(
    project.id,
    appended.lines.map((line, index) => ({
      ...line,
      quantity: index === 0 ? QUANTITY_ONE : QUANTITY_TWO,
      unitPrice: index === 0 ? SAVED_UNIT_PRICE_ONE : SAVED_UNIT_PRICE_TWO,
    })),
    0,
  );

  const lineOne = estimate.lines[0]!.id;
  const lineTwo = estimate.lines[1]!.id;

  async function requestTo(companyName: string, email: string) {
    const subcontractor = await createSubcontractor(
      { companyName, email },
      OWNER_A,
    );
    return createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [lineOne, lineTwo],
      },
      OWNER_A,
    );
  }

  const requestA = await requestTo(`${label}社A`, `${label}-a@example.com`);
  const requestB = await requestTo(`${label}社B`, `${label}-b@example.com`);

  const breakdown = {
    materialCost: 100_000,
    laborCost: 100_000,
    legalWelfareCost: 14_000,
    safetyHealthCost: null,
    retirementMutualAidCost: null,
    workDays: 3,
    materialSuppliedNote: "",
  };
  await createQuoteGroupResponse({
    token: requestA.token,
    breakdown,
    lines: [
      { lineItemId: lineOne, quantity: QUANTITY_ONE, costUnitPrice: COST_A_ONE },
      { lineItemId: lineTwo, quantity: QUANTITY_TWO, costUnitPrice: COST_A_TWO },
    ],
  });
  await createQuoteGroupResponse({
    token: requestB.token,
    breakdown,
    lines: [
      { lineItemId: lineOne, quantity: QUANTITY_ONE, costUnitPrice: COST_B_ONE },
    ],
  });

  return { project, lineOne, lineTwo, requestA, requestB };
}

/** 明細IDから単価を引く（どの行が動いたかを名指しで見るため）。 */
function unitPriceOf(
  lines: ReadonlyArray<{ id: string; unitPrice: number }>,
  lineItemId: string,
): number {
  const line = lines.find((candidate) => candidate.id === lineItemId);
  if (!line) throw new Error(`明細 ${lineItemId} が見積に無い`);
  return line.unitPrice;
}

/**
 * 見積書に出る単価は「保存された単価」ではなく「採用した下請の単価」。
 * ここが保存値だけを見ていたため、比較表に3社の単価が並んでいるのに
 * 見積書は全行0円だった（`docs/failures.md` 2026-08-06）。
 */
describe("getPricedEstimate", () => {
  it("採用が1件も無ければ、保存されている単価のまま", async () => {
    const { project, lineOne, lineTwo } = await setup("価格1");

    const priced = await getPricedEstimate(project.id, OWNER_A);

    expect(unitPriceOf(priced.lines, lineOne)).toBe(SAVED_UNIT_PRICE_ONE);
    expect(unitPriceOf(priced.lines, lineTwo)).toBe(SAVED_UNIT_PRICE_TWO);
    expect(priced.totals.directCostSubtotal).toBe(
      SAVED_UNIT_PRICE_ONE * QUANTITY_ONE + SAVED_UNIT_PRICE_TWO * QUANTITY_TWO,
    );
  });

  it("採用した明細は下請の原価単価に置き換わり、採用していない明細は保存値のまま", async () => {
    const { project, lineOne, lineTwo, requestA } = await setup("価格2");

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );

    const priced = await getPricedEstimate(project.id, OWNER_A);

    // 掛率は 1（lib/calc.ts の ADOPTED_MARKUP_RATE）なので原価がそのまま出る。
    expect(unitPriceOf(priced.lines, lineOne)).toBe(COST_A_ONE);
    expect(unitPriceOf(priced.lines, lineTwo)).toBe(SAVED_UNIT_PRICE_TWO);
    expect(priced.totals.directCostSubtotal).toBe(
      COST_A_ONE * QUANTITY_ONE + SAVED_UNIT_PRICE_TWO * QUANTITY_TWO,
    );
  });

  it("採り直すと後から採った社の単価になる（前の社の値が残らない）", async () => {
    const { project, lineOne, requestA, requestB } = await setup("価格3");

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );
    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestB.id },
      OWNER_A,
    );

    const priced = await getPricedEstimate(project.id, OWNER_A);
    expect(unitPriceOf(priced.lines, lineOne)).toBe(COST_B_ONE);
  });

  it("採用を取り消すと、保存されている単価に戻る", async () => {
    const { project, lineOne, requestA } = await setup("価格4");

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );
    expect(await cancelLineAdoption(project.id, lineOne, OWNER_A)).toBe(true);

    const priced = await getPricedEstimate(project.id, OWNER_A);
    expect(unitPriceOf(priced.lines, lineOne)).toBe(SAVED_UNIT_PRICE_ONE);
  });

  it("採用した社が単価を付けていない明細は、保存値のまま（欠けた分を0円にしない）", async () => {
    // 社Bは lineOne にしか単価を付けていない。その社を lineTwo に採ると、
    // 引ける原価が無い。ここで 0 を入れると、書類に0円の行が黙って出る。
    const { project, lineTwo, requestB } = await setup("価格5");

    await adoptLine(
      { projectId: project.id, lineItemId: lineTwo, quoteGroupRequestId: requestB.id },
      OWNER_A,
    );

    const priced = await getPricedEstimate(project.id, OWNER_A);
    expect(unitPriceOf(priced.lines, lineTwo)).toBe(SAVED_UNIT_PRICE_TWO);
  });

  it("他人の ownerId では、採用が重ならない（IDOR対策）", async () => {
    const { project, lineOne, requestA } = await setup("価格6");

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );

    const priced = await getPricedEstimate(project.id, OWNER_B);
    expect(unitPriceOf(priced.lines, lineOne)).toBe(SAVED_UNIT_PRICE_ONE);
  });

  it("比較表に出る合計と、見積書の合計が一致する", async () => {
    // 画面で見せた金額と、その場で出した書類の金額が違うと、商談がそこで終わる。
    const { project, lineOne, lineTwo, requestA, requestB } = await setup("価格7");

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestB.id },
      OWNER_A,
    );
    await adoptLine(
      { projectId: project.id, lineItemId: lineTwo, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );

    const [priced, comparison] = await Promise.all([
      getPricedEstimate(project.id, OWNER_A),
      getComparisonForProject(project.id, OWNER_A),
    ]);

    expect(comparison.adoptedTotals.grandTotal).toBe(priced.totals.grandTotal);
    expect(priced.totals.grandTotal).toBeGreaterThan(0);
  });
});
