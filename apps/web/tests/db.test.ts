import { describe, expect, it } from "vitest";

import { DEFAULT_DISPOSAL_ITEM_NAME } from "../lib/doc/templates/estimate";
import {
  appendEstimateLine,
  getOrCreateEstimate,
  saveEstimate,
} from "../lib/db/estimates";
import {
  createPriceMasterItem,
  deletePriceMasterItemForOwner,
  getPriceMasterItemForOwner,
  listPriceMasterForOwner,
} from "../lib/db/priceMaster";
import {
  createProject,
  deleteProjectForOwner,
  getProjectForOwner,
  listProjectsForOwner,
} from "../lib/db/projects";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

describe("projects", () => {
  it("作成した案件を、作った本人は取得できる", async () => {
    const project = await createProject(
      { customerName: "山田太郎", siteAddress: "東京都千代田区1-1" },
      OWNER_A,
    );
    expect(await getProjectForOwner(project.id, OWNER_A)).toEqual(project);
  });

  it("存在しないIDはnull", async () => {
    expect(await getProjectForOwner("no-such-id", OWNER_A)).toBeNull();
  });

  it("他人が作った案件はIDを知っていても取得できない（IDOR対策）", async () => {
    const project = await createProject(
      { customerName: "秘密の案件", siteAddress: "非公開" },
      OWNER_A,
    );
    expect(await getProjectForOwner(project.id, OWNER_B)).toBeNull();
  });

  it("一覧には自分が作った案件だけが含まれる", async () => {
    const mine = await createProject(
      { customerName: "鈴木花子", siteAddress: "大阪府大阪市1-1" },
      OWNER_A,
    );
    const others = await createProject(
      { customerName: "他人の案件", siteAddress: "非公開" },
      OWNER_B,
    );
    const list = await listProjectsForOwner(OWNER_A);
    expect(list.some((p) => p.id === mine.id)).toBe(true);
    expect(list.some((p) => p.id === others.id)).toBe(false);
  });

  it("作った本人は案件を消せる（作りかけの後始末に使う）", async () => {
    const project = await createProject(
      { customerName: "消される案件", siteAddress: "東京都港区0-0-0" },
      OWNER_A,
    );
    await deleteProjectForOwner(project.id, OWNER_A);
    expect(await getProjectForOwner(project.id, OWNER_A)).toBeNull();
  });

  it("他人の案件はIDを知っていても消せない（IDOR対策）", async () => {
    const project = await createProject(
      { customerName: "消せない案件", siteAddress: "東京都港区0-0-0" },
      OWNER_A,
    );
    await deleteProjectForOwner(project.id, OWNER_B);
    expect(await getProjectForOwner(project.id, OWNER_A)).not.toBeNull();
  });

  it("UUIDでないIDを渡しても例外にならず、何も消さない", async () => {
    await expect(
      deleteProjectForOwner("no-such-id", OWNER_A),
    ).resolves.toBeUndefined();
  });
});

