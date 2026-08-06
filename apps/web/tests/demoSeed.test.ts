import { describe, expect, it } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { getComparisonForProject } from "../lib/db/comparison";
import { DEMO_SUBCONTRACTOR_COUNT, seedDemoData } from "../lib/db/demoSeed";
import { getProjectForOwner } from "../lib/db/projects";
import { checkSubmissionGate } from "../lib/db/submissionGate";

/**
 * デモの受け入れ条件は「3タップで見積書まで行けること」。
 * その前提は、**投入直後に既に3社ぶんの回答が入っていること**と、
 * **法定項目が送信ゲートを通る状態になっていること**の2つ。
 * どちらかが欠けると、商談の場で入力を求められて経路が壊れる。
 */
describe("seedDemoData", () => {
  it("投入した直後に、3社ぶんの回答が比較表に並ぶ", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    const comparison = await getComparisonForProject(projectId, ownerId);
    expect(comparison.columns).toHaveLength(DEMO_SUBCONTRACTOR_COUNT);
    expect(comparison.rows.length).toBeGreaterThan(0);

    for (const column of comparison.columns) {
      // 「回答待ち」が1社でも混じっていると、比較表が空欄だらけで見せられない。
      expect(column.status).toBe("responded");
      // 全明細に単価が入っていること。1つでも欠けると比較の意味が落ちる。
      expect(Object.keys(column.costUnitPriceByLineId)).toHaveLength(
        comparison.rows.length,
      );
    }
  });

  it("投入した直後に、送信ゲートを通る（未入力・未検討が残っていない）", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    const gate = await checkSubmissionGate(projectId, ownerId);
    expect(gate.unsetSlotKeys).toEqual([]);
    expect(gate.unsetCategories).toEqual([]);
    expect(gate.ok).toBe(true);
  });

  it("2回入れても案件は増えず、同じ内容に作り直す", async () => {
    const ownerId = newDemoOwnerId();
    const first = await seedDemoData(ownerId);
    const second = await seedDemoData(ownerId);

    expect(second).not.toBe(first);
    expect(await getProjectForOwner(first, ownerId)).toBeNull();
    expect(await getProjectForOwner(second, ownerId)).not.toBeNull();
  });

  // 商談が同時に2件走ったときに互いのデータが見えると、その場で信用を失う。
  it("別のデモ利用者の案件は見えない", async () => {
    const ownerA = newDemoOwnerId();
    const ownerB = newDemoOwnerId();
    const projectId = await seedDemoData(ownerA);

    expect(await getProjectForOwner(projectId, ownerB)).toBeNull();
  });
});
