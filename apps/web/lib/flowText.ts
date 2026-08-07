// デモの画面の並び D3〜D8 の文言（docs/flows.md「デモの画面の並び」）。
//
// **この表に無いボタン・画面・遷移は作らない**（利用者の指示 2026-08-07）。
// 文言をここ1箇所に置くのは、画面と検査（E2E・prod-demo-check）が同じ文字を
// 見に行くため（lib/content.ts の作法に合わせる。AGENTS.md「結合を増やさない」1）。
//
// content.ts はこのファイルを re-export する。画面はどちらから引いてもよいが、
// **同じ文言を2箇所に書かない。**

/** D3 確認画面（はめ込んだ画像）。ボタンは保存・送信・修正の3つだけ。 */
export const DOCUMENT_CONFIRM_TEXT = {
  heading: "この内容で下請けに出します",
  description:
    "撮った写真が、そのまま見積依頼書の枠に入っています。数量を直したいときは「修正」を押してください。",
  save: "保存",
  send: "送信",
  edit: "修正",
  saved: "下書きに保存しました。",
  sendFailed: "送信できませんでした。もう一度お試しください。",
  // D3 は送り先を選ばせない（表にその操作が無い）ので、送り先は下請台帳の全社になる。
  // 台帳が空だと送りようがないが、そのとき出るのは送信側の
  // 「送り先を1社以上選んでください。」で、選ぶ欄が無いこの画面では何をすればよいか
  // 分からない。**この画面から出る言葉**を持たせる（ボタンもリンクも増やさない）。
  noSubcontractors:
    "下請けが1社も登録されていないため、送れません。先に下請台帳に登録してください。",
} as const;

/** D4 送信しました（デモ）。ロード中を3秒流してから D5 へ進む。 */
export const SENT_TEXT = {
  heading: "送信しました（デモ）",
  description: "選んだ下請けに、見積依頼書を送りました。",
  loading: "ロード中（デモ）",
  loadingNote: "下請けからの返信を待っています。",
} as const;

/** ロード中を流す秒数。D4 と、その検査が同じ値を見る。 */
export const SENT_LOADING_SECONDS = 3;

/** D5 受信しました（デモ）。 */
export const RECEIVED_TEXT = {
  heading: "受信しました（デモ）",
  description: "下請けから見積もりが届きました。",
  toQuotes: "見積もりを見る",
} as const;

/** D6 見積もり書類（1社ずつ）。明細1行ごとに採用・保留。画面が移るのは「一覧へ」だけ。 */
export const QUOTE_DOCUMENT_TEXT = {
  headingSuffix: "の見積もり",
  description:
    "工事ごとに「採用」か「保留」を選んでください。保留にしたものは、あとで採用に変えられます。",
  adopt: "採用",
  hold: "保留",
  toList: "一覧へ",
  markFailed: "選べませんでした。もう一度お試しください。",
  notFound: "この見積もりは見つかりません。",
} as const;

/** D7 下請け見積もり一覧（案件ごと）。 */
export const QUOTE_LIST_TEXT = {
  heading: "下請けの見積もり一覧",
  description: "採用したものは、そのまま見積書に入ります。",
  adoptedMark: "採用",
  holdMark: "保留",
  unmarked: "未選択",
  empty: "まだ見積もりが届いていません。",
  open: "見積もりを見る",
  /** D7 → D9。押すと見積書PDFが降りてくる（利用者の指示 2026-08-07）。 */
  toPdf: "見積書を出す",
} as const;

/** D8 下書き保存フォルダ。 */
export const DRAFTS_TEXT = {
  heading: "下書き保存フォルダ",
  description: "まだ下請けに出していないものです。続きから直せます。",
  empty: "下書きはありません。",
  resume: "続きから",
} as const;
