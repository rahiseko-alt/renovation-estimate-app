"use server";

import { calcEstimate, type EstimateLine } from "../../../../lib/calc";
import { getCurrentUser } from "../../../../lib/auth/server";
import { saveEstimate } from "../../../../lib/db/estimates";
import { getProject } from "../../../../lib/db/projects";
import type { Estimate } from "../../../../lib/db/types";

/**
 * 見積エディタ（クライアント部品）から直接呼ばれる保存アクション。
 * 明細は動的な配列なので、FormData ではなく構造化データをそのまま渡す。
 *
 * Server Action はページ表示とは別の更新入口。proxy.ts の matcher は
 * このパスへの POST も守るが、それだけに頼らずここでもログイン状態・案件の
 * 存在・明細の妥当性（calcEstimate が通るか）を確かめてから保存する。
 * 検証済み・ここを通った入力だけが lib/db/ に届く形にする。
 */
export async function saveEstimateAction(
  projectId: string,
  lines: EstimateLine[],
  overheadRatePercent: number,
): Promise<Estimate> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインしていません。");
  }

  const project = await getProject(projectId);
  if (!project) {
    throw new Error("案件が見つかりません。");
  }

  // calcEstimate を通せない入力（種別不正・値引きの符号違反・安全整数の範囲外など）は
  // クライアント側の検証を素通りさせて来た壊れたデータかもしれないので保存しない。
  calcEstimate({ lines, overheadRatePercent });

  return saveEstimate(projectId, lines, overheadRatePercent);
}
