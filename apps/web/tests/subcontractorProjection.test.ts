import { describe, expect, it } from "vitest";

import { appendEstimateLine } from "../lib/db/estimates";
import { createProject } from "../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
  listQuoteLinesForSubcontractor,
} from "../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../lib/db/subcontractors";

const OWNER_A = "owner-a@example.com";

// 「下請に何を見せるか」の検査。回答を書き込む側（quoteGroupResponses.test.ts）とは
// 守っている性質が別なので、ファイルを分けている
// （AGENTS.md「結合を増やさない」：行数ではなく、後から単独で直したくなる塊で分ける）。

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
