import { describe, expect, it, vi } from "vitest";

import { appendEstimateLine, getOrCreateEstimate } from "../lib/db/estimates";
import { getComparisonForProject } from "../lib/db/comparison";
import { createProject } from "../lib/db/projects";
import { createQuoteGroupResponse } from "../lib/db/quoteGroupResponses";
import {
  createQuoteGroupRequest,
  createQuoteRequestGroup,
} from "../lib/db/quoteRequestGroups";
import {
  getQuoteDocumentForRequest,
  listAnsweredQuoteDocuments,
} from "../lib/db/quoteDocuments";
import { createSubcontractor } from "../lib/db/subcontractors";

/**
 * D6（見積もり書類。1社ずつ）と D7（下請け見積もり一覧）の規則を、
 * **画面が通る経路**（Server Action → lib/db）で確かめる。
 * ローカル Supabase に実際にクエリを出す（モックにしない）。
 *
 * 検査するのは docs/flows.md「デモの画面の並び」が決めたこと：
 * - 保留は、あとで採用に変えられる
 * - 1明細につき採用は1社まで。**採用を付け替えると前の社は保留に下がる**（消えない）
 * - 回答していない明細には単価が無い（画面はそこにボタンを出さない）
 */
const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

// ログインは画面の外側（proxy.ts）の役目。ここでは「誰として押したか」だけ差し替える
// （tests/estimatePdfAction.test.ts と同じ作法）。
const currentUser = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../lib/auth/server", () => ({
  getCurrentUser: async () => currentUser.value,
}));

// revalidatePath は Next のリクエスト文脈でしか動かない。押した結果の保存を見たいので、
// ここでは何もしない実装に差し替える（検査を緩めているのではなく、経路の外側）。
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { markLineAction } = await import("../app/projects/[id]/quotes/actions");

/** 明細2行を2社に依頼し、2社とも回答した案件を作る。 */
async function setupTwoAnsweredCompanies(name: string) {
  const project = await createProject(
    { customerName: name, siteAddress: `${name}の現場` },
    OWNER_A,
  );
  const estimate = await appendEstimateLine(project.id, {
    kind: "item",
    name: "クロス張替え",
    spec: "量産品",
    quantity: 10,
    unit: "㎡",
    unitPrice: 0,
    taxCategory: "standard",
  });
  const lineOne = estimate.lines[0]!.id;
  const lineTwo = estimate.lines[1]!.id;
  const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);

  const requests = [];
  for (const [index, companyName] of ["甲社", "乙社"].entries()) {
    const subcontractor = await createSubcontractor(
      {
        companyName: `${name}${companyName}`,
        email: `${encodeURIComponent(name + companyName)}@example.com`,
      },
      OWNER_A,
    );
    const request = await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        // 2社目は1行目だけを頼む。回答の無い明細ができる（ボタンを出さない側）。
        lineItemIds: index === 0 ? [lineOne, lineTwo] : [lineOne],
      },
      OWNER_A,
    );
    await createQuoteGroupResponse({
      token: request.token,
      breakdown: {
        materialCost: null,
        laborCost: null,
        legalWelfareCost: null,
        safetyHealthCost: null,
        retirementMutualAidCost: null,
        workDays: null,
        materialSuppliedNote: "",
      },
      lines:
        index === 0
          ? [
              { lineItemId: lineOne, quantity: 1, costUnitPrice: 30_000 },
              { lineItemId: lineTwo, quantity: 10, costUnitPrice: 1_200 },
            ]
          : [{ lineItemId: lineOne, quantity: 1, costUnitPrice: 25_000 }],
    });
    requests.push(request);
  }

  currentUser.value = OWNER_A;
  return { project, lineOne, lineTwo, requestA: requests[0]!, requestB: requests[1]! };
}

/** D6 の1画面ぶんを、その明細の印だけ取り出して見る。 */
async function markOf(
  projectId: string,
  requestId: string,
  lineItemId: string,
): Promise<string | null> {
  const quote = await getQuoteDocumentForRequest(projectId, requestId, OWNER_A);
  const line = quote?.lines.find((candidate) => candidate.lineItemId === lineItemId);
  if (!line) throw new Error("明細が見つからない");
  return line.mark;
}

