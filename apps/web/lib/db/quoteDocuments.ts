// 下請け見積もりの書類（docs/flows.md「デモの画面の並び」D6）と、その一覧（D7）の読み取り。
//
// **これは元請だけが見る値**（他社の単価が並ぶ）。下請の画面から呼ばない。
// 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う
// （lib/db/comparison.ts と同じ役割分担）。
//
// 新しいSQLは書かない。比較表（comparison.ts）が既に「明細 × 社」と各社の単価を
// 1回で組み立てているので、それに**採用と保留の印**（lineAdoptions.ts）を重ねるだけにする。
// comparison.ts の型と関数の意味は変えない（比較表とPDFが同じものを見ているため）。

import { calcEstimate } from "../calc";
import type { EstimateLine, EstimateTotals } from "../calc";
import { DEFAULT_QUOTE_COVER, QUOTE_COVER_BY_EMAIL } from "../demoFixture";
import { getSupabaseClient } from "./client";
import { getCompanyProfile } from "./companyProfiles";
import { getComparisonForProject } from "./comparison";
import { listLineMarksForProject } from "./lineAdoptions";
import { getProjectForOwner } from "./projects";
import { getQuoteGroupResponseForRequest } from "./quoteGroupResponses";
import type { LineMarkStatus, QuoteResponseCostBreakdown } from "./types";
import { isUuid } from "./uuid";

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

/**
 * D8 の鑑（表紙）に出る欄。
 * 何を載せるかは `docs/design.md` 3章（国交省の様式例と、経路の異なる6団体の実物で
 * 一致した項目）が持つ。ここは値の組み立てだけを行う。
 */
export type QuoteDocumentCover = {
  quoteNumber: string;
  /** 作成日（下請が回答した日）。 */
  issuedAt: Date;
  /** 宛先（元請の請負者名）。「御中」はテンプレート側が付ける。 */
  recipientName: string;
  /** 見積を出した側（下請）。社名とメールはDB、住所・TEL・担当はデモの決め打ち。 */
  issuer: {
    companyName: string;
    email: string;
    address: string;
    tel: string;
    contactName: string;
  };
  workName: string;
  workPlace: string;
  workPeriodStart: Date;
  workPeriodEnd: Date;
  validUntil: Date;
  paymentTerms: string;
  deliveryPlace: string;
};

/** D8 の1画面ぶん（鑑・内訳・集計・明細）。 */
export type QuoteDocumentSheet = {
  quote: QuoteDocument;
  cover: QuoteDocumentCover;
  /**
   * 内訳明示の5経費＋作業日数＋元請支給材料の付記。
   * **未入力の欄は null のまま渡す**（努力義務なので空で返ってくる。
   * ここで 0 に埋めると「0円で見積もった」と読めてしまう）。
   * 回答そのものが無ければ null。
   */
  breakdown: QuoteResponseCostBreakdown | null;
  /** 小計・消費税・合計。計算は必ず lib/calc.ts を通す。 */
  totals: EstimateTotals;
};

/** 鑑に要る、依頼の側の情報。社名・メールと提示日時を1回の往復で取る。 */
type RequestDetailRow = {
  responded_at: string | null;
  created_at: string;
  subcontractors: { company_name: string; email: string };
  quote_request_groups: { project_id: string; presented_at: string };
};

/**
 * 鑑に要る1件ぶんを引く。**この案件・この所有者のものでなければ null**。
 * 社ごとに引き直さないよう、社名・メール・提示日時を1回の select にまとめる
 * （lib/db/comparison.ts の listRequestRows と同じ作法）。
 */
