// 案件・見積のドメイン型。lib/db/ の外（画面・API）はこの型だけを見て、
// 実装（Supabase・テーブル定義は supabase/migrations/）を知らない
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

/** 案件に紐づく写真。特定の明細行ではなく「箇所」単位で管理する（lib/content.ts の PHOTO_AREAS）。 */
export type Photo = {
  id: string;
  projectId: string;
  /** 登録した利用者の識別子。他人の写真を推測 ID で読み書きさせないための境界に使う。 */
  ownerId: string;
  /** 箇所（PHOTO_AREAS のいずれか）。 */
  area: string;
  /** Supabase Storage バケット "photos" 内のオブジェクトキー。 */
  storagePath: string;
  createdAt: string;
};

export type NewPhotoInput = {
  projectId: string;
  area: string;
  storagePath: string;
};

/** 依頼の状態。pending: 回答待ち / responded: 回答が届いた（未取り込み） / imported: 見積に取り込み済み。 */
export type QuoteRequestStatus = "pending" | "responded" | "imported";

/**
 * 下請への見積依頼（明細1件ぶんの単価を頼む）。
 * 明細行に永続IDが無いため（Photo の area と同じ理由）、依頼した時点の
 * 工事項目・摘要・数量・単位をスナップショットとして持つ（lib/db/quoteRequests.ts 参照）。
 */
export type QuoteRequest = {
  id: string;
  projectId: string;
  /** 作った利用者の識別子。他人の依頼を推測 ID で読み書きさせないための境界に使う。 */
  ownerId: string;
  /** 回答画面 /q/[token] の資格情報。 */
  token: string;
  itemName: string;
  itemSpec: string;
  quantity: number;
  unit: string;
  taxCategory: TaxCategory;
  markupRate: number;
  costUnitPrice: number | null;
  status: QuoteRequestStatus;
  respondedAt: string | null;
  importedAt: string | null;
  createdAt: string;
};

export type NewQuoteRequestInput = {
  projectId: string;
  itemName: string;
  itemSpec: string;
  quantity: number;
  unit: string;
  taxCategory: TaxCategory;
  markupRate: number;
};
