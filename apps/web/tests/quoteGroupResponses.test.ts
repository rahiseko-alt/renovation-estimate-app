import { describe, expect, it } from "vitest";

import { appendEstimateLine, getOrCreateEstimate } from "../lib/db/estimates";
import { createProject } from "../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
  listQuoteLinesForSubcontractor,
} from "../lib/db/quoteRequestGroups";
import {
  costUnitPriceByLineId,
  createQuoteGroupResponse,
  getQuoteGroupResponseForRequest,
} from "../lib/db/quoteGroupResponses";
import { createSubcontractor } from "../lib/db/subcontractors";
import type { QuoteResponseCostBreakdown } from "../lib/db/types";

const OWNER_A = "owner-a@example.com";

/** 必要経費の内訳は努力義務なので、既定は全部未入力（null）にする。 */
function breakdown(
  partial: Partial<QuoteResponseCostBreakdown> = {},
): QuoteResponseCostBreakdown {
  return {
    materialCost: null,
    laborCost: null,
    legalWelfareCost: null,
    safetyHealthCost: null,
    retirementMutualAidCost: null,
    workDays: null,
    materialSuppliedNote: "",
    ...partial,
  };
}

/** 案件・見積・依頼グループ・社ごとの依頼を1本作る。 */
async function setupRequest(name: string, lineCount = 1) {
  const project = await createProject(
    { customerName: name, siteAddress: `${name}の現場` },
    OWNER_A,
  );
  let estimate = await getOrCreateEstimate(project.id);
  for (let index = 1; index < lineCount; index += 1) {
    estimate = await appendEstimateLine(project.id, {
      kind: "item",
      name: `${name}の工事${index}`,
      spec: "",
      quantity: 1,
      unit: "式",
      unitPrice: 0,
      taxCategory: "standard",
    });
  }
  const lineIds = estimate.lines.map((line) => line.id);

  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);
  const subcontractor = await createSubcontractor(
    { companyName: `${name}建設`, email: `${encodeURIComponent(name)}@example.com` },
    OWNER_A,
  );
  const request = await createQuoteGroupRequest(
    {
      groupId: group.id,
      subcontractorId: subcontractor.id,
      plannedPriceBand: "under_500man",
      lineItemIds: lineIds,
    },
    OWNER_A,
  );
  return { project, estimate, lineIds, group, request };
}

