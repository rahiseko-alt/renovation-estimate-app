import { describe, expect, it } from "vitest";

import { appendEstimateLine, getOrCreateEstimate } from "../lib/db/estimates";
import {
  adoptLine,
  cancelLineAdoption,
  listLineAdoptionsForProject,
} from "../lib/db/lineAdoptions";
import { createProject } from "../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../lib/db/subcontractors";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

/** 明細2行（既定行＋追加1行）と依頼グループを持つ案件を作る。 */
async function setupProject(customerName: string) {
  const project = await createProject(
    { customerName, siteAddress: `${customerName}の現場` },
    OWNER_A,
  );
  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);
  // 既定行（解体・廃棄物処理費）に1行足して、明細ごとに違う社を採れるかを試せるようにする。
  const estimate = await appendEstimateLine(project.id, {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: 10,
    unit: "㎡",
    unitPrice: 0,
    taxCategory: "standard",
  });
  // 非nullアサーションは既存の db テストの作法（tests/quoteRequestGroups.test.ts）に合わせる。
  return {
    project,
    group,
    lineOne: estimate.lines[0]!.id,
    lineTwo: estimate.lines[1]!.id,
  };
}

/** 下請を1社作り、その社への依頼を1件出す。 */
async function requestTo(
  groupId: string,
  companyName: string,
  email: string,
  lineItemIds: string[],
) {
  const subcontractor = await createSubcontractor({ companyName, email }, OWNER_A);
  return createQuoteGroupRequest(
    {
      groupId,
      subcontractorId: subcontractor.id,
      plannedPriceBand: "under_500man",
      lineItemIds,
    },
    OWNER_A,
  );
}

