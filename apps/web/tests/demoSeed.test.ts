import { describe, expect, it } from "vitest";

import { newDemoOwnerId } from "../lib/auth/demoOwner";
import { getComparisonForProject } from "../lib/db/comparison";
import { DEMO_SUBCONTRACTOR_COUNT } from "../lib/demoFixture";
import { DEFAULT_DISPOSAL_ITEM_NAME } from "../lib/doc/templates/estimate";
import { findDemoProject, purgeExpiredDemoData } from "../lib/db/demoCleanup";
import { seedDemoData } from "../lib/db/demoSeed";
import { getPricedEstimate } from "../lib/db/pricedEstimate";
import { createProject, getProjectForOwner } from "../lib/db/projects";
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

  /**
   * 3タップ目に出る見積書が全行0円だった。比較表には3社の単価（数十万）が並ぶので、
   * 落差がそのまま「作りかけ」に見える（`docs/failures.md` 2026-08-06）。
   * 原因は2つあり、**両方そろわないと直らない**：
   * ①見積書が採用単価を読んでいなかった ②デモが採用を1件も作っていなかった。
   * ここは②を含めて、投入直後に金額が出ることを直接見る。
   */
  it("投入した直後に、見積書の全明細に単価が入っていて合計が0円でない", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    const priced = await getPricedEstimate(projectId, ownerId);

    expect(priced.lines.length).toBeGreaterThan(0);
    for (const line of priced.lines) {
      expect(line.unitPrice, `${line.name} の単価`).toBeGreaterThan(0);
    }
    expect(priced.totals.grandTotal).toBeGreaterThan(0);

    // 比較表に出す合計と一致していること（画面と書類で金額が違うと商談が終わる）。
    const comparison = await getComparisonForProject(projectId, ownerId);
    expect(comparison.adoptedTotals.grandTotal).toBe(priced.totals.grandTotal);
  });

  it("投入した直後に、明細の「式」は解体・廃棄物処理費の1行だけ", async () => {
    // 「現場で打つのは数量だけ」がこの製品の主張。デモの明細が全部「式」（数量は常に1）だと
    // デモ自身がその反例になる。単位の割り当ては lib/demoFixture.ts が持つ。
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    const priced = await getPricedEstimate(projectId, ownerId);
    const lumpSumLines = priced.lines.filter((line) => line.unit === "式");

    expect(lumpSumLines.map((line) => line.name)).toEqual([
      DEFAULT_DISPOSAL_ITEM_NAME,
    ]);
    // 「式」でない行は、数量が1でない実数になっていること。
    for (const line of priced.lines) {
      if (line.unit === "式") continue;
      expect(line.quantity, `${line.name} の数量`).toBeGreaterThan(1);
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

/**
 * デモは無ログインで、訪問ごとに `demo:<uuid>` が1つ増える。
 * Cookie の有効期間はDBの行を消さないので、掃除が要る。
 */
describe("purgeExpiredDemoData", () => {
  it("期限を過ぎたデモのデータを消す", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    // 「これより前に作られたもの」を消す。今より先を渡せば、今作ったものが対象になる。
    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(projectId, ownerId)).toBeNull();
    expect(await findDemoProject(ownerId)).toBeNull();
  });

  it("期限内のデモは消さない", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);

    await purgeExpiredDemoData(new Date(Date.now() - 60 * 60 * 1000));

    expect(await getProjectForOwner(projectId, ownerId)).not.toBeNull();
  });

  // 掃除が実利用者のデータに手を出したら、その時点で事故になる。
  it("実利用者（メールアドレスの owner_id）のデータには触れない", async () => {
    const realOwner = "owner-not-demo@example.com";
    const project = await createProject(
      { customerName: "実在しない施主", siteAddress: "東京都千代田区0-0-0" },
      realOwner,
    );

    await purgeExpiredDemoData(new Date(Date.now() + 60_000));

    expect(await getProjectForOwner(project.id, realOwner)).not.toBeNull();
  });
});

describe("findDemoProject", () => {
  // 「デモを触ってみる」を連打しても、そのたびに十数回の書き込みを走らせない。
  it("既にデモ中なら、その案件のIDを返す", async () => {
    const ownerId = newDemoOwnerId();
    const projectId = await seedDemoData(ownerId);
    expect(await findDemoProject(ownerId)).toBe(projectId);
  });

  it("デモを始めていなければ null", async () => {
    expect(await findDemoProject(newDemoOwnerId())).toBeNull();
  });
});
