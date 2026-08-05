// 共通の文言・値の置き場所（AGENTS.md「コマンド」欄が指すファイル）。
// 画面に出る文言と、複数箇所から参照される定数はここに1つだけ書く
// （AGENTS.md「結合を増やさない」1：同じ値・同じ文言を2箇所以上に書かない）。
//
// 注意：CI の起動スモーク（.github/workflows/ci.yml / prod-smoke.yml）は
// HOME_HEADING の値をリテラルで grep している。値を変えるときは両ワークフローも直す。

/** サイト共通のメタ情報（app/layout.tsx が参照）。 */
export const SITE = {
  title: "リフォーム見積",
  description: "現場の写真から、下請への依頼まで通してリフォームの見積を作る。",
} as const;

/** トップページの見出し。CI スモークのマーカーでもある。 */
export const HOME_HEADING = "リフォーム見積";

/** トップページの説明文。 */
export const HOME_DESCRIPTION =
  "現場で撮る、明細を作る、下請に頼む、見積を出す。";

/** オフライン画面の文言。ログイン状態を問わない共通の文言のみ置く。 */
export const OFFLINE_TEXT = {
  heading: "オフラインです",
  body: "電波の届く場所で開き直してください。",
} as const;

/** 案件一覧の文言。 */
export const PROJECTS_TEXT = {
  heading: "案件",
  empty: "案件はまだありません。",
  back: "もどる",
  newProject: "新しい案件",
} as const;

/** 案件を新規登録する画面の文言。 */
export const NEW_PROJECT_TEXT = {
  heading: "新しい案件",
  customerNameLabel: "施主名",
  siteAddressLabel: "現場住所",
  submit: "登録する",
  failed: "施主名と現場住所の両方を入力してください。",
} as const;

/** 案件詳細画面の文言。 */
export const PROJECT_DETAIL_TEXT = {
  estimateLink: "見積をつくる",
  pdfLink: "見積書PDFを出力",
  pdfGenerating: "作成中…",
} as const;

/** 見積エディタの文言。 */
export const ESTIMATE_EDITOR_TEXT = {
  heading: "見積",
  addLine: "明細を追加",
  deleteLine: "削除",
  save: "保存する",
  saved: "保存しました。",
  kindItem: "工事",
  kindDiscount: "値引き",
  overheadRateLabel: "諸経費率（%）",
  /** 数量・単価・諸経費率の1マスに出す短い注意（フィールド直下）。 */
  invalidNumberField: "数字を入力してください。",
  /** 保存できない理由として合計欄の位置に出す説明。 */
  invalidNumberSummary:
    "数字になっていない入力があります。数量・単価・諸経費率を確認してください。",
} as const;

/** ログイン画面の文言。 */
export const AUTH_TEXT = {
  heading: "ログイン",
  emailLabel: "メールアドレス",
  passwordLabel: "パスワード",
  submit: "ログインする",
  logout: "ログアウト",
  /** どちらが違うかは書かない（アカウントの有無を外に漏らさない）。 */
  failed: "メールアドレスかパスワードが違います。",
  note: "アカウントはこちらで用意します。ご自身で登録する画面はありません。",
} as const;

/**
 * トップページに並べる作業の流れ。
 * 中身を作る前に入口から出口までを1回通すため、行き先だけ先に置いている
 * （AGENTS.md「実装の進め方」）。
 */
export const HOME_STEPS = [
  {
    href: "/projects",
    label: "現場の写真を撮る",
    description: "案件を選んで、直す場所を撮ります。",
  },
  {
    href: "/projects",
    label: "見積の明細をつくる",
    description: "いつもの工事項目から選んで、数量を入れます。",
  },
  {
    href: "/projects",
    label: "下請に単価を頼む",
    description: "リンクを渡すだけ。相手のログインは要りません。",
  },
  {
    href: "/projects",
    label: "見積書を出す",
    description: "そのまま印刷できる形で出ます。",
  },
] as const;

/**
 * 消費税率。lib/calc.ts の計算と、画面・PDF の税率表示の両方が参照する。
 * 税区分ごとに小計してから税額を出す（伝票単位で1回だけ端数処理する）。
 */
export const TAX_RATES = {
  /** 標準税率。リフォーム工事は原則こちら。 */
  standard: 0.1,
  /** 軽減税率。工事では通常使わないが、区分を持てる形にしておく。 */
  reduced: 0.08,
  /** 不課税・非課税。 */
  exempt: 0,
} as const;

