"use server";

import type { EstimateLine } from "../../../../lib/calc";
import { saveEstimate } from "../../../../lib/db/estimates";
import type { Estimate } from "../../../../lib/db/types";

/**
 * 見積エディタ（クライアント部品）から直接呼ばれる保存アクション。
 * 明細は動的な配列なので、FormData ではなく構造化データをそのまま渡す。
 */
export async function saveEstimateAction(
  projectId: string,
  lines: EstimateLine[],
  overheadRatePercent: number,
): Promise<Estimate> {
  return saveEstimate(projectId, lines, overheadRatePercent);
}
