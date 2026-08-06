// 新設計（見積依頼グループ → 下請の回答 → 比較表と採用）の画面の文言。
//
// lib/content.ts が300行を超えたので、**後から単独で直したくなる塊**として
// ここに分けた（AGENTS.md「結合を増やさない」：行数で割らず、塊ごとに分ける）。
// 文言の置き場所は lib/content.ts のままにするため、あちらから re-export している。
//
// 紙に印字される文字はここに置かない。それはテンプレート（lib/doc/templates/）が持つ
// （docs/design.md 7章「文言の住所を1つに決める規則」）。

/**
 * 下請の回答画面（/q/[token]。ログイン不要）の文言。作り直した版。
 *
 * 明細ごとに数量・単価を入れさせ、依頼全体に必要経費の内訳欄を出す
 * （docs/design.md 3章「下請が返す見積書に求められる内訳」。単価1つだけの形は
 * ガイドラインが望ましくない行為事例として名指ししている）。
 */
export const QUOTE_GROUP_RESPONSE_TEXT = {
  heading: "御見積のご依頼",
  description:
    "下記の工事について、数量と単価をご記入ください。必要経費の内訳もご記入いただけます。",
  workNameLabel: "工事名称",
  siteAddressLabel: "施工場所",
  dueAtLabel: "見積回答期限",
  linesHeading: "工事内容",
  quantityLabel: "数量",
  costUnitPriceLabel: "単価（円）",
  breakdownHeading: "必要経費の内訳",
  /** 努力義務であることを、書かせる前に明示する。 */
  breakdownNote:
    "建設業法にもとづき、下記の内訳を明示するよう努めることとされています。分かる範囲でご記入ください（未記入でも送信できます）。",
  materialCostLabel: "材料費（円）",
  materialSuppliedNoteLabel: "元請支給の材料があれば、その内容",
  laborCostLabel: "労務費（円）",
  legalWelfareCostLabel: "法定福利費（事業主負担分・円）",
  safetyHealthCostLabel: "安全衛生経費（円）",
  retirementMutualAidCostLabel: "建設業退職金共済掛金（円）",
  workDaysLabel: "必要となる作業日数（日）",
  submit: "回答する",
  submitting: "送信中…",
  invalidNumber: "数字を入力してください（0以上）。",
  needAllLines: "すべての工事について、数量と単価をご記入ください。",
  failed: "送信に失敗しました。もう一度お試しください。",
  thanks: "回答しました。ありがとうございました。",
  alreadyResponded: "この依頼は既に回答済みです。ご協力ありがとうございました。",
  notFound: "この依頼は見つかりません。リンクをご確認ください。",
} as const;

/**
 * 比較表と採用の画面の文言（docs/design.md 7章「取り込みは『追加』ではなく
 * 『採用』にする」）。1明細につき採用は1社まで（排他）。
 */
export const COMPARISON_TEXT = {
  heading: "見積の比較",
  empty: "まだ依頼がありません。",
  noResponses: "まだ回答がありません。",
  lineColumn: "工事項目",
  quantityColumn: "数量",
  adopt: "採用する",
  adopted: "採用中",
  cancelAdoption: "採用をやめる",
  waiting: "回答待ち",
  cheapestMark: "最安",
  /** 自動で選ばない理由を画面にも書く。 */
  cheapestNote:
    "最安の印は目安です。自動では選びません。明細ごとに1社だけ選べます。",
  adoptFailed: "採用できませんでした。もう一度お試しください。",
  back: "もどる",
} as const;

/** 法定項目スロットの画面表示名（建設業法の項目名。docs/design.md 3章の原文表記）。 */
export const LEGAL_ITEM_SLOT_LABELS = {
  responsibility_scope: "責任施工範囲",
  subcontract_schedule: "下請工事の工程",
  overall_schedule: "全体工程",
  quote_conditions: "見積条件",
  trade_boundary: "他工種との関係部位",
  special_parts: "特殊部分",
  material_cost_burden: "材料費の負担",
  safety_measures_burden: "労働災害防止対策の負担",
  waste_disposal_burden: "建設副産物の運搬及び処理の負担",
} as const;

/** 施工条件・範囲リストの12区分の画面表示名（docs/design.md 5章の一次情報）。 */
export const SITE_CONDITION_LABELS = {
  materials: "材料",
  assembly_processing: "組立・加工",
  transport: "運搬",
  scaffolding: "足場",
  marking_out: "墨出し",
  curing: "養生",
  cleanup: "片付け",
  equipment: "機器",
  drawings_documents: "図面・書類",
  samples: "見本",
  inspection_confirmation: "検査・確認",
  safety: "安全",
} as const;

/** 依頼グループの送信画面の文言。 */
export const SEND_REQUEST_TEXT = {
  heading: "見積依頼を出す",
  gateHeading: "送信前の確認",
  gateOk: "法定項目はすべて記入済みです。",
  gateNgHeading: "次の項目が未記入のため、まだ送れません。",
  gateNgSlots: "法定項目",
  gateNgConditions: "施工条件・範囲リスト",
  subcontractorsHeading: "送り先",
  subcontractorsEmpty: "下請が登録されていません。先に下請台帳に登録してください。",
  priceBandHeading: "予定価格帯",
  /** 3帯の表示名。見積期間（建設業法施行令第6条）の根拠になる。 */
  priceBandLabels: {
    under_500man: "500万円未満（見積期間1日以上）",
    between_500man_and_5000man: "500万円以上5,000万円未満（10日以上）",
    over_5000man: "5,000万円以上（15日以上）",
  } as const,
  priceBandRequired: "予定価格帯を選んでください。",
  send: "この内容で送る",
  sending: "送信中…",
  sent: "依頼を出しました。",
  failed: "送信できませんでした。もう一度お試しください。",
  needSubcontractor: "送り先を1社以上選んでください。",
} as const;

/** 書類画面のUI文言（紙に印字される文字はテンプレート側が持つ）。 */
export const SPIKE_TEXT = {
  note: "書類の行を押すと、写真と数量を入れるシートが出ます。写真枠は直接押せます。",
  openSheet: "写真・数量を入れる",
  print: "印刷する",
  takePhoto: "写真を撮る",
  retakePhoto: "撮り直す",
  quantityLabel: "数量",
  closeSheet: "閉じる",
} as const;
