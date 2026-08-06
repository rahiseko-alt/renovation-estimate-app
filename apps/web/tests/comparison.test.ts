import { describe, expect, it } from "vitest";

import {
  cheapestRequestIdByLineId,
  getComparisonForProject,
} from "../lib/db/comparison";
import { getOrCreateEstimate } from "../lib/db/estimates";
import { adoptLine } from "../lib/db/lineAdoptions";
import { createProject } from "../lib/db/projects";
import { createQuoteGroupResponse } from "../lib/db/quoteGroupResponses";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../lib/db/subcontractors";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

/** 案件1件に、同じ明細を N 社へ依頼した状態を作る。 */
async function setupThreeWayRequest(name: string) {
  const project = await createProject(
    { customerName: name, siteAddress: `${name}の現場` },
    OWNER_A,
  );
  const estimate = await getOrCreateEstimate(project.id);
  const lineId = estimate.lines[0]!.id;
  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);

  const requests = [];
  for (const companyName of ["甲社", "乙社", "丙社"]) {
    const subcontractor = await createSubcontractor(
      {
        companyName: `${name}${companyName}`,
        email: `${encodeURIComponent(name + companyName)}@example.com`,
      },
      OWNER_A,
    );
    requests.push(
      await createQuoteGroupRequest(
        {
          groupId: group.id,
          subcontractorId: subcontractor.id,
          plannedPriceBand: "under_500man",
          lineItemIds: [lineId],
        },
        OWNER_A,
      ),
    );
  }
  return { project, lineId, requests };
}

describe("比較表", () => {
  it("3社が同じ明細に回答しても、明細は1行のまま（C8）", async () => {
    const { project, lineId, requests } = await setupThreeWayRequest("比較1");

    const prices = [30_000, 25_000, 28_000];
    for (const [index, request] of requests.entries()) {
      await createQuoteGroupResponse({
        token: request.token,
        breakdown: {
          materialCost: null,
          laborCost: null,
          legalWelfareCost: null,
          safetyHealthCost: null,
          retirementMutualAidCost: null,
          workDays: null,
          materialSuppliedNote: "",
        },
        lines: [{ lineItemId: lineId, quantity: 1, costUnitPrice: prices[index]! }],
      });
    }

    const comparison = await getComparisonForProject(project.id, OWNER_A);
    // 行は明細の数のまま増えない。列（社）が3つ並ぶ。
    expect(comparison.rows).toHaveLength(1);
    expect(comparison.columns).toHaveLength(3);
    // 列の順は created_at 昇順。3件をループで作るので時刻が同着しうる。
    // 位置ではなく requestId で引き当てる（同着のとき順序は保証されない）。
    for (const [index, request] of requests.entries()) {
      const column = comparison.columns.find(
        (candidate) => candidate.requestId === request.id,
      );
      expect(column?.costUnitPriceByLineId[lineId]).toBe(prices[index]);
    }
  });

  it("最安の印は付くが、自動では採用しない（選ぶのは人）", async () => {
    const { project, lineId, requests } = await setupThreeWayRequest("比較2");

    const prices = [30_000, 25_000, 28_000];
    for (const [index, request] of requests.entries()) {
      await createQuoteGroupResponse({
        token: request.token,
        breakdown: {
          materialCost: null,
          laborCost: null,
          legalWelfareCost: null,
          safetyHealthCost: null,
          retirementMutualAidCost: null,
          workDays: null,
          materialSuppliedNote: "",
        },
        lines: [{ lineItemId: lineId, quantity: 1, costUnitPrice: prices[index]! }],
      });
    }

    const comparison = await getComparisonForProject(project.id, OWNER_A);
    const cheapest = cheapestRequestIdByLineId(comparison);
    expect(cheapest[lineId]).toBe(requests[1]!.id); // 25,000円の乙社

    // 印が付いただけで、採用はされていない。
    expect(comparison.rows[0]!.adoptedRequestId).toBeNull();
  });

  it("採用は明細ごとに1社だけで、選び直すと置き換わる（C9）", async () => {
    const { project, lineId, requests } = await setupThreeWayRequest("比較3");

    await adoptLine(
      {
        projectId: project.id,
        lineItemId: lineId,
        quoteGroupRequestId: requests[0]!.id,
      },
      OWNER_A,
    );
    let comparison = await getComparisonForProject(project.id, OWNER_A);
    expect(comparison.rows[0]!.adoptedRequestId).toBe(requests[0]!.id);

    // 選び直す。前の採用は増えずに置き換わる。
    await adoptLine(
      {
        projectId: project.id,
        lineItemId: lineId,
        quoteGroupRequestId: requests[2]!.id,
      },
      OWNER_A,
    );
    comparison = await getComparisonForProject(project.id, OWNER_A);
    expect(comparison.rows[0]!.adoptedRequestId).toBe(requests[2]!.id);
    expect(comparison.rows).toHaveLength(1);
  });

  it("他人の案件の比較表は引けない（IDOR対策）", async () => {
    const { project } = await setupThreeWayRequest("比較4");
    const comparison = await getComparisonForProject(project.id, OWNER_B);
    // 他社の単価（列）も採用状態も一切返らない。
    expect(comparison.columns).toHaveLength(0);
    for (const row of comparison.rows) {
      expect(row.adoptedRequestId).toBeNull();
    }
  });

  it("回答が無い社の欄は空のまま（未回答と0円を混同しない）", async () => {
    const { project, lineId } = await setupThreeWayRequest("比較5");

    const comparison = await getComparisonForProject(project.id, OWNER_A);
    for (const column of comparison.columns) {
      expect(column.costUnitPriceByLineId[lineId]).toBeUndefined();
    }
    // 未回答しかないので最安の印も付かない。
    expect(cheapestRequestIdByLineId(comparison)[lineId]).toBeUndefined();
  });
});
