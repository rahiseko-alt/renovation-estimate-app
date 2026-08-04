import { describe, expect, it } from "vitest";

import { DEFAULT_DISPOSAL_ITEM_NAME } from "../lib/content";
import { getOrCreateEstimate, saveEstimate } from "../lib/db/estimates";
import {
  createProject,
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