describe("D6 見積もり書類（1社ずつ）", () => {
  it("保留にした明細を、あとで採用に変えられる", async () => {
    const { project, lineOne, requestA } = await setupTwoAnsweredCompanies("D6保留");

    await markLineAction(project.id, lineOne, requestA.id, "on_hold");
    expect(await markOf(project.id, requestA.id, lineOne)).toBe("on_hold");

    await markLineAction(project.id, lineOne, requestA.id, "adopted");
    expect(await markOf(project.id, requestA.id, lineOne)).toBe("adopted");

    // 採用は見積書（比較表と同じ経路）にも届く。保留のままでは届かない。
    const comparison = await getComparisonForProject(project.id, OWNER_A);
    const row = comparison.rows.find((candidate) => candidate.line.id === lineOne);
    expect(row?.adoptedRequestId).toBe(requestA.id);
  });

  it("採用を別の社に付け替えると、前の社は消えずに保留へ下がる", async () => {
    const { project, lineOne, requestA, requestB } =
      await setupTwoAnsweredCompanies("D6付替え");

    await markLineAction(project.id, lineOne, requestA.id, "adopted");
    await markLineAction(project.id, lineOne, requestB.id, "adopted");

    expect(await markOf(project.id, requestA.id, lineOne)).toBe("on_hold");
    expect(await markOf(project.id, requestB.id, lineOne)).toBe("adopted");

    // 1明細につき採用は1社まで。見積書に入るのは後から採った社。
    const comparison = await getComparisonForProject(project.id, OWNER_A);
    const row = comparison.rows.find((candidate) => candidate.line.id === lineOne);
    expect(row?.adoptedRequestId).toBe(requestB.id);
  });

  it("その社が回答していない明細には単価が無い（画面はボタンを出さない）", async () => {
    const { project, lineTwo, requestB } =
      await setupTwoAnsweredCompanies("D6未回答");

    const quote = await getQuoteDocumentForRequest(project.id, requestB.id, OWNER_A);
    const line = quote?.lines.find((candidate) => candidate.lineItemId === lineTwo);
    expect(line?.costUnitPrice).toBeNull();
    expect(line?.mark).toBeNull();
  });

  it("他人の依頼は見られない（画面は notFound になる）", async () => {
    const { project, requestA } = await setupTwoAnsweredCompanies("D6他人");

    expect(
      await getQuoteDocumentForRequest(project.id, requestA.id, OWNER_B),
    ).toBeNull();

    // 押す側も同じ。所有者でなければ通らない。
    // **投げずに返す**（Next.js は本番ビルドで Server Action の例外を伏せるため、
    // 想定内の失敗は返り値で画面へ渡す。app/projects/[id]/quotes/actions.ts）。
    currentUser.value = OWNER_B;
    const result = await markLineAction(
      project.id,
      "00000000-0000-4000-8000-000000000000",
      requestA.id,
      "adopted",
    );
    expect(result.ok).toBe(false);
    currentUser.value = OWNER_A;
  });
});

describe("D7 下請け見積もり一覧", () => {
  it("社ごとに1ブロックで、D6 で押した採用・保留がそのまま貯まる", async () => {
    const { project, lineOne, lineTwo, requestA, requestB } =
      await setupTwoAnsweredCompanies("D7一覧");

    await markLineAction(project.id, lineOne, requestB.id, "adopted");
    await markLineAction(project.id, lineTwo, requestA.id, "on_hold");

    const quotes = await listAnsweredQuoteDocuments(project.id, OWNER_A);
    // 並び順は created_at 昇順。2件をループで作るので時刻が同着しうるため、
    // 位置ではなく requestId で引き当てる（tests/comparison.test.ts と同じ理由）。
    expect(quotes).toHaveLength(2);
    expect(quotes.map((quote) => quote.requestId).sort()).toEqual(
      [requestA.id, requestB.id].sort(),
    );

    const documentA = quotes.find((quote) => quote.requestId === requestA.id)!;
    const documentB = quotes.find((quote) => quote.requestId === requestB.id)!;
    // 甲社は1行目が未選択、2行目が保留。乙社は1行目が採用。
    expect(documentA.lines.find((line) => line.lineItemId === lineOne)?.mark).toBeNull();
    expect(documentA.lines.find((line) => line.lineItemId === lineTwo)?.mark).toBe(
      "on_hold",
    );
    expect(documentB.lines.find((line) => line.lineItemId === lineOne)?.mark).toBe(
      "adopted",
    );
  });

  it("回答が1件も無ければ、一覧に並ぶ社は無い（画面は「届いていません」になる）", async () => {
    const project = await createProject(
      { customerName: "D7未着", siteAddress: "D7未着の現場" },
      OWNER_A,
    );
    const estimate = await getOrCreateEstimate(project.id);
    const group = await createQuoteRequestGroup({ projectId: project.id }, OWNER_A);
    const subcontractor = await createSubcontractor(
      { companyName: "D7未着甲社", email: "d7-none@example.com" },
      OWNER_A,
    );
    await createQuoteGroupRequest(
      {
        groupId: group.id,
        subcontractorId: subcontractor.id,
        plannedPriceBand: "under_500man",
        lineItemIds: [estimate.lines[0]!.id],
      },
      OWNER_A,
    );

    // 依頼はあるが回答が無い。まだ見せる見積もりが無い。
    expect(await listAnsweredQuoteDocuments(project.id, OWNER_A)).toEqual([]);
  });
});