describe("lineAdoptions", () => {
  it("同じ明細を3社に依頼して3社ぶん採用しても、採用は1件だけで見積の明細行が増えない（C8）", async () => {
    const { project, group, lineOne: targetLineId } = await setupProject("採用1");
    const linesBefore = (await getOrCreateEstimate(project.id)).lines.length;

    const requests = [
      await requestTo(group.id, "採用1社A", "adopt1-a@example.com", [targetLineId]),
      await requestTo(group.id, "採用1社B", "adopt1-b@example.com", [targetLineId]),
      await requestTo(group.id, "採用1社C", "adopt1-c@example.com", [targetLineId]),
    ];

    // 旧実装は取り込みのたびに明細行を足していたため、3社ぶん取り込むと同じ工事が3行入った。
    for (const request of requests) {
      await adoptLine(
        {
          projectId: project.id,
          lineItemId: targetLineId,
          quoteGroupRequestId: request.id,
        },
        OWNER_A,
      );
    }

    const adoptions = await listLineAdoptionsForProject(project.id, OWNER_A);
    const forTargetLine = adoptions.filter((a) => a.lineItemId === targetLineId);
    expect(forTargetLine).toHaveLength(1);

    const linesAfter = (await getOrCreateEstimate(project.id)).lines.length;
    expect(linesAfter).toBe(linesBefore);
  });

  it("採用を選び直すと、後から採った社に置き換わる（追加にならない。C9）", async () => {
    const { project, group, lineOne: targetLineId } = await setupProject("採用2");

    const first = await requestTo(group.id, "採用2社A", "adopt2-a@example.com", [
      targetLineId,
    ]);
    const second = await requestTo(group.id, "採用2社B", "adopt2-b@example.com", [
      targetLineId,
    ]);

    const adopted = await adoptLine(
      {
        projectId: project.id,
        lineItemId: targetLineId,
        quoteGroupRequestId: first.id,
      },
      OWNER_A,
    );
    expect(adopted.quoteGroupRequestId).toBe(first.id);

    const readopted = await adoptLine(
      {
        projectId: project.id,
        lineItemId: targetLineId,
        quoteGroupRequestId: second.id,
      },
      OWNER_A,
    );
    expect(readopted.quoteGroupRequestId).toBe(second.id);

    const adoptions = await listLineAdoptionsForProject(project.id, OWNER_A);
    const forTargetLine = adoptions.filter((a) => a.lineItemId === targetLineId);
    expect(forTargetLine).toHaveLength(1);
    expect(forTargetLine[0]?.quoteGroupRequestId).toBe(second.id);
  });

  it("明細ごとに違う社を採れる（混在採用。1明細1社の排他が明細をまたいで効きすぎない。C9）", async () => {
    const { project, group, lineOne, lineTwo } = await setupProject("採用3");

    const requestA = await requestTo(group.id, "採用3社A", "adopt3-a@example.com", [
      lineOne,
      lineTwo,
    ]);
    const requestB = await requestTo(group.id, "採用3社B", "adopt3-b@example.com", [
      lineOne,
      lineTwo,
    ]);

    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: requestA.id },
      OWNER_A,
    );
    await adoptLine(
      { projectId: project.id, lineItemId: lineTwo, quoteGroupRequestId: requestB.id },
      OWNER_A,
    );

    const adoptions = await listLineAdoptionsForProject(project.id, OWNER_A);
    expect(
      adoptions.some(
        (a) => a.lineItemId === lineOne && a.quoteGroupRequestId === requestA.id,
      ),
    ).toBe(true);
    expect(
      adoptions.some(
        (a) => a.lineItemId === lineTwo && a.quoteGroupRequestId === requestB.id,
      ),
    ).toBe(true);
  });

  it("採用を取り消すと一覧から消え、他の明細の採用は残る（取り消しが巻き添えにしない）", async () => {
    const { project, group, lineOne, lineTwo } = await setupProject("採用4");

    const request = await requestTo(group.id, "採用4社", "adopt4@example.com", [
      lineOne,
      lineTwo,
    ]);
    await adoptLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: request.id },
      OWNER_A,
    );
    await adoptLine(
      { projectId: project.id, lineItemId: lineTwo, quoteGroupRequestId: request.id },
      OWNER_A,
    );

    expect(await cancelLineAdoption(project.id, lineOne, OWNER_A)).toBe(true);

    const adoptions = await listLineAdoptionsForProject(project.id, OWNER_A);
    expect(adoptions.some((a) => a.lineItemId === lineOne)).toBe(false);
    expect(adoptions.some((a) => a.lineItemId === lineTwo)).toBe(true);

    // 採用していない明細の取り消しは、何も起きずに false（例外にしない）。
    expect(await cancelLineAdoption(project.id, lineOne, OWNER_A)).toBe(false);
  });

  it("他人の依頼IDを知っていても採用できない（IDOR対策）", async () => {
    const { project, group, lineOne: targetLineId } = await setupProject("採用5");
    const request = await requestTo(group.id, "採用5社", "adopt5@example.com", [
      targetLineId,
    ]);

    await expect(
      adoptLine(
        {
          projectId: project.id,
          lineItemId: targetLineId,
          quoteGroupRequestId: request.id,
        },
        OWNER_B,
      ),
    ).rejects.toThrow("依頼が見つかりません。");

    expect(await listLineAdoptionsForProject(project.id, OWNER_A)).toEqual([]);
  });

  it("他人の採用は、案件IDを知っていても一覧に出ない・取り消せない（IDOR対策）", async () => {
    const { project, group, lineOne: targetLineId } = await setupProject("採用6");
    const request = await requestTo(group.id, "採用6社", "adopt6@example.com", [
      targetLineId,
    ]);
    await adoptLine(
      {
        projectId: project.id,
        lineItemId: targetLineId,
        quoteGroupRequestId: request.id,
      },
      OWNER_A,
    );

    expect(await listLineAdoptionsForProject(project.id, OWNER_B)).toEqual([]);
    expect(await cancelLineAdoption(project.id, targetLineId, OWNER_B)).toBe(false);
    // 他人の取り消しが空振りしただけで、本人の採用は残っている。
    const mine = await listLineAdoptionsForProject(project.id, OWNER_A);
    expect(mine.some((a) => a.lineItemId === targetLineId)).toBe(true);
  });

  it("依頼の対象範囲に入っていない明細は採用できない（頼んでいない工事の単価を採らない）", async () => {
    const { project, group, lineOne, lineTwo } = await setupProject("採用7");
    // 社に頼んだのは lineOne だけ。
    const request = await requestTo(group.id, "採用7社", "adopt7@example.com", [
      lineOne,
    ]);

    await expect(
      adoptLine(
        { projectId: project.id, lineItemId: lineTwo, quoteGroupRequestId: request.id },
        OWNER_A,
      ),
    ).rejects.toThrow("この明細は、その依頼の対象範囲に入っていません。");
  });

  it("別案件の依頼IDでは採用できない（案件をまたいだ紐づけを作らない）", async () => {
    const target = await setupProject("採用8");
    const other = await setupProject("採用8別案件");
    const otherRequest = await requestTo(
      other.group.id,
      "採用8社",
      "adopt8@example.com",
      [other.lineOne],
    );

    await expect(
      adoptLine(
        {
          projectId: target.project.id,
          lineItemId: target.lineOne,
          quoteGroupRequestId: otherRequest.id,
        },
        OWNER_A,
      ),
    ).rejects.toThrow("依頼が、この案件のものではありません。");
  });
});
