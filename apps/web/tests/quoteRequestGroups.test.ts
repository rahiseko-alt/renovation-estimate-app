import { describe, expect, it } from "vitest";

import { minimumQuotePeriodDays } from "../lib/legalPeriod";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
  getQuoteGroupRequestForOwner,
  getQuoteGroupRequestForSubcontractor,
  listQuoteGroupRequestsForGroup,
} from "../lib/db/quoteRequestGroups";
import { createProject } from "../lib/db/projects";
import { createSubcontractor } from "../lib/db/subcontractors";
import type { PlannedPriceBand } from "../lib/db/types";

const OWNER_A = "owner-a@example.com";

async function setupGroup(customerName: string) {
  const project = await createProject(
    { customerName, siteAddress: `${customerName}の現場` },
    OWNER_A,
  );
  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);
  return { project, group };
}

describe("quoteRequestGroups", () => {
  it("依頼グループは提示日時（presentedAt）を持つ（A8）", async () => {
    const before = Date.now();
    const { group } = await setupGroup("依頼グループ1");
    const after = Date.now();

    const presentedAtMillis = new Date(group.presentedAt).getTime();
    expect(presentedAtMillis).toBeGreaterThanOrEqual(before);
    expect(presentedAtMillis).toBeLessThanOrEqual(after);
    // created_at とは別の列（同じ意味の値を2箇所に持たせているわけではないことの確認）。
    expect(group.createdAt).toBeTruthy();
  });

  it("3帯それぞれで見積回答期限が正しい日数だけ先になる（A9）", async () => {
    const { group } = await setupGroup("依頼グループ2");
    const sub = await createSubcontractor(
      { companyName: "期限確認建設", email: "due@example.com" },
      OWNER_A,
    );

    const bands: PlannedPriceBand[] = [
      "under_500man",
      "between_500man_and_5000man",
      "over_5000man",
    ];

    for (const band of bands) {
      const request = await createQuoteGroupRequest(
        {
          groupId: group.id,
          subcontractorId: sub.id,
          plannedPriceBand: band,
          lineItemIds: [],
        },
        OWNER_A,
      );
      const expectedDays = minimumQuotePeriodDays(band);
      const presentedAtMillis = new Date(group.presentedAt).getTime();
      const dueAtMillis = new Date(request.responseDueAt).getTime();
      const actualDays = Math.round(
        (dueAtMillis - presentedAtMillis) / (24 * 60 * 60 * 1000),
      );
      expect(actualDays).toBe(expectedDays);
    }
  });

  it("500万円未満は1日、500万〜5000万は10日、5000万以上は15日（3章の表そのもの）", () => {
    expect(minimumQuotePeriodDays("under_500man")).toBe(1);
    expect(minimumQuotePeriodDays("between_500man_and_5000man")).toBe(10);
    expect(minimumQuotePeriodDays("over_5000man")).toBe(15);
  });

  it("予定価格帯に不正な値を渡すと保存できない（A10・DB制約による防御）", async () => {
    const { group } = await setupGroup("依頼グループ3");
    const sub = await createSubcontractor(
      { companyName: "不正値確認建設", email: "invalid-band@example.com" },
      OWNER_A,
    );
    await expect(
      createQuoteGroupRequest(
        {
          groupId: group.id,
          subcontractorId: sub.id,
          // 「未選択」を表す空文字列は、3択のどれでもないので DB の check 制約で弾かれる。
          plannedPriceBand: "" as PlannedPriceBand,
          lineItemIds: [],
        },
        OWNER_A,
      ),
    ).rejects.toThrow();
  });

  it("社ごとの依頼は別トークンを持ち、他社の依頼を巻き込まない（A7）", async () => {
    const { group } = await setupGroup("依頼グループ4");
    const subA = await createSubcontractor(
      { companyName: "社A", email: "company-a@example.com" },
      OWNER_A,
    );
    const subB = await createSubcontractor(
      { companyName: "社B", email: "company-b@example.com" },
      OWNER_A,
    );

    const requestA = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subA.id,
        plannedPriceBand: "under_500man",
        lineItemIds: ["11111111-1111-1111-1111-111111111111"],
      },
      OWNER_A,
    );
    const requestB = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subB.id,
        plannedPriceBand: "over_5000man",
        lineItemIds: ["22222222-2222-2222-2222-222222222222"],
      },
      OWNER_A,
    );

    expect(requestA.token).not.toBe(requestB.token);

    // 社Aのトークンで下請向け投影を引いても、社Bの明細範囲・情報は一切混ざらない。
    const viewA = await getQuoteGroupRequestForSubcontractor(requestA.token);
    expect(viewA?.id).toBe(requestA.id);
    expect(viewA?.lineItemIds).toEqual(requestA.lineItemIds);
    expect(viewA?.lineItemIds).not.toEqual(requestB.lineItemIds);

    const list = await listQuoteGroupRequestsForGroup(group.id, OWNER_A);
    expect(list.map((r) => r.id).sort()).toEqual(
      [requestA.id, requestB.id].sort(),
    );
  });

  it("下請向け投影に、売価・掛率・原価・owner_id・施主名が一切含まれない（A6）", async () => {
    const project = await createProject(
      { customerName: "施主 非公開太郎", siteAddress: "非公開現場住所" },
      OWNER_A,
    );
    const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);
    const sub = await createSubcontractor(
      { companyName: "禁止キー確認建設", email: "forbidden-keys@example.com" },
      OWNER_A,
    );
    const request = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: sub.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [],
      },
      OWNER_A,
    );

    const forSubcontractor = await getQuoteGroupRequestForSubcontractor(
      request.token,
    );
    expect(forSubcontractor).not.toBeNull();

    // 型で表せる話ではなく、実際にシリアライズされる値そのものを検査する
    // （AGENTS.md「業務ドメインを決めるときの作法」／docs/design.md 7章
    // 「下請に見せるもの・見せないもの」）。
    const serialized = JSON.parse(JSON.stringify(forSubcontractor)) as Record<
      string,
      unknown
    >;
    const FORBIDDEN_KEYS = [
      "ownerId",
      "owner_id",
      "subcontractorId",
      "subcontractor_id",
      "plannedPriceBand",
      "planned_price_band",
      "groupId",
      "group_id",
      "markupRate",
      "markup_rate",
      "costUnitPrice",
      "cost_unit_price",
      "customerName",
      "customer_name",
    ];
    for (const key of FORBIDDEN_KEYS) {
      expect(Object.keys(serialized)).not.toContain(key);
    }

    // 見せてよい欄（法定①②）は出ている。施主名は法定8項目に含まれないため出さない。
    expect(forSubcontractor?.workName).toBe(project.workName);
    expect(forSubcontractor?.siteAddress).toBe(project.siteAddress);
    expect(JSON.stringify(forSubcontractor)).not.toContain("非公開太郎");
  });

  it("存在しないトークンは null（500やスタックトレースにしない）", async () => {
    expect(
      await getQuoteGroupRequestForSubcontractor(
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });

  it("形の違うトークン（UUIDでない）も null（クエリを投げる前に弾く）", async () => {
    expect(await getQuoteGroupRequestForSubcontractor("not-a-uuid")).toBeNull();
  });

  it("他人のグループIDを知っていても、依頼を作れない（IDOR対策）", async () => {
    const { group } = await setupGroup("依頼グループ5");
    const sub = await createSubcontractor(
      { companyName: "他人確認建設", email: "other-owner@example.com" },
      OWNER_A,
    );
    await expect(
      createQuoteGroupRequest(
        {
          groupId: group.id,
          subcontractorId: sub.id,
          plannedPriceBand: "under_500man",
          lineItemIds: [],
        },
        "owner-b@example.com",
      ),
    ).rejects.toThrow();
  });

  it("依頼グループが存在し、かつ owner の持ち物であるときだけ取得できる", async () => {
    const { group } = await setupGroup("依頼グループ6");
    const sub = await createSubcontractor(
      { companyName: "取得確認建設", email: "get-owner@example.com" },
      OWNER_A,
    );
    const request = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: sub.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [],
      },
      OWNER_A,
    );
    expect(await getQuoteGroupRequestForOwner(request.id, OWNER_A)).toEqual(
      request,
    );
    expect(
      await getQuoteGroupRequestForOwner(request.id, "owner-b@example.com"),
    ).toBeNull();
  });
});
