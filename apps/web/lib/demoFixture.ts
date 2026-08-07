// デモに入れるデータの中身。**ここは営業の都合で単独で変わる**ので、
// 書き込みの手順（lib/db/demoSeed.ts）から分けて置く。
//
// 登場する会社名・人名・住所・メールアドレスはすべて架空のダミー
// （AGENTS.md 公開前提2：実在する第三者を特定できる情報を書かない）。

export const CUSTOMER_NAME = "見本 太郎";
export const SITE_ADDRESS = "東京都新宿区西新宿0-0-0 サンプルマンション101";

/** 同じ内容に作り直すための目印。同じ owner_id で2回実行しても増えない。 */
export const DEMO_WORK_NAME = `${SITE_ADDRESS} リフォーム工事`;

/**
 * 下請3社の識別に使うメールアドレス。明細の「どの社を採ったか」と社の定義を
 * この定数で結ぶ（AGENTS.md「結合を増やさない」1：同じ値を2箇所以上に書かない）。
 */
const NAISO = "sample-naiso@example.com";
const SETSUBI = "test-setsubi@example.com";
const KOUMUTEN = "dummy-koumuten@example.com";

/**
 * 明細。単価は下請が埋めるので0で置く（元請は金額を知らないのが正しい前提）。
 *
 * **「式」は解体・廃棄物処理費（様式に印字済みの費目）の1行だけにしてある。**
 * この製品が言えることは「現場で打つのは数量だけ」なのに、デモの明細が全部「式」だと
 * 数量が常に1になり、その主張がデモ自身の反例になる。数量が実数で成立する項目に寄せる。
 * 単位は `lib/content.ts` の `UNITS` にあるものだけを使う。
 *
 * `adoptedBy` は、比較表で**どの社を採った状態で見せるか**。3タップの経路に
 * 「採用」のタップが無いので、投入の時点で採ってある状態にする。
 * 最安を計算で選ばない（「安い順に自動で採らない」は製品の姿勢で、
 * `lib/db/comparison.ts` の `cheapestRequestIdByLineId` にも同じ注記がある）。
 * 3社に散らしてあるのは、「工事の項目ごとに、別々の社を選べます」という画面の説明を
 * データの側でも成り立たせるため。
 */
