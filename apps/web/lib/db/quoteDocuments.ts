// 下請け見積もりの書類（docs/flows.md「デモの画面の並び」D6）と、その一覧（D7）の読み取り。
//
// **これは元請だけが見る値**（他社の単価が並ぶ）。下請の画面から呼ばない。
// 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う
// （lib/db/comparison.ts と同じ役割分担）。
//
// 新しいSQLは書かない。比較表（comparison.ts）が既に「明細 × 社」と各社の単価を
// 1回で組み立てているので、それに**採用と保留の印**（lineAdoptions.ts）を重ねるだけにする。
// comparison.ts の型と関数の意味は変えない（比較表とPDFが同じものを見ているため）。

import { getComparisonForProject } from "./comparison";
import { listLineMarksForProject } from "./lineAdoptions";
import type { LineMarkStatus } from "./types";

/** D6 の明細1行（＝1明細を、その1社がいくらで見たか）。 */
export type QuoteDocumentLine = {
  lineItemId: string;
  name: string;
  quantity: number;
  unit: string;
  /**
   * その社の原価単価。**その社が回答していない明細は null**。
   * 画面はこのとき採用・保留のボタンを出さない
   * （components/ComparisonTable.tsx の `price === undefined` と同じ扱い）。
   */
  costUnitPrice: number | null;
  /** この明細に、その社の印が付いているか。付いていなければ null。 */
  mark: LineMarkStatus | null;
};

/** D6 の1画面ぶん（＝1社ぶんの見積もり）。 */
export type QuoteDocument = {
  /** 社ごとの依頼（quote_group_requests.id）。D6 の URL がこれ。 */
  requestId: string;
  companyName: string;
  lines: QuoteDocumentLine[];
};

/** 印を (明細, 依頼) で引くための鍵。 */
function markKey(lineItemId: string, requestId: string): string {
  return `${lineItemId}:${requestId}`;
}

/**
 * 案件の全社ぶんを組み立てる。往復は比較表と印の2つだけ（社ごとに引かない）。
 * 社の数だけ順に引くと、本番では1社あたり0.5秒前後が表示時間に乗る
 * （`docs/failures.md` 2026-08-06）。
 */
async function buildQuoteDocuments(
  projectId: string,
  ownerId: string,
): Promise<QuoteDocument[]> {
  const [comparison, marks] = await Promise.all([
    getComparisonForProject(projectId, ownerId),
    listLineMarksForProject(projectId, ownerId),
  ]);

  const markByKey = new Map(
    marks.map((mark) => [
      markKey(mark.lineItemId, mark.quoteGroupRequestId),
      mark.status,
    ]),
  );

  return comparison.columns.map((column) => ({
    requestId: column.requestId,
    companyName: column.companyName,
    lines: comparison.rows.map((row) => ({
      lineItemId: row.line.id,
      name: row.line.name,
      quantity: row.line.quantity,
      unit: row.line.unit,
      costUnitPrice: column.costUnitPriceByLineId[row.line.id] ?? null,
      mark: markByKey.get(markKey(row.line.id, column.requestId)) ?? null,
    })),
  }));
}

/** 1明細でも単価を返してきた社か。 */
function hasAnswer(document: QuoteDocument): boolean {
  return document.lines.some((line) => line.costUnitPrice !== null);
}

/**
 * D7（下請け見積もり一覧）が並べる社。**回答が返ってきた社だけ**を返す。
 * まだ返事の無い社を並べても単価が1つも出ず、採用も保留もできない
 * （空の社が並ぶと「まだ見積もりが届いていません」と言えなくなる）。
 */
export async function listAnsweredQuoteDocuments(
  projectId: string,
  ownerId: string,
): Promise<QuoteDocument[]> {
  return (await buildQuoteDocuments(projectId, ownerId)).filter(hasAnswer);
}

/**
 * D6（見積もり書類。1社ずつ）の1画面ぶん。
 * その案件・その所有者のものでなければ null（画面は notFound() にする）。
 */
export async function getQuoteDocumentForRequest(
  projectId: string,
  requestId: string,
  ownerId: string,
): Promise<QuoteDocument | null> {
  const documents = await buildQuoteDocuments(projectId, ownerId);
  return documents.find((document) => document.requestId === requestId) ?? null;
}
