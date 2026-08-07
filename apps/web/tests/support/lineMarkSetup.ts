// 明細の印（採用・保留）を試すための土台。
//
// tests/lineAdoptions.test.ts と tests/lineMarks.test.ts が同じ土台を使う。
// 検査対象ではないので `.test.ts` を付けない（vitest.config.ts の include が拾わない）。
// 2つのファイルに同じ setup を書き写さないために置いている
// （AGENTS.md「結合を増やさない」1）。

import { appendEstimateLine } from "../../lib/db/estimates";
import { createProject } from "../../lib/db/projects";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../../lib/db/quoteRequestGroups";
import { createSubcontractor } from "../../lib/db/subcontractors";

// 案件の登録件数には所有者ごとの上限（lib/limits.ts）があり、共用の
// owner-a@example.com は1回の実行で既に上限近くまで使っている。
// この土台専用の所有者を使い、他のテストの余地を削らない（tests/drafts.test.ts と同じ理由）。
export const OWNER_A = "line-mark-owner@example.com";
export const OWNER_B = "line-mark-other-owner@example.com";

/** 明細2行（既定行＋追加1行）と依頼グループを持つ案件を作る。 */
export async function setupProject(customerName: string) {
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
export async function requestTo(
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