describe("estimates", () => {
  it("見積が無ければ既定行（解体・廃棄物処理費）だけの見積を作る", async () => {
    const project = await createProject(
      { customerName: "テスト1", siteAddress: "テスト1" },
      OWNER_A,
    );
    const estimate = await getOrCreateEstimate(project.id);
    expect(estimate.lines).toHaveLength(1);
    expect(estimate.lines[0]?.name).toBe(DEFAULT_DISPOSAL_ITEM_NAME);
    expect(estimate.overheadRatePercent).toBe(0);
  });

  it("明細行の安定IDは、保存・再読込のたびに変わらない（A1）", async () => {
    const project = await createProject(
      { customerName: "テスト1-ID", siteAddress: "テスト1-ID" },
      OWNER_A,
    );
    const created = await getOrCreateEstimate(project.id);
    const firstId = created.lines[0]?.id;
    expect(firstId).toBeTruthy();

    const reloaded = await getOrCreateEstimate(project.id);
    expect(reloaded.lines[0]?.id).toBe(firstId);

    // appendEstimateLine で足した行にも新しい安定IDが付き、既存行のIDは変わらない。
    const appended = await appendEstimateLine(project.id, itemLine("追加行"));
    expect(appended.lines[0]?.id).toBe(firstId);
    const newLineId = appended.lines[1]?.id;
    expect(newLineId).toBeTruthy();
    expect(newLineId).not.toBe(firstId);

    const reloadedAfterAppend = await getOrCreateEstimate(project.id);
    expect(reloadedAfterAppend.lines[0]?.id).toBe(firstId);
    expect(reloadedAfterAppend.lines[1]?.id).toBe(newLineId);
  });

  it("同じ案件で2回呼んでも同じ見積を返す（作り直さない）", async () => {
    const project = await createProject(
      { customerName: "テスト2", siteAddress: "テスト2" },
      OWNER_A,
    );
    const first = await getOrCreateEstimate(project.id);
    const second = await getOrCreateEstimate(project.id);
    expect(second.id).toBe(first.id);
  });

  it("保存すると内容が更新され、次回の取得にも反映される", async () => {
    const project = await createProject(
      { customerName: "テスト3", siteAddress: "テスト3" },
      OWNER_A,
    );
    await getOrCreateEstimate(project.id);

    const saved = await saveEstimate(
      project.id,
      [
        {
          id: "11111111-1111-1111-1111-111111111111",
          kind: "item",
          name: "クロス張替え",
          spec: "量産品",
          quantity: 10,
          unit: "㎡",
          unitPrice: 1000,
          taxCategory: "standard",
        },
      ],
      10,
    );
    expect(saved.lines).toHaveLength(1);
    expect(saved.overheadRatePercent).toBe(10);

    const reloaded = await getOrCreateEstimate(project.id);
    expect(reloaded.lines[0]?.name).toBe("クロス張替え");
    expect(reloaded.overheadRatePercent).toBe(10);
  });

  it("空のIDを持つ明細は保存できない", async () => {
    const project = await createProject(
      { customerName: "テスト3-空ID", siteAddress: "テスト3-空ID" },
      OWNER_A,
    );
    await expect(
      saveEstimate(project.id, [{ ...itemLine("空ID"), id: "" }], 0),
    ).rejects.toThrow();
  });

  it("同じIDを持つ明細を2行は保存できない（React key・写真の紐づけ・単価採用が事故るため）", async () => {
    const project = await createProject(
      { customerName: "テスト3-重複ID", siteAddress: "テスト3-重複ID" },
      OWNER_A,
    );
    const duplicateId = "22222222-2222-2222-2222-222222222222";
    await expect(
      saveEstimate(
        project.id,
        [
          { ...itemLine("行A"), id: duplicateId },
          { ...itemLine("行B"), id: duplicateId },
        ],
        0,
      ),
    ).rejects.toThrow();
  });

  function itemLine(name: string) {
    return {
      kind: "item" as const,
      name,
      spec: "",
      quantity: 1,
      unit: "式",
      unitPrice: 1000,
      taxCategory: "standard" as const,
    };
  }

  it("appendEstimateLineで明細を1件追加できる", async () => {
    const project = await createProject(
      { customerName: "テスト4", siteAddress: "テスト4" },
      OWNER_A,
    );
    await getOrCreateEstimate(project.id);

    const appended = await appendEstimateLine(project.id, itemLine("追加した明細"));
    expect(appended.lines).toHaveLength(2);
    expect(appended.lines[1]?.name).toBe("追加した明細");
  });

  it("appendEstimateLineを並行で呼んでも両方の行が残る（後勝ちで消えない）", async () => {
    const project = await createProject(
      { customerName: "テスト5", siteAddress: "テスト5" },
      OWNER_A,
    );
    await getOrCreateEstimate(project.id);

    await Promise.all([
      appendEstimateLine(project.id, itemLine("依頼A")),
      appendEstimateLine(project.id, itemLine("依頼B")),
    ]);

    const reloaded = await getOrCreateEstimate(project.id);
    const names = reloaded.lines.map((line) => line.name);
    expect(names).toContain("依頼A");
    expect(names).toContain("依頼B");
    expect(reloaded.lines).toHaveLength(3); // 既定行 + 依頼A + 依頼B
  });
});

describe("priceMaster", () => {
  function newItemInput() {
    return {
      name: "クロス張替え",
      spec: "量産品",
      unit: "㎡",
      unitPrice: 1200,
      taxCategory: "standard" as const,
    };
  }

  it("登録した単価マスタを、登録した本人は取得できる", async () => {
    const item = await createPriceMasterItem(newItemInput(), OWNER_A);
    expect(await getPriceMasterItemForOwner(item.id, OWNER_A)).toEqual(item);
  });

  it("存在しないIDはnull", async () => {
    expect(await getPriceMasterItemForOwner("no-such-id", OWNER_A)).toBeNull();
  });

  it("他人が登録した単価マスタはIDを知っていても取得できない（IDOR対策）", async () => {
    const item = await createPriceMasterItem(
      { ...newItemInput(), name: "秘密の単価" },
      OWNER_A,
    );
    expect(await getPriceMasterItemForOwner(item.id, OWNER_B)).toBeNull();
  });

  it("一覧には自分が登録した単価マスタだけが含まれる", async () => {
    const mine = await createPriceMasterItem(
      { ...newItemInput(), name: "自分の単価" },
      OWNER_A,
    );
    const others = await createPriceMasterItem(
      { ...newItemInput(), name: "他人の単価" },
      OWNER_B,
    );
    const list = await listPriceMasterForOwner(OWNER_A);
    expect(list.some((i) => i.id === mine.id)).toBe(true);
    expect(list.some((i) => i.id === others.id)).toBe(false);
  });

  it("自分の単価マスタは削除できる", async () => {
    const item = await createPriceMasterItem(newItemInput(), OWNER_A);
    expect(await deletePriceMasterItemForOwner(item.id, OWNER_A)).toBe(true);
    expect(await getPriceMasterItemForOwner(item.id, OWNER_A)).toBeNull();
  });

  it("他人の単価マスタは削除できない（IDOR対策）", async () => {
    const item = await createPriceMasterItem(
      { ...newItemInput(), name: "他人の単価2" },
      OWNER_A,
    );
    expect(await deletePriceMasterItemForOwner(item.id, OWNER_B)).toBe(false);
    expect(await getPriceMasterItemForOwner(item.id, OWNER_A)).not.toBeNull();
  });
});
