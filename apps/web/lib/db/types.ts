// 案件・見積のドメイン型。lib/db/ の外（画面・API）はこの型だけを見て、
// 実装（今は仮のメモリ実装、後で Supabase に差し替え）を知らない
// （AGENTS.md「結合を増やさない」4：他の機能の内部を直接触らない）。

import type { EstimateLine, TaxCategory } from "../calc";

export type Project = {
  id: string;
  /** 作成した利用者の識別子。他人の案件を推測 ID で読み書きさせないための境界に使う。 */
  ownerId: string;
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

/**
 * 単価マスタの1件。よく使う工事項目を、材工共の複合単価として登録しておき、
 * 見積の明細を都度手入力せず呼び出せるようにする。
 */
export type PriceMasterItem = {
  id: string;
  /** 登録した利用者の識別子。他人の単価マスタを推測 ID で読み書きさせないための境界に使う。 */
  ownerId: string;
  /** 工事項目。 */
  name: string;
  /** 摘要（仕様）。 */
  spec: string;
  /** 単位。 */
  unit: string;
  /** 単価（円・整数）。材工共の複合単価。 */
  unitPrice: number;
  taxCategory: TaxCategory;
  createdAt: string;
};

export type NewPriceMasterItemInput = {
  name: string;
  spec: string;
  unit: string;
  unitPrice: number;
  taxCategory: TaxCategory;
};
