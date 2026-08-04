import { describe, expect, it } from "vitest";

import { DEFAULT_DISPOSAL_ITEM_NAME } from "../lib/content";
import { getOrCreateEstimate, saveEstimate } from "../lib/db/estimates";
import { createProject, getProject, listProjects } from "../lib/db/projects";

describe("projects", () => {
  it("作成した案件を1件取得できる", async () => {
    const project = await createProject({
      customerName: "山田太郎",
      siteAddress: "東京都千代田区1-1",
    });
    expect(await getProject(project.id)).toEqual(project);
  });

  it("存在しないIDはnull", async () => {
    expect(await getProject("no-such-id")).toBeNull();
  });

  it("一覧に作成した案件が含まれる", async () => {
    const project = await createProject({
      customerName: "鈴木花子",
      siteAddress: "大阪府大阪市1-1",
    });
    const list = await listProjects();
    expect(list.some((p) => p.id === project.id)).toBe(true);
  });
});

describe("estimates", () => {
  it("見積が無ければ既定行（解体・廃棄物処理費）だけの見積を作る", async () => {
    const project = await createProject({
      customerName: "テスト1",
      siteAddress: "テスト1",
    });
    const estimate = await getOrCreateEstimate(project.id);
    expect(estimate.lines).toHaveLength(1);
    expect(estimate.lines[0]?.name).toBe(DEFAULT_DISPOSAL_ITEM_NAME);
    expect(estimate.overheadRatePercent).toBe(0);
  });

  it("同じ案件で2回呼んでも同じ見積を返す（作り直さない）", async () => {
    const project = await createProject({
      customerName: "テスト2",
      siteAddress: "テスト2",
    });
    const first = await getOrCreateEstimate(project.id);
    const second = await getOrCreateEstimate(project.id);
    expect(second.id).toBe(first.id);
  });

  it("保存すると内容が更新され、次回の取得にも反映される", async () => {
    const project = await createProject({
      customerName: "テスト3",
      siteAddress: "テスト3",
    });
    await getOrCreateEstimate(project.id);

    const saved = await saveEstimate(
      project.id,
      [
        {
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
});