async function findRequestDetail(
  projectId: string,
  requestId: string,
  ownerId: string,
): Promise<RequestDetailRow | null> {
  if (!isUuid(requestId) || !isUuid(projectId)) return null;

  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(
      `
        responded_at,
        created_at,
        subcontractors!inner ( company_name, email ),
        quote_request_groups!inner ( project_id, presented_at )
      `,
    )
    .eq("id", requestId)
    .eq("owner_id", ownerId)
    .eq("quote_request_groups.project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as unknown as RequestDetailRow) : null;
}

/** 基準日から日数を足した日。工期・見積有効期限をデモの決め打ちから起こすのに使う。 */
function addDays(base: Date, days: number): Date {
  const shifted = new Date(base.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

/**
 * その社ぶんの合計。**計算は lib/calc.ts を通す**
 * （AGENTS.md「金額計算の置き場所」。画面に別の計算を書かない）。
 *
 * 諸経費率は 0 にしてある。**諸経費の扱いは6団体で一致しなかった項目**で、
 * こちらの裁量になる（`docs/design.md` 3章）。下請の見積書は必要経費を
 * 内訳明示の5経費で表すので、その上に率で乗せる欄を作らない。
 * 回答が無い明細（単価が null）は行に含めない。
 */
function totalsOf(quote: QuoteDocument): EstimateTotals {
  const lines: EstimateLine[] = [];
  for (const line of quote.lines) {
    if (line.costUnitPrice === null) continue;
    lines.push({
      kind: "item",
      name: line.name,
      spec: "",
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.costUnitPrice,
      taxCategory: "standard",
    });
  }
  return calcEstimate({ lines, overheadRatePercent: 0 });
}

/**
 * D8（見積もり書類。1社ずつ）の1画面ぶんを組み立てる。
 * その案件・その所有者のものでなければ null（画面は notFound() にする）。
 *
 * 直列に待つのは2回だけ（明細・依頼・案件・会社設定を同時に → 回答）。
 * 社ごと・欄ごとに引き直すと、本番では1往復0.5秒前後がそのまま表示時間に乗る
 * （`docs/failures.md` 2026-08-06）。
 */
export async function getQuoteDocumentSheetForRequest(
  projectId: string,
  requestId: string,
  ownerId: string,
): Promise<QuoteDocumentSheet | null> {
  const [quote, detail, project, profile] = await Promise.all([
    getQuoteDocumentForRequest(projectId, requestId, ownerId),
    findRequestDetail(projectId, requestId, ownerId),
    getProjectForOwner(projectId, ownerId),
    getCompanyProfile(ownerId),
  ]);
  if (!quote || !detail || !project) return null;

  // 回答は token ではなく依頼IDで引く（下請の画面と違い、ここは所有者確認を
  // 済ませた後でしか呼ばない）。
  const response = await getQuoteGroupResponseForRequest(requestId);

  // 鑑の欄のうち、DBに持っていないものはデモの決め打ちから引く（lib/demoFixture.ts）。
  // 台帳に無い社（デモのデータではない社）には既定値を使う。
  const fixture =
    QUOTE_COVER_BY_EMAIL[detail.subcontractors.email] ?? DEFAULT_QUOTE_COVER;
  const issuedAt = new Date(
    response?.respondedAt ?? detail.responded_at ?? detail.created_at,
  );
  const presentedAt = new Date(detail.quote_request_groups.presented_at);

  return {
    quote,
    cover: {
      quoteNumber: fixture.quoteNumber,
      issuedAt,
      recipientName: profile.contractorName,
      issuer: {
        companyName: quote.companyName,
        email: detail.subcontractors.email,
        address: fixture.address,
        tel: fixture.tel,
        contactName: fixture.contactName,
      },
      workName: project.workName,
      workPlace: project.siteAddress,
      workPeriodStart: addDays(presentedAt, fixture.workPeriodStartOffsetDays),
      workPeriodEnd: addDays(presentedAt, fixture.workPeriodEndOffsetDays),
      validUntil: addDays(issuedAt, fixture.validityDays),
      paymentTerms: fixture.paymentTerms,
      deliveryPlace: fixture.deliveryPlace,
    },
    breakdown: response?.breakdown ?? null,
    totals: totalsOf(quote),
  };
}