/** 税区分の画面表示名。 */
export const TAX_CATEGORY_LABELS = {
  standard: "標準 10%",
  reduced: "軽減 8%",
  exempt: "非課税",
} as const;

/**
 * 見積書の集計欄の文言。
 * 住宅リフォーム推進協議会「住宅リフォーム工事 御見積書」書式Ⅳ-1 の印字に合わせている。
 * https://www.j-reform.com/publish/pdf_shosiki/mitumori.pdf
 * 画面・PDF の両方がここを参照する。勝手に言い換えない。
 */
export const ESTIMATE_TOTALS_TEXT = {
  directCostSubtotal: "直接工事費 小計",
  overhead: "諸経費",
  subtotalBeforeDiscount: "小計",
  discount: "値引き",
  netAmount: "工事価格 （税抜き）",
  tax: "取引に係る消費税等",
  grandTotal: "合計 （税込）",
} as const;

/**
 * 見積明細の列見出し。
 * 協議会様式は「工事項目／摘要（仕様）／（単価・数量・時間 等）／金額」の4列だが、
 * 金額を計算可能にするため 3列目を 数量／単位／単価 に分解している。
 */
export const ESTIMATE_COLUMNS = {
  /** 見積エディタの明細行だけが持つ列（協議会様式の4列には無い）。 */
  kind: "種別",
  name: "工事項目",
  spec: "摘要（仕様）",
  quantity: "数量",
  unit: "単位",
  unitPrice: "単価",
  taxCategory: "税区分",
  amount: "金額",
} as const;

/**
 * 見積書のヘッダー・フッターの文言。協議会様式の印字に合わせている。
 */
export const ESTIMATE_DOCUMENT_TEXT = {
  title: "御見積書",
  recipientSuffix: "様",
  issuedAtLabel: "作成日",
  validUntilPrefix: "本見積書の有効期限は、",
  validUntilSuffix: "までとさせていただきます。",
  attachmentNote:
    "■添付書類：見積内容を補足するため、打ち合わせシートは必ず添付します。",
  keepNote: "※ この書類は大切に保管してください。",
} as const;

/**
 * 明細の末尾に既定で立てる費目。
 * 協議会様式では明細最終行に印字済みで、立て忘れを防ぐ設計になっている。
 */
export const DEFAULT_DISPOSAL_ITEM_NAME = "解体・廃棄物処理費";

/**
 * 単位の選択肢。リフォームの見積で実際に使われるもの。
 * 「式」は実務で必須だが、公的機関（住まいるダイヤル・消費生活センター）が
 * 内訳の分からなさを繰り返し注意喚起しているため、画面では摘要の記入を促す。
 */
export const UNITS = [
  "式",
  "㎡",
  "m",
  "立米",
  "箇所",
  "人工",
  "台",
  "枚",
  "本",
  "缶",
  "袋",
  "束",
  "セット",
  "日",
] as const;

/** 「式」を選んだときに摘要の記入を促す文言。 */
export const LUMP_SUM_SPEC_HINT =
  "「式」は内訳が分かりません。摘要に何をいくつ行うか書いてください。";

/** 諸経費の入力欄まわりの文言。 */
export const OVERHEAD_TEXT = {
  label: "諸経費",
  rateLabel: "率（%）",
  /**
   * 既定値を持たない理由の説明。調査した出典では 5〜10% / 8〜22% / 30%超 と割れており、
   * 業界標準と呼べる率が存在しない。だからこの欄は必ず人が入れる。
   */
  noDefaultNote: "率は案件ごとに入力してください（業界標準の率はありません）。",
} as const;

/** 単価マスタ画面の文言。 */
export const PRICE_MASTER_TEXT = {
  heading: "単価マスタ",
  empty: "単価マスタはまだありません。",
  newItem: "新しい単価を登録",
  back: "もどる",
  nameLabel: "工事項目",
  specLabel: "摘要（仕様）",
  unitLabel: "単位",
  unitPriceLabel: "単価（材工共・円）",
  taxCategoryLabel: "税区分",
  submit: "登録する",
  delete: "削除",
  failed: "工事項目と単価（整数）を入力してください。",
  /** 見積エディタ側で、単価マスタから明細を追加するときの文言。 */
  addFromMasterLabel: "単価マスタから追加",
  addFromMasterPlaceholder: "選んでください",
  addFromMasterButton: "追加",
  addFromMasterEmpty: "単価マスタが空です。先に登録してください。",
} as const;

