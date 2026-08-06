// デモに入れるデータの中身。**ここは営業の都合で単独で変わる**ので、
// 書き込みの手順（lib/db/demoSeed.ts）から分けて置く。
//
// 登場する会社名・人名・住所・メールアドレスはすべて架空のダミー
// （AGENTS.md 公開前提2：実在する第三者を特定できる情報を書かない）。

export const CUSTOMER_NAME = "見本 太郎";
export const SITE_ADDRESS = "東京都新宿区西新宿0-0-0 サンプルマンション101";

/** 同じ内容に作り直すための目印。同じ owner_id で2回実行しても増えない。 */
export const DEMO_WORK_NAME = `${SITE_ADDRESS} リフォーム工事`;

/** 明細。単価は下請が埋めるので0で置く（元請は金額を知らないのが正しい前提）。 */
export const LINE_SOURCE = [
  { name: "キッチン工事", unit: "式", quantity: 1 },
  { name: "浴室工事", unit: "式", quantity: 1 },
  { name: "内装工事", unit: "㎡", quantity: 42 },
  { name: "解体・廃棄物処理費", unit: "式", quantity: 1 },
];

/** 法定④⑤⑥⑧の9スロット。会社設定の定型文が入っている想定の初期値。 */
export const LEGAL_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["responsibility_scope", "本書に記載の工事範囲一式とする。"],
  ["subcontract_schedule", "着工日は別途協議のうえ決定する。"],
  ["overall_schedule", "全体工期は着工日から30日間を予定する。"],
  ["quote_conditions", "本書記載の条件によるものとする。"],
  ["trade_boundary", "電気・給排水設備工事との取合いは別途協議とする。"],
  ["special_parts", "特殊な施工部分はない。"],
  ["material_cost_burden", "材料費は元請の負担とする。"],
  ["safety_measures_burden", "労働災害防止対策の費用は元請の負担とする。"],
  ["waste_disposal_burden", "建設副産物の運搬及び処理は元請の負担とする。"],
];

/** 施工条件・範囲リストの12区分。デモでは全部に印を付けた状態にする。 */
export const SITE_CONDITIONS: ReadonlyArray<readonly [string, string]> = [
  ["materials", "include"],
  ["assembly_processing", "include"],
  ["transport", "include"],
  ["scaffolding", "exclude"],
  ["marking_out", "include"],
  ["curing", "include"],
  ["cleanup", "include"],
  ["equipment", "include"],
  ["drawings_documents", "include"],
  ["samples", "exclude"],
  ["inspection_confirmation", "include"],
  ["safety", "include"],
];

/** 会社設定（請負者情報）。見積書PDFの請負者ボックスに出る。 */
export const COMPANY_PROFILE = {
  contractor_name: "サンプル建設株式会社",
  representative_name: "見本 一郎",
  address: "東京都千代田区丸の内0-0-0 サンプルビル5階",
};

/** 3社ぶんの回答。同じ明細でも社によって値が違うのが比較表の見どころ。 */
export const COMPANIES = [
  {
    companyName: "サンプル内装工業",
    email: "sample-naiso@example.com",
    prices: [820_000, 640_000, 3_200, 85_000],
    breakdown: {
      material_cost: 1_900_000,
      labor_cost: 1_200_000,
      legal_welfare_cost: 168_000,
      safety_health_cost: 42_000,
      retirement_mutual_aid_cost: 12_000,
      work_days: 22,
      material_supplied_note: "",
    },
  },
  {
    companyName: "テスト住宅設備",
    email: "test-setsubi@example.com",
    prices: [760_000, 710_000, 3_500, 92_000],
    breakdown: {
      material_cost: 2_050_000,
      labor_cost: 1_050_000,
      legal_welfare_cost: 147_000,
      safety_health_cost: 38_000,
      retirement_mutual_aid_cost: 11_000,
      work_days: 25,
      material_supplied_note: "石膏ボードは元請支給とする。",
    },
  },
  {
    companyName: "ダミー工務店",
    email: "dummy-koumuten@example.com",
    prices: [880_000, 600_000, 2_980, 78_000],
    breakdown: {
      material_cost: 1_780_000,
      labor_cost: 1_320_000,
      legal_welfare_cost: 184_000,
      // 未入力のまま返してくる社（努力義務なので空でも回答は成立する）。
      safety_health_cost: null,
      retirement_mutual_aid_cost: null,
      work_days: 20,
      material_supplied_note: "",
    },
  },
];

/** デモに登場する下請の社数。画面の案内文が数字を持たないようにここから取る。 */
export const DEMO_SUBCONTRACTOR_COUNT = COMPANIES.length;
