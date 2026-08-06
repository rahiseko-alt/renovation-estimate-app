// ②御見積書のテンプレート（住宅リフォーム推進協議会 書式Ⅳ-1）。
// 一次情報: https://www.j-reform.com/publish/pdf_shosiki/mitumori.pdf
//
// **紙に印字される文字はこのファイルだけが持つ**（docs/design.md 7章
// 「文言の住所を1つに決める規則」）。画面のUI文言は lib/content.ts が持つ。
// 依存の向きは固定する：テンプレートは content.ts を import しない。
// content.ts はテンプレートを import しない。描画器だけが両方を知る。
//
// 様式を差し替えるときに触るのはこのファイルだけ。配置以外（金額の計算・
// 法定項目の検査・データの持ち方）をここに置かない。

import type { EstimateTotals } from "../../calc";
import { formatDateJst } from "../date";
import { A4_PORTRAIT, type DocTemplate, type LineColumnKey } from "../schema";

/**
 * 明細の末尾に既定で立てる費目。
 * 協議会様式では明細最終行に印字済みで、立て忘れを防ぐ設計になっている。
 * （印字される文字なのでテンプレート側が持つ。lib/db/estimates.ts が既定行を
 * 作るときに参照する。）
 */
export const DEFAULT_DISPOSAL_ITEM_NAME = "解体・廃棄物処理費";

/** ヘッダー・フッターの印字文言。協議会様式に合わせている。 */
export const ESTIMATE_DOCUMENT_TEXT = {
  title: "御見積書",
  recipientSuffix: "様",
  issuedAtLabel: "作成日",
  attachmentNote:
    "■添付書類：見積内容を補足するため、打ち合わせシートは必ず添付します。",
  keepNote: "※ この書類は大切に保管してください。",
} as const;

/**
 * 明細の列見出し。**この様式が定めている言葉**なのでテンプレート側が持つ。
 * 見積エディタ（画面）も同じ書類を編集しているので、入力欄のラベルにこれを使う
 * （AGENTS.md「結合を増やさない」1：同じ文言を2箇所以上に書かない）。
 * 種別・税区分は画面編集用の列で様式には無いため、ここには無い（lib/content.ts）。
 */
export const ESTIMATE_COLUMN_HEADINGS: Record<LineColumnKey, string> = {
  name: "工事項目",
  spec: "摘要（仕様）",
  quantity: "数量",
  unit: "単位",
  unitPrice: "単価",
  amount: "金額",
};

/**
 * 集計欄の行。協議会様式の印字に合わせている。勝手に言い換えない。
 * 見積エディタ（画面）の合計欄も同じ言葉を使うため、順序ごとここが持つ。
 */
export const ESTIMATE_TOTALS_ROWS = [
  { key: "directCostSubtotal", label: "直接工事費 小計" },
  { key: "overhead", label: "諸経費" },
  { key: "subtotalBeforeDiscount", label: "小計" },
  { key: "discount", label: "値引き" },
  { key: "netAmount", label: "工事価格 （税抜き）" },
  { key: "tax", label: "取引に係る消費税等" },
  { key: "grandTotal", label: "合計 （税込）" },
] as const;

/** 集計行のキーから、計算済みの集計値を取り出す。金額の計算は lib/calc.ts が持つ。 */
export const ESTIMATE_TOTALS_AMOUNT_BY_KEY: Record<
  (typeof ESTIMATE_TOTALS_ROWS)[number]["key"],
  (totals: EstimateTotals) => number
> = {
  directCostSubtotal: (totals) => totals.directCostSubtotal,
  overhead: (totals) => totals.overheadAmount,
  subtotalBeforeDiscount: (totals) => totals.subtotalBeforeDiscount,
  discount: (totals) => totals.discountAmount,
  netAmount: (totals) => totals.netAmount,
  tax: (totals) => totals.taxAmount,
  grandTotal: (totals) => totals.grandTotal,
};

/**
 * 協議会様式は「工事項目／摘要（仕様）／（単価・数量・時間 等）／金額」の4列だが、
 * 金額を計算可能にするため3列目を 数量／単位／単価 に分解している。
 * 種別・税区分は画面編集用の列で、様式には無いため印字しない。
 */
export const ESTIMATE_TEMPLATE: DocTemplate = {
  id: "estimate-jreform-iv-1",
  pageWidthPx: A4_PORTRAIT.widthPx,
  pageHeightPx: A4_PORTRAIT.heightPx,
  marginPx: 53, // 40pt ≒ 53px（96dpi換算）。既存PDFの余白に合わせる
  blocks: [
    { kind: "title", text: ESTIMATE_DOCUMENT_TEXT.title },
    {
      kind: "fieldList",
      align: "right",
      fields: [
        {
          label: ESTIMATE_DOCUMENT_TEXT.issuedAtLabel,
          value: (data) => formatDateJst(data.issuedAt),
        },
      ],
    },
    {
      kind: "fieldList",
      align: "left",
      fields: [
        {
          label: "",
          // 宛名は「施主名＋様」。②は施主に出す書類なので施主名を印字する
          // （下請に出す①とは違う。DocAudience で誤って混ぜないよう contractor に限る）。
          value: (data) =>
            `${data.customerName}${ESTIMATE_DOCUMENT_TEXT.recipientSuffix}`,
          audience: "contractor",
        },
        {
          label: "",
          value: (data) => data.siteAddress,
          audience: "contractor",
        },
      ],
    },
    {
      kind: "lineTable",
      columns: [
        { key: "name", heading: ESTIMATE_COLUMN_HEADINGS.name, align: "left", widthRatio: 140 },
        { key: "spec", heading: ESTIMATE_COLUMN_HEADINGS.spec, align: "left", widthRatio: 115 },
        { key: "quantity", heading: ESTIMATE_COLUMN_HEADINGS.quantity, align: "right", widthRatio: 55 },
        { key: "unit", heading: ESTIMATE_COLUMN_HEADINGS.unit, align: "right", widthRatio: 35 },
        { key: "unitPrice", heading: ESTIMATE_COLUMN_HEADINGS.unitPrice, align: "right", widthRatio: 85 },
        { key: "amount", heading: ESTIMATE_COLUMN_HEADINGS.amount, align: "right", widthRatio: 85 },
      ],
    },
    {
      kind: "totals",
      rows: ESTIMATE_TOTALS_ROWS.map((row) => ({
        label: row.label,
        amount: ESTIMATE_TOTALS_AMOUNT_BY_KEY[row.key],
        emphasize: row.key === "grandTotal",
      })),
    },
    {
      kind: "notes",
      lines: [
        ESTIMATE_DOCUMENT_TEXT.attachmentNote,
        ESTIMATE_DOCUMENT_TEXT.keepNote,
      ],
    },
  ],
};
