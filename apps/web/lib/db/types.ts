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
  /**
   * 法定①工事名称（docs/design.md 3章）。案件情報から自動で組み立てた初期値を持ち、
   * 画面上で直せる（docs/design.md 7章「自動で埋めた項目も、画面に出す」）。
   */
  workName: string;
  createdAt: string;
};

export type NewProjectInput = {
  customerName: string;
  siteAddress: string;
};

/**
 * 明細行1件。calc.ts の EstimateLine に、保存された行だけが持つ安定IDを足したもの。
 * 写真の紐づけ・下請からの単価採用（1明細1社の排他）に使う
 * （docs/design.md 7章「現行実装からの変更点」）。
 *
 * calc.ts 側の型はあえて変えていない。EstimateLine を要求する関数
 * （calcEstimate 等）には、id を含む値をそのまま渡せる（TypeScript の構造的型付けで、
 * 余分なプロパティを持つ値は変数経由なら代入可能なため）。id が要らない場所
 * （calc.ts のテスト等）は今までどおり EstimateLine のリテラルで書ける。
 */
export type PersistedEstimateLine = EstimateLine & {
  id: string;
};

export type Estimate = {
  id: string;
  projectId: string;
  lines: PersistedEstimateLine[];
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

// ---------------------------------------------------------------------------
// 法定項目スロット（docs/design.md 3章・7章）。
// ①工事名称・②施工場所は Project.workName / siteAddress、③設計図書（数量等を含む）は
// 写真＋数量から導く製品仮説（充足判定条件は未決。docs/design.md「まだ決めていないこと」）
// で、いずれもここには含めない。④⑤⑥⑧の9項目だけをここで扱う。
// ---------------------------------------------------------------------------

/**
 * 法定項目スロットの識別子。supabase/migrations/20260805060100_legal_item_slots.sql の
 * check 制約と語彙を一致させる（値の置き場所はこの配列に一本化する）。
 */
export const LEGAL_ITEM_SLOT_KEYS = [
  "responsibility_scope",
  "subcontract_schedule",
  "overall_schedule",
  "quote_conditions",
  "trade_boundary",
  "special_parts",
  "material_cost_burden",
  "safety_measures_burden",
  "waste_disposal_burden",
] as const;

export type LegalItemSlotKey = (typeof LEGAL_ITEM_SLOT_KEYS)[number];

/**
 * スロットの状態。「未定」は利用者が明示的に選んだ場合にだけ使い、入力し忘れとは
 * 区別する（docs/design.md 7章）。
 */
export const LEGAL_ITEM_SLOT_STATUSES = [
  "filled",
  "undetermined",
  "unset",
] as const;

/**
 * 1スロットの本文の上限。DBには長さの制約が無い（この列を書けるのはログイン済みの
 * 所有者だけで、第三者の入口ではないため移行を足さない）。それでも際限なく受け取ると
 * 書類が破綻するので、境界はアプリ側で止める。
 *
 * **この定数はこのファイルが持つ。** 入力欄（`components/LegalItemsForm.tsx`）と
 * 保存（`lib/db/legalItemSlots.ts`）の両方が同じ値を要るが、前者はクライアント側の
 * 部品なので、`lib/db/legalItemSlots.ts` から値として import すると
 * Supabase クライアント（`lib/db/client.ts`）ごとブラウザ側の束に入り、ビルドが落ちる。
 * このファイルは型と語彙だけなので、どちらからでも安全に引ける。
 */
export const MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH = 2_000;

export type LegalItemSlotStatus = (typeof LEGAL_ITEM_SLOT_STATUSES)[number];

/**
 * 会社設定が定型文の初期値を持つスロット（`docs/design.md` 7章
 * 「会社設定の定型文が初期値。案件ごとに上書き可 ／ ④責任施工範囲・⑥の3スロット・
 * ⑧の3スロット」）。
 *
 * **⑤（`subcontract_schedule` / `overall_schedule`）は入っていない。**
 * ⑤は工程、つまり案件ごとの日付で、事業者で共通の定型文にならない
 * （設計文書では着工希望日から埋める側の項目として分けてある）。
 */
export const COMPANY_DEFAULT_SLOT_KEYS = [
  "responsibility_scope",
  "quote_conditions",
  "trade_boundary",
  "special_parts",
  "material_cost_burden",
  "safety_measures_burden",
  "waste_disposal_burden",
] as const satisfies readonly LegalItemSlotKey[];

export type CompanyDefaultSlotKey = (typeof COMPANY_DEFAULT_SLOT_KEYS)[number];

/**
 * 請負者名・代表者名・住所の上限。①②の様式に印字される欄で、書けるのは
 * ログイン済みの所有者だけなので、DBの制約ではなくアプリ側の境界で止める
 * （`MAX_LEGAL_ITEM_SLOT_VALUE_LENGTH` と同じ考え方）。
 */
export const MAX_COMPANY_FIELD_LENGTH = 200;

export type LegalItemSlot = {
  id: string;
  projectId: string;
  ownerId: string;
  slotKey: LegalItemSlotKey;
  status: LegalItemSlotStatus;
  value: string | null;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// 施工条件・範囲リスト（法定⑦施工環境・施工制約。docs/design.md 5章・7章）。
// ---------------------------------------------------------------------------

/**
 * 区分の識別子。supabase/migrations/20260805060400_site_condition_checks.sql の
 * check 制約と語彙を一致させる。
 */
export const SITE_CONDITION_CATEGORIES = [
  "materials",
  "assembly_processing",
  "transport",
  "scaffolding",
  "marking_out",
  "curing",
  "cleanup",
  "equipment",
  "drawings_documents",
  "samples",
  "inspection_confirmation",
  "safety",
] as const;

export type SiteConditionCategory = (typeof SITE_CONDITION_CATEGORIES)[number];

/** ○（条件内）／×（条件外）／未検討。一次情報の指示欄の使い方に合わせる。 */
export const SITE_CONDITION_MARKS = ["include", "exclude", "unset"] as const;

export type SiteConditionMark = (typeof SITE_CONDITION_MARKS)[number];

export type SiteConditionCheck = {
  id: string;
  projectId: string;
  ownerId: string;
  category: SiteConditionCategory;
  mark: SiteConditionMark;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// 会社設定（docs/design.md 7章「画面は5つ」）。
// ---------------------------------------------------------------------------

export type CompanyProfile = {
  ownerId: string;
  contractorName: string;
  representativeName: string;
  address: string;
  /** legal_item_slots の初期値。キーは LegalItemSlotKey と同じ語彙。 */
  defaultSlotValues: Partial<Record<LegalItemSlotKey, string>>;
  updatedAt: string;
};

export type UpdateCompanyProfileInput = {
  contractorName: string;
  representativeName: string;
  address: string;
  defaultSlotValues: Partial<Record<LegalItemSlotKey, string>>;
};

// ---------------------------------------------------------------------------
// 下請台帳（docs/design.md 7章「画面は5つ」）。
// ---------------------------------------------------------------------------

export type Subcontractor = {
  id: string;
  ownerId: string;
  companyName: string;
  email: string;
  createdAt: string;
};

export type NewSubcontractorInput = {
  companyName: string;
  email: string;
};

// ---------------------------------------------------------------------------
// 依頼グループ（docs/design.md 7章「依頼グループの単位」）。
// 1明細＝1依頼＝1社だった QuoteRequest を、複数社への同時依頼に作り直したもの。
// ---------------------------------------------------------------------------

/**
 * 予定価格帯。建設業法施行令第6条の見積期間（docs/design.md 3章の表）の区分と一致させる。
 * 依頼を出す時点では単価が空で明細から予定価格を計算できないため、元請が自分で選ぶ。
 */
export const PLANNED_PRICE_BANDS = [
  "under_500man",
  "between_500man_and_5000man",
  "over_5000man",
] as const;

export type PlannedPriceBand = (typeof PLANNED_PRICE_BANDS)[number];

export type QuoteRequestGroup = {
  id: string;
  projectId: string;
  ownerId: string;
  /** 提示日時。見積期間（3章）の起算点。 */
  presentedAt: string;
  createdAt: string;
};

export type NewQuoteRequestGroupInput = {
  projectId: string;
};

export type QuoteGroupRequestStatus = "pending" | "responded" | "imported";

/** 元請側で見る、社ごとの依頼（売価・掛率・原価・施主名を含む）。 */
export type QuoteGroupRequest = {
  id: string;
  groupId: string;
  ownerId: string;
  subcontractorId: string;
  /** 回答画面 /q/[token] の資格情報。 */
  token: string;
  plannedPriceBand: PlannedPriceBand;
  /** 予定価格帯とグループの提示日時から計算した回答期限（日本時間で確定）。 */
  responseDueAt: string;
  /** 対象明細の範囲。PersistedEstimateLine.id を指す。 */
  lineItemIds: string[];
  status: QuoteGroupRequestStatus;
  respondedAt: string | null;
  importedAt: string | null;
  createdAt: string;
};

export type NewQuoteGroupRequestInput = {
  groupId: string;
  subcontractorId: string;
  plannedPriceBand: PlannedPriceBand;
  lineItemIds: string[];
};

/**
 * 下請向けの投影型（token 経由で取得する内容）。
 *
 * QuoteGroupRequest から売価・掛率・原価・owner_id・施主名を意図的に落とす。
 * 「見せてよい欄」だけを型で表すことで、実装が「持っている値を全部出す」方向に
 * 変わっても漏洩経路にならないようにする（docs/design.md 7章「下請に見せるもの・
 * 見せないもの」）。ここに無いフィールドを後から気軽に足さないこと。
 */
export type QuoteGroupRequestForSubcontractor = {
  id: string;
  token: string;
  /** 法定①工事名称。 */
  workName: string;
  /** 法定②施工場所。下請に見せる義務がある（docs/design.md 3章）。施主名は含めない。 */
  siteAddress: string;
  responseDueAt: string;
  lineItemIds: string[];
  status: QuoteGroupRequestStatus;
};

// ---------------------------------------------------------------------------
// 明細ごとの採用（docs/design.md 7章「取り込みは『追加』ではなく『採用』にする」）。
// 見積に明細行を足すのではなく、「この明細はどの社の依頼を採ったか」を
// 1明細につき1件だけ持つ（排他）。テーブル定義は
// supabase/migrations/20260806010000_line_adoptions.sql。
// ---------------------------------------------------------------------------

export type LineAdoption = {
  id: string;
  projectId: string;
  ownerId: string;
  /** 採用した明細行。PersistedEstimateLine.id を指す。 */
  lineItemId: string;
  /** 採用した社ごとの依頼。QuoteGroupRequest.id を指す。 */
  quoteGroupRequestId: string;
  adoptedAt: string;
};

export type AdoptLineInput = {
  projectId: string;
  lineItemId: string;
  quoteGroupRequestId: string;
};

/**
 * 下請が返す見積の必要経費の内訳（docs/design.md 3章「下請が返す見積書に
 * 求められる内訳」）。建設業法第20条第1項を踏まえ、下請が最低限明示するよう
 * **努める**べき項目。努力義務なので入力必須にしないが、欄は必ず出す。
 *
 * 「未入力」と「0と回答した」を区別するため null を許す（0で埋めない）。
 */
export type QuoteResponseCostBreakdown = {
  materialCost: number | null;
  laborCost: number | null;
  legalWelfareCost: number | null;
  safetyHealthCost: number | null;
  retirementMutualAidCost: number | null;
  workDays: number | null;
  /** 元請が材料を支給する場合にその旨を書く欄。 */
  materialSuppliedNote: string;
};

/** 回答の明細1行。明細ごとに数量と原価単価の両方を出させる。 */
export type QuoteResponseLine = {
  lineItemId: string;
  quantity: number;
  costUnitPrice: number;
};

export type QuoteGroupResponse = {
  id: string;
  quoteGroupRequestId: string;
  breakdown: QuoteResponseCostBreakdown;
  lines: QuoteResponseLine[];
  respondedAt: string;
};

export type NewQuoteGroupResponseInput = {
  token: string;
  breakdown: QuoteResponseCostBreakdown;
  lines: QuoteResponseLine[];
};