/** 写真を撮るときに選ぶ箇所。これが無いと明細への自動紐づけができない。 */
export const PHOTO_AREAS = [
  "キッチン",
  "浴室",
  "洗面",
  "トイレ",
  "内装",
  "外壁",
  "屋根",
  "その他",
] as const;

/**
 * 写真アップロードの上限（元ファイル、MB）。lib/photo/compress.ts（クライアント側の
 * 事前チェック）と app/projects/[id]/photos-actions.ts（Server Action 側の検証。
 * クライアントの検証はバイパスできるため、ここでも同じ値で確かめる）の両方から
 * 参照する（AGENTS.md「結合を増やさない」1：同じ値を2箇所以上に書かない）。
 */
export const PHOTO_MAX_UPLOAD_MB = 20;

/**
 * 写真の表示用に発行する署名付きURLの有効秒数。
 * app/projects/[id]/page.tsx（一覧表示）と photos-actions.ts（アップロード直後の表示）
 * の両方から参照する。
 */
export const PHOTO_SIGNED_URL_EXPIRES_SECONDS = 300;

/** アップロードを受け付ける画像の種類。photos-actions.ts の検証で使う。 */
export const PHOTO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 見積エディタで、明細1行から下請への依頼を作るときの文言。 */
export const QUOTE_REQUEST_FORM_TEXT = {
  /** 明細行に出す、依頼フォームを開くボタン。 */
  openButton: "下請に単価を頼む",
  markupRateLabel: "掛率",
  markupRateHint:
    "下請から届いた原価単価にこの倍率を掛けて、見積の単価にします（例: 1.25）。",
  submit: "リンクを発行する",
  submitting: "発行中…",
  cancel: "やめる",
  invalidMarkupRate: "掛率を数字で入力してください（0以上）。",
  failed: "依頼の作成に失敗しました。もう一度お試しください。",
  /** リンク発行後に出す説明・ボタン。 */
  linkReady: "このリンクを下請に送ってください。",
  copyButton: "リンクをコピー",
  copied: "コピーしました。",
} as const;

/** 見積エディタの下請への依頼一覧の文言。 */
export const QUOTE_REQUESTS_LIST_TEXT = {
  heading: "下請への依頼",
  empty: "依頼はまだありません。",
  itemLabel: "工事項目",
  quantityLabel: "数量",
  statusLabels: {
    pending: "回答待ち",
    responded: "回答あり",
    imported: "取り込み済み",
  } as const,
  costUnitPriceLabel: "原価単価",
  markupRateLabel: "掛率",
  sellingUnitPriceLabel: "見積に入る単価",
  importButton: "取り込む",
  importing: "取り込み中…",
  importFailed: "取り込みに失敗しました。もう一度お試しください。",
} as const;

/** 下請の回答画面（/q/[token]。ログイン不要）の文言。 */
export const QUOTE_RESPONSE_TEXT = {
  heading: "単価のご回答",
  description: "下記の工事項目について、原価単価のみご入力ください。",
  itemLabel: "工事項目",
  specLabel: "摘要（仕様）",
  quantityLabel: "数量",
  unitLabel: "単位",
  costUnitPriceLabel: "原価単価（円）",
  submit: "回答する",
  submitting: "送信中…",
  invalidCostUnitPrice: "原価単価を数字で入力してください（0以上）。",
  failed: "送信に失敗しました。もう一度お試しください。",
  thanks: "回答しました。ありがとうございました。",
  alreadyResponded: "この依頼は既に回答済みです。ご協力ありがとうございました。",
  notFound: "この依頼は見つかりません。リンクをご確認ください。",
} as const;

/** 案件詳細画面の写真セクションの文言。 */
export const PHOTO_TEXT = {
  heading: "写真",
  empty: "写真はまだありません。",
  areaLabel: "箇所",
  fileLabel: "写真を撮る・選ぶ",
  uploadButton: "追加する",
  uploading: "追加中…",
  deleteButton: "削除",
  deleting: "削除中…",
  /** ファイル未選択で送信しようとしたとき。 */
  noFileSelected: "写真を選んでください。",
  /** compress.ts の InvalidPhotoTypeError、および photos-actions.ts の種類検証。 */
  invalidType: "画像ファイル（JPEG・PNG・WebP）を選んでください。",
  /** compress.ts の PhotoTooLargeError、および photos-actions.ts のサイズ検証。 */
  tooLarge: `${PHOTO_MAX_UPLOAD_MB}MBを超える写真は追加できません。`,
  uploadFailed: "写真の追加に失敗しました。もう一度お試しください。",
  deleteFailed: "写真の削除に失敗しました。もう一度お試しください。",
} as const;
