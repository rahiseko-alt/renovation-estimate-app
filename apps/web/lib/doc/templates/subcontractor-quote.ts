// ③下請の見積書（下請 → 元請）に**印字される文字**。
//
// **紙に印字される文字はこのファイルだけが持つ**（docs/design.md 7章
// 「文言の住所を1つに決める規則」）。画面の操作の文言（採用・保留・一覧へ・未入力の
// 出し方）は lib/flowText.ts が持つ。依存の向きは固定する：
// テンプレートは content.ts / flowText.ts を import しない。
//
// このファイルは DocTemplate（用紙に並べるブロックの列）を持たない。
// ③は画面（D8 見積もり書類）として読む書類で、PDF も印刷レイアウトも作らないため。
// 用紙に起こすことになったら、①②と同じ形の DocTemplate をここに足す。
//
// **一次情報**（発行元の原本。解説記事の孫引きではない）:
// - 建設業法 第20条: https://laws.e-gov.go.jp/law/324AC0000000100
// - 国土交通省「建設業法令遵守ガイドライン（第12版）」:
//   https://www.mlit.go.jp/totikensangyo/const/content/001979917.pdf
// - 国土交通省「【専門工事業者向け】建設工事の見積書様式例 徹底書き方ガイド（別紙03）」:
//   https://roumuhi.mlit.go.jp/mlit-files/20260316_06.pdf
// - 同（運用編）令和8年3月: https://roumuhi.mlit.go.jp/mlit-files/20260326_01.pdf
// - 国土交通省「法定福利費を内訳明示した見積書の作成手順」:
//   https://www.mlit.go.jp/common/001090440.pdf
//
// 欄の採否は `docs/design.md` 3章「下請の見積書の鑑（表紙）と内訳（2026-08-07）」が持つ。
// **経路の異なる6団体の実物で一致した欄だけをここに置く**（一致しなかった欄は
// こちらの裁量として、同章に分けて書いてある）。

/**
 * 鑑（表紙）と内訳明示に印字される見出し・ラベル。
 *
 * 5経費のラベルは、下請の回答画面（lib/quoteFlowText.ts の
 * `QUOTE_GROUP_RESPONSE_TEXT`）にも似た文字がある。あちらは**入力欄のラベル**で
 * 単位（円）が付き、こちらは**書類に印字される費目名**である。別の言葉なので
 * それぞれが持つ（テンプレートは content.ts を import しない、という上の規則もある）。
 */
export const SUBCONTRACTOR_QUOTE_TEXT = {
  title: "見積書",
  quoteNumberLabel: "見積番号",
  issuedAtLabel: "作成日",
  /** 宛先は会社宛なので「御中」。個人宛の②（御見積書）の「様」と取り違えない。 */
  recipientSuffix: "御中",
  /** 元請の会社設定（請負者情報）が空のとき。宛先を空欄のまま出さない。 */
  recipientUnset: "（宛先未設定）",
  issuerHeading: "見積提出者",
  issuerAddressLabel: "住所",
  issuerTelLabel: "TEL",
  issuerContactLabel: "担当",
  issuerEmailLabel: "メール",
  workNameLabel: "工事名",
  workPlaceLabel: "工事場所",
  workPeriodLabel: "工期",
  workPeriodValue: (from: string, to: string) => `自 ${from}　至 ${to}`,
  validUntilLabel: "見積有効期限",
  paymentTermsLabel: "支払条件",
  deliveryPlaceLabel: "受渡場所",
  netAmountLabel: "見積金額合計（税抜）",
  taxRateLabel: "消費税率",
  taxRateValue: (ratePercent: number) => `${ratePercent}%`,
  taxAmountLabel: "消費税額",
  grandTotalLabel: "見積金額合計（税込）",
  closing: "以上のとおり、お見積り申し上げます。",
  /** 鑑別紙。ここから下が建設業法第20条第1項の内訳明示にあたる。 */
  breakdownHeading: "内訳明示",
  materialCostLabel: "材料費",
  laborCostLabel: "労務費",
  legalWelfareCostLabel: "法定福利費（事業主負担分）",
  safetyHealthCostLabel: "安全衛生経費",
  retirementMutualAidCostLabel: "建設業退職金共済掛金",
  workDaysLabel: "必要となる作業日数",
  workDaysValue: (days: number) => `${days}日`,
  /** 材料費に付ける付記（元請が支給する材料があればその旨）。 */
  materialSuppliedLabel: "元請支給材料",
  materialSuppliedNone: "なし",
  /** 明細（工事ごとの数量・単価）。 */
  linesHeading: "工事内訳",
} as const;

/**
 * 鑑別紙に印字される法令の注意文。**原文のまま**載せる（要約・言い換えをしない）。
 *
 * 出典は国土交通省の見積書様式例（上の一次情報）。「上記５つの経費」は、
 * 直前に並ぶ材料費・労務費・法定福利費・安全衛生経費・建設業退職金共済掛金を指す。
 * **この文はその5つの直後に置く**（離すと「上記」が何を指すか読めなくなる）。
 *
 * 第20条第2項・第6項は**禁止規定**、第4項は注文者の**努力義務**であって、
 * 3つを一緒くたに「努力義務」と書かない（docs/design.md 3章）。
 */
export const SUBCONTRACTOR_QUOTE_LEGAL_NOTICE = [
  "上記５つの経費の額について、受注者が通常必要と認められる額を著しく下回るように見積もること及び注文者が通常必要と認められる額を著しく下回ることとなるように変更依頼することは、建設業法第20条第２項、第６項において禁止されています。",
  "また、注文者には、建設業法第20条第４項により、本見積書の内容を考慮する努力義務が課されています。",
] as const;