export const LINE_SOURCE = [
  { name: "内装工事", unit: "㎡", quantity: 42, adoptedBy: KOUMUTEN },
  { name: "外壁工事", unit: "㎡", quantity: 68, adoptedBy: SETSUBI },
  { name: "給排水設備工事", unit: "箇所", quantity: 3, adoptedBy: NAISO },
  { name: "解体・廃棄物処理費", unit: "式", quantity: 1, adoptedBy: KOUMUTEN },
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

/**
 * 3社ぶんの回答。同じ明細でも社によって値が違うのが比較表の見どころ。
 *
 * `prices` は `LINE_SOURCE` と同じ並びの原価単価。数が合わないと `demoSeed` が
 * 例外を投げる（0円の回答が黙って入ると、比較表では「最安」に見えて気付けない）。
 * 明細ごとに最安の社が変わるようにしてある（1社が全部最安だと、明細ごとに選ぶ意味が
 * デモの画面から伝わらない）。
 *
 * `breakdown` は必要経費の内訳。各社の `prices × 数量` の合計と一致させてある
 * （金額の桁が噛み合っていないと、実務者には作り物だと分かる）。
 *
 * **社名は「業者A / 業者B / 業者C」にする。** 商談で見せる相手が一瞬で
 * 「3社を比べている」と分かる必要がある。それらしい架空の社名にすると、
 * 名前を読む手間が増えて、比較表の見どころ（同じ工事で単価が違う）から目が逸れる
 * （利用者からの指摘。`docs/failures.md` 2026-08-07）。
 */
export const COMPANIES = [
  {
    companyName: "業者A",
    email: NAISO,
    prices: [3_200, 4_800, 68_000, 85_000],
    breakdown: {
      material_cost: 380_000,
      labor_cost: 320_000,
      legal_welfare_cost: 44_800,
      safety_health_cost: 4_000,
      retirement_mutual_aid_cost: 1_000,
      work_days: 8,
      material_supplied_note: "",
    },
  },
  {
    companyName: "業者B",
    email: SETSUBI,
    prices: [3_500, 4_550, 82_000, 92_000],
    breakdown: {
      material_cost: 420_000,
      labor_cost: 325_000,
      legal_welfare_cost: 45_500,
      safety_health_cost: 2_900,
      retirement_mutual_aid_cost: 1_000,
      work_days: 10,
      material_supplied_note: "石膏ボードは元請支給とする。",
    },
  },
  {
    companyName: "業者C",
    email: KOUMUTEN,
    prices: [2_980, 5_200, 71_000, 78_000],
    breakdown: {
      material_cost: 400_000,
      labor_cost: 324_000,
      legal_welfare_cost: 45_760,
      // 未入力のまま返してくる社（努力義務なので空でも回答は成立する）。
      safety_health_cost: null,
      retirement_mutual_aid_cost: null,
      work_days: 7,
      material_supplied_note: "",
    },
  },
];

/** デモに登場する下請の社数。画面の案内文が数字を持たないようにここから取る。 */
export const DEMO_SUBCONTRACTOR_COUNT = COMPANIES.length;

/**
 * 見積書の鑑（表紙）に要る欄のうち、**いまDBに持っていないもの**のデモ用の値。
 *
 * 鑑に出す欄は国交省の見積書様式例と、経路の異なる6団体の実物で一致した項目
 * （`docs/design.md` 3章「下請の見積書の鑑（表紙）に出す欄」）。そのうち
 * 工事名・工事場所・金額・作業日数・5経費は既にDBにあるが、**下請の住所・TEL・
 * 担当・工期・見積有効期限・支払条件・受渡場所・見積番号は持っていない**
 * （下請台帳は社名とメールしか持たない）。**入力欄は増やさない**という
 * 利用者の決定（2026-08-07 の回答A）に従い、デモの間はここで決め打ちにする。
 *
 * **社ごとに違う値にしてある。** 3社を並べたときに、見た目で見分けが付かないと
 * 「1社ぶんの書類を3回見せている」ようにしか読めない。
 *
 * 会社名・人名・住所・電話番号はすべて明らかなダミー
 * （AGENTS.md 公開前提2：実在する第三者を特定できる情報を書かない）。
 * 電話番号は 0 が並ぶ形にして、実在の番号に当たらないようにしてある。
 */
export type QuoteCoverFixture = {
  /** 見積番号。 */
  quoteNumber: string;
  address: string;
  tel: string;
  /** 担当者名。 */
  contactName: string;
  /**
   * 工期（自・至）。**固定の日付では持たない。**
   * 見積依頼の提示日からの日数で持つ。固定日にすると、デモを見せるたびに
   * 工期だけが過去になり、作り物だと分かる。
   */
  workPeriodStartOffsetDays: number;
  workPeriodEndOffsetDays: number;
  /** 見積有効期限。作成日（下請が回答した日）からの日数。 */
  validityDays: number;
  paymentTerms: string;
  deliveryPlace: string;
};

/**
 * 下請台帳に登録が無い社（＝デモのデータではない社）に使う既定値。
 * デモの3社と同じく、明らかなダミーであることが見て分かる値にする。
 */
export const DEFAULT_QUOTE_COVER: QuoteCoverFixture = {
  quoteNumber: "0000-0000",
  address: "東京都〇〇区0-0-0",
  tel: "03-0000-0000",
  contactName: "〇〇 〇〇",
  workPeriodStartOffsetDays: 14,
  workPeriodEndOffsetDays: 28,
  validityDays: 30,
  paymentTerms: "毎月末日締切／翌月末日支払",
  deliveryPlace: "工事施工場所",
};

/**
 * デモの3社ぶん。社の識別はメールアドレス（COMPANIES と同じ定数）で結ぶ。
 *
 * **引き当ての関数はここに置かない。** このファイルの export 全部から
 * デモの版を算出しており（`lib/demoVersion.ts`）、材料は `JSON.stringify` を通る。
 * 関数はそこで消えるので、関数を export するとその中身が版に効かなくなる
 * （`tests/demoVersion.test.ts` が落ちる）。**ここが持つのは値だけ**にして、
 * 引き当ては読み取りの側（`lib/db/quoteDocuments.ts`）で行う。
 */
export const QUOTE_COVER_BY_EMAIL: Readonly<Record<string, QuoteCoverFixture>> = {
  [NAISO]: {
    quoteNumber: "A-2026-0071",
    address: "東京都〇〇区0-0-0 サンプル第1ビル2階",
    tel: "03-0000-0001",
    contactName: "見本 次郎",
    workPeriodStartOffsetDays: 14,
    workPeriodEndOffsetDays: 28,
    validityDays: 30,
    paymentTerms: "毎月末日締切／翌月末日支払（現金100%）",
    deliveryPlace: "工事施工場所",
  },
  [SETSUBI]: {
    quoteNumber: "B-2026-0158",
    address: "東京都〇〇市0-0-0 サンプルハイツ203",
    tel: "03-0000-0002",
    contactName: "見本 三郎",
    workPeriodStartOffsetDays: 10,
    workPeriodEndOffsetDays: 31,
    validityDays: 60,
    paymentTerms: "毎月20日締切／翌月20日支払（現金70% 手形30%）",
    deliveryPlace: "工事施工場所（元請倉庫渡しの材料を除く）",
  },
  [KOUMUTEN]: {
    quoteNumber: "C-2026-0233",
    address: "東京都〇〇区0-0-0 サンプル荘1階",
    tel: "03-0000-0003",
    contactName: "見本 四郎",
    workPeriodStartOffsetDays: 21,
    workPeriodEndOffsetDays: 35,
    validityDays: 14,
    paymentTerms: "工事完了・検査合格の翌月末日支払（現金100%）",
    deliveryPlace: "工事施工場所",
  },
};
