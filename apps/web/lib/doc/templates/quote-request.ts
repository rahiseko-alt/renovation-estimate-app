// ①見積依頼書のテンプレート（建設業法の法定記載事項に基づく）。
//
// **紙に印字される文字はこのファイルだけが持つ**（docs/design.md 7章
// 「文言の住所を1つに決める規則」）。画面のUI文言は lib/content.ts が持つ。
//
// この書類は下請に渡る。**施主名・売価・掛率・原価をここに置かない**
// （docs/design.md 7章「下請に見せるもの・見せないもの」）。施主名は法定8項目に
// 含まれず、売価・掛率・原価が渡ると相見積の前提が崩れる。
// 「気を付ける」で守らず、テンプレートに欄を作らないことで構造的に守る。
//
// PDFは作らない。画面＝HTML、印刷＝ブラウザ（docs/design.md 7章
// 「①見積依頼書のPDFは作らない」）。描画器を1つにすることで、画面と印刷が
// ずれる余地を構造的に消す。

import { formatDateJst } from "../date";
import { A4_PORTRAIT, type DocTemplate } from "../schema";

/** 写真枠の1辺（書類の実寸・CSS px）。 */
const PHOTO_FRAME_PX = 200;

export const QUOTE_REQUEST_TEMPLATE: DocTemplate = {
  id: "quote-request-kensetsugyoho",
  pageWidthPx: A4_PORTRAIT.widthPx,
  pageHeightPx: A4_PORTRAIT.heightPx,
  marginPx: 53,
  blocks: [
    { kind: "title", text: "御見積依頼書" },
    {
      kind: "fieldList",
      align: "left",
      fields: [
        // 法定①②。下請に見せる義務がある（docs/design.md 3章）。
        { label: "工事名称", value: (data) => data.workName },
        { label: "施工場所", value: (data) => data.siteAddress },
        {
          label: "見積回答期限",
          value: (data) =>
            data.responseDueAt ? `${formatDateJst(data.responseDueAt)}まで` : "",
        },
        { label: "作成日", value: (data) => formatDateJst(data.issuedAt) },
      ],
    },
    { kind: "sectionHeading", text: "工事内容" },
    {
      // 現況写真＋数量で法定③（設計図書）に充てる（docs/design.md 3章の製品仮説）。
      // 1箇所につき写真枠は1つ（5章「1箇所あたり何枚撮るか」で一次情報から確定）。
      kind: "photoLine",
      frameSizePx: PHOTO_FRAME_PX,
      quantityLabel: "数量",
      emptyQuantityText: "数量未入力",
    },
    { kind: "legalItems", heading: "見積条件" },
    {
      kind: "notes",
      lines: [
        "※ 本書に記載の条件でお見積りください。ご不明の点はご連絡ください。",
      ],
    },
  ],
};
