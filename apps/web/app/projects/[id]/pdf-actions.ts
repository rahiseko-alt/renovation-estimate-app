"use server";

import { getCurrentUser } from "../../../lib/auth/server";
import { calcEstimate } from "../../../lib/calc";
import { getCompanyProfile } from "../../../lib/db/companyProfiles";
import { getOrCreateEstimate } from "../../../lib/db/estimates";
import { getProjectForOwner } from "../../../lib/db/projects";
import { generateEstimatePdf } from "../../../lib/pdf/estimateDocument";

export type EstimatePdfResult = {
  /** PDFのバイト列。Server Action はJSONでシリアライズして返すため base64 にする。 */
  base64: string;
  filename: string;
};

/**
 * 見積書PDFを生成して返す。
 *
 * Route Handler（app/**\/route.ts）ではなく Server Action にしているのは、
 * このアプリの仮の永続化層（lib/db/ 配下のメモリ実装）が Route Handler と
 * ページ・Server Action の間でモジュールインスタンスを共有しないことを実機で
 * 確認したため（Route Handler 側では常に「案件が見つからない」になった）。
 * Server Action はページと同じ呼び出し経路を通るため、この問題が起きない。
 * Supabase 接続後（lib/db/ を実DBに差し替えた後）はこの制約自体が無くなるが、
 * それまではこの入口のままにする。
 *
 * Server Action はページ表示とは別の呼び出し入口なので、ここでもログイン状態と
 * 案件の所有者を確認する（saveEstimateAction と同じ理由。IDOR対策）。
 */
export async function generateEstimatePdfAction(
  projectId: string,
): Promise<EstimatePdfResult> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProjectForOwner(projectId, user);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  const [estimate, company] = await Promise.all([
    getOrCreateEstimate(projectId),
    getCompanyProfile(user),
  ]);
  const totals = calcEstimate({
    lines: estimate.lines,
    overheadRatePercent: estimate.overheadRatePercent,
    overheadTaxCategory: estimate.overheadTaxCategory,
  });

  const pdfBytes = await generateEstimatePdf({
    customerName: project.customerName,
    siteAddress: project.siteAddress,
    lines: estimate.lines,
    totals,
    issuedAt: new Date(),
    // 請負者ボックス（様式に印字されている欄）。会社設定が空なら空文字で渡り、
    // PDF 側が欄ごと出さない。
    contractor: {
      contractorName: company.contractorName,
      representativeName: company.representativeName,
      address: company.address,
    },
  });

  return {
    base64: Buffer.from(pdfBytes).toString("base64"),
    filename: `estimate-${project.id}.pdf`,
  };
}
