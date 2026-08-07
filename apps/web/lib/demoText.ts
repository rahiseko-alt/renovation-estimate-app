// デモの文言。画面の並びは docs/flows.md「デモの画面の並び」（D1〜D10）が正。
//
// **狙いは「触ってもらう」ことであって、機能を説明することではない。**
// 商談の相手はPCに不慣れな実務者で、設定画面を1つでも挟むとそこで止まる。
// だから経路は表の1本に閉じ、
// 会社設定・下請台帳・法定項目21件は**入力させずに、入った状態で見せる**。
//
// 機能そのものは1つも削っていない。デモの利用者にも通常の画面はすべて開ける。

import {
  LEGAL_ITEM_SLOT_LABELS,
  SITE_CONDITION_LABELS,
} from "./quoteFlowText";

/**
 * デモで既に埋まっている法定項目の件数。
 * 数字を直接書かず、項目の定義から数える（項目が増減したら表示も追随する）。
 */
export const DEMO_LEGAL_ITEM_COUNT =
  Object.keys(LEGAL_ITEM_SLOT_LABELS).length +
  Object.keys(SITE_CONDITION_LABELS).length;

/**
 * デモを始める入口のURL。トップ画面のフォームがここへ POST する。
 *
 * **Server Action にしない。** 呼び出し先IDがビルドごとに変わるため、
 * 古いページを開いたままのブラウザから押すと無反応になる（実際に起きた。
 * `app/demo/start/route.ts` の冒頭を見る）。URL はビルドで変わらない。
 */
export const DEMO_START_PATH = "/demo/start";

/** トップ画面に置くデモの入口。未ログインの人が最初に押すのはこれ1つ。 */
export const DEMO_ENTRY_TEXT = {
  start: "デモを触ってみる",
  description: "登録は要りません。その場で見積書までできます。",
  /** ログイン導線は残す。デモを始めた人と、実際に使う人は別。 */
  loginNote: "アカウントをお持ちの方",
} as const;

/** 写真の画面（1タップ目の着地／2タップ目を押す場所）。 */
export const DEMO_PHOTO_TEXT = {
  heading: "現場の写真を撮る",
  description:
    "いま居る部屋で構いません。撮ると、この現場の見積が下請3社から返ってきた状態になります。",
  take: "写真を撮る",
  skip: "写真なしで進む",
  uploading: "送信中…",
  /** 撮影に失敗しても先へ進める。デモを止めないことを優先する。 */
  failed: "写真を送れませんでした。写真なしで進めます。",
} as const;

/** 比較表の上に出すデモの案内（2タップ目の着地）。 */
export const DEMO_COMPARISON_TEXT = {
  heading: "3社から見積が返ってきました",
  description:
    "同じ工事に対する各社の単価が横に並びます。工事の項目ごとに、別々の社を選べます。",
  /** 面倒な設定を隠すのではなく、済んでいる事実として見せる。 */
  legalNote: (count: number) =>
    `この依頼には建設業法の法定項目 ${count} 件が入っています`,
  legalLink: "中身を見る",
  toPdf: "見積書を出す",
} as const;

/** デモ中であることを画面上部に常に出す帯。実データと取り違えないため。 */
export const DEMO_BANNER_TEXT = {
  label: "デモ",
  description: "表示中のデータはすべて架空のものです。",
} as const;