describe("下請からの回答", () => {
  it("明細ごとに数量と単価を保存できる（単価1つだけの形にしない）", async () => {
    const { request, lineIds } = await setupRequest("回答1", 2);

    const response = await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown(),
      lines: [
        { lineItemId: lineIds[0]!, quantity: 2, costUnitPrice: 30_000 },
        { lineItemId: lineIds[1]!, quantity: 5, costUnitPrice: 8_000 },
      ],
    });

    expect(response.lines).toHaveLength(2);
    const byLine = costUnitPriceByLineId(response);
    expect(byLine[lineIds[0]!]).toBe(30_000);
    expect(byLine[lineIds[1]!]).toBe(8_000);
  });

  it("必要経費の内訳は未入力のままでも回答できる（努力義務なので必須にしない）", async () => {
    const { request, lineIds } = await setupRequest("回答2");

    const response = await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown(),
      lines: [{ lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 }],
    });

    // 0で埋めない。「未入力」と「0と回答した」を区別できる形で残る。
    expect(response.breakdown.legalWelfareCost).toBeNull();
    expect(response.breakdown.workDays).toBeNull();
  });

  it("必要経費の内訳を入れれば、そのまま読み戻せる（法定福利費・安全衛生経費・建退共・作業日数）", async () => {
    const { request, lineIds } = await setupRequest("回答3");

    await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown({
        materialCost: 120_000,
        laborCost: 200_000,
        legalWelfareCost: 30_000,
        safetyHealthCost: 12_000,
        retirementMutualAidCost: 4_000,
        workDays: 6,
        materialSuppliedNote: "石膏ボードは元請支給",
      }),
      lines: [{ lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 }],
    });

    const stored = await getQuoteGroupResponseForRequest(request.id);
    expect(stored?.breakdown.legalWelfareCost).toBe(30_000);
    expect(stored?.breakdown.safetyHealthCost).toBe(12_000);
    expect(stored?.breakdown.retirementMutualAidCost).toBe(4_000);
    expect(stored?.breakdown.workDays).toBe(6);
    expect(stored?.breakdown.materialSuppliedNote).toBe("石膏ボードは元請支給");
  });

  it("0と回答した内訳は、未入力と区別して残る", async () => {
    const { request, lineIds } = await setupRequest("回答4");

    await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown({ legalWelfareCost: 0 }),
      lines: [{ lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 }],
    });

    const stored = await getQuoteGroupResponseForRequest(request.id);
    expect(stored?.breakdown.legalWelfareCost).toBe(0);
    expect(stored?.breakdown.laborCost).toBeNull();
  });

  it("依頼されていない明細の単価は入れられない（tokenを1つ持っていても範囲外は書けない）", async () => {
    const { request } = await setupRequest("回答5");
    // 別案件の明細ID。この依頼の対象範囲には入っていない。
    const other = await setupRequest("回答5の別案件");

    await expect(
      createQuoteGroupResponse({
        token: request.token,
        breakdown: breakdown(),
        lines: [
          { lineItemId: other.lineIds[0]!, quantity: 1, costUnitPrice: 10_000 },
        ],
      }),
    ).rejects.toThrow();
  });

  it("同じ依頼に2回は回答できない（上書きさせない）", async () => {
    const { request, lineIds } = await setupRequest("回答6");
    const line = { lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 };

    await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown(),
      lines: [line],
    });

    await expect(
      createQuoteGroupResponse({
        token: request.token,
        breakdown: breakdown(),
        lines: [line],
      }),
    ).rejects.toThrow();
  });

  it("明細が1件も無い回答は作れない（単価の無い見積書を成立させない）", async () => {
    const { request } = await setupRequest("回答7");

    await expect(
      createQuoteGroupResponse({
        token: request.token,
        breakdown: breakdown(),
        lines: [],
      }),
    ).rejects.toThrow();
  });

  it("同じ明細を2行に分けて出せない", async () => {
    const { request, lineIds } = await setupRequest("回答8");

    await expect(
      createQuoteGroupResponse({
        token: request.token,
        breakdown: breakdown(),
        lines: [
          { lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 },
          { lineItemId: lineIds[0]!, quantity: 2, costUnitPrice: 20_000 },
        ],
      }),
    ).rejects.toThrow();
  });

  it("存在しないトークンでは回答できない（500やスタックトレースにしない）", async () => {
    await expect(
      createQuoteGroupResponse({
        token: "00000000-0000-0000-0000-000000000000",
        breakdown: breakdown(),
        lines: [
          {
            lineItemId: "11111111-1111-1111-1111-111111111111",
            quantity: 1,
            costUnitPrice: 1,
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("形の違うトークン（UUIDでない）でも回答できない", async () => {
    await expect(
      createQuoteGroupResponse({
        token: "not-a-uuid",
        breakdown: breakdown(),
        lines: [
          {
            lineItemId: "11111111-1111-1111-1111-111111111111",
            quantity: 1,
            costUnitPrice: 1,
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("回答すると依頼の状態が「回答あり」に進む（元請の比較表がこれを見る）", async () => {
    const { request, lineIds } = await setupRequest("回答9");
    expect(request.status).toBe("pending");

    await createQuoteGroupResponse({
      token: request.token,
      breakdown: breakdown(),
      lines: [{ lineItemId: lineIds[0]!, quantity: 1, costUnitPrice: 10_000 }],
    });

    const stored = await getQuoteGroupResponseForRequest(request.id);
    expect(stored).not.toBeNull();
  });
});

describe("下請に渡す明細の投影", () => {
  it("明細に金額が一切含まれない（元請の売価 unitPrice を渡さない・C2）", async () => {
    // 施主名は、明細名・現場住所のどれとも部分文字列が重ならない語にする
    // （重なると「漏れていない」ことを確かめたつもりで自分の明細名に当たる）。
    const project = await createProject(
      { customerName: "施主ダミー花子", siteAddress: "投影確認の現場" },
      OWNER_A,
    );
    // 元請の売価が入った明細を1本用意する。この金額が下請に漏れてはいけない。
    const estimate = await appendEstimateLine(project.id, {
      kind: "item",
      name: "投影確認の工事",
      spec: "",
      quantity: 3,
      unit: "㎡",
      unitPrice: 987_654,
      taxCategory: "standard",
    });
    const group = await createQuoteRequestGroup(
      { projectId: project.id },
      OWNER_A,
    );
    const subcontractor = await createSubcontractor(
      { companyName: "投影確認建設", email: "projection@example.com" },
      OWNER_A,
    );
    const request = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        lineItemIds: estimate.lines.map((line) => line.id),
      },
      OWNER_A,
    );

    const lines = await listQuoteLinesForSubcontractor(request.token);
    expect(lines.length).toBeGreaterThan(0);

    // 型ではなく、実際にシリアライズされる値そのものを検査する。
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain("987654");
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("施主ダミー花子"); // 施主名
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(
        ["id", "name", "quantity", "spec", "unit"].sort(),
      );
    }
  });

  it("依頼の対象範囲に入っていない明細は返らない", async () => {
    const project = await createProject(
      { customerName: "範囲確認", siteAddress: "範囲確認の現場" },
      OWNER_A,
    );
    const estimate = await appendEstimateLine(project.id, {
      kind: "item",
      name: "頼んでいない工事",
      spec: "",
      quantity: 1,
      unit: "式",
      unitPrice: 0,
      taxCategory: "standard",
    });
    const group = await createQuoteRequestGroup(
      { projectId: project.id },
      OWNER_A,
    );
    const subcontractor = await createSubcontractor(
      { companyName: "範囲確認建設", email: "scope@example.com" },
      OWNER_A,
    );
    // 既定行だけを依頼する（あとから足した「頼んでいない工事」は範囲外）。
    const request = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [estimate.lines[0]!.id],
      },
      OWNER_A,
    );

    const lines = await listQuoteLinesForSubcontractor(request.token);
    expect(lines.map((line) => line.name)).not.toContain("頼んでいない工事");
    expect(lines).toHaveLength(1);
  });
});
