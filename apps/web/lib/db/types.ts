// 案件・見積のドメイン型。lib/db/ の外（画面・API）はこの型だけを見て、
// 実装（今は仮のメモリ実装、後で Supabase に差し替え）を知らない
// （AGENTS.md「結合を増やさない」4：他の機能の内部を直接触らない）。

import type { EstimateLine, TaxCategory } from "../calc";

export type Project = {
  id: string;
  /** 施主名。 */
  customerName: string;
  /** 現場住所。 */
  siteAddress: string;
  createdAt: string;
};

export type NewProjectInput = {
  customerName: string;
  siteAddress: string;
};

export type Estimate = {
  id: string;
  projectId: string;
  lines: EstimateLine[];
  overheadRatePercent: number;
  overheadTaxCategory: TaxCategory;
  updatedAt: string;
};
