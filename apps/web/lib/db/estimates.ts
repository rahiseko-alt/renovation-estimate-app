// 見積のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// 今は lib/db/memory.ts の仮実装。Supabase に差し替えるときはこのファイルの中身だけを直す。
//
// フェーズ1のこの実装は、案件1件につき見積1件（改版なし）に単純化している。
// 見積の改版履歴を持つ場合も、画面からの呼び出し方は変えずにこの中だけを直せばよい。

import type { EstimateLine } from "../calc";
import { DEFAULT_DISPOSAL_ITEM_NAME } from "../content";
import { newId, nowIso } from "./memory";
import type { Estimate } from "./types";

const estimatesByProjectId = new Map<string, Estimate>();

function defaultLines(): EstimateLine[] {
  return [
    {
      kind: "item",
      name: DEFAULT_DISPOSAL_ITEM_NAME,
      spec: "",
      quantity: 1,
      unit: "式",
      unitPrice: 0,
      taxCategory: "standard",
    },
  ];
}

/** 見積が無ければ既定行（解体・廃棄物処理費）だけを持つ見積を作って返す。 */
export async function getOrCreateEstimate(projectId: string): Promise<Estimate> {
  const existing = estimatesByProjectId.get(projectId);
  if (existing) return existing;

  const estimate: Estimate = {
    id: newId(),
    projectId,
    lines: defaultLines(),
    overheadRatePercent: 0,
    overheadTaxCategory: "standard",
    updatedAt: nowIso(),
  };
  estimatesByProjectId.set(projectId, estimate);
  return estimate;
}

export async function saveEstimate(
  projectId: string,
  lines: EstimateLine[],
  overheadRatePercent: number,
): Promise<Estimate> {
  const previous = estimatesByProjectId.get(projectId);
  const estimate: Estimate = {
    id: previous?.id ?? newId(),
    projectId,
    lines,
    overheadRatePercent,
    overheadTaxCategory: previous?.overheadTaxCategory ?? "standard",
    updatedAt: nowIso(),
  };
  estimatesByProjectId.set(projectId, estimate);
  return estimate;
}
