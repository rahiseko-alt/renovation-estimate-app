// 共通の文言・値の置き場所（AGENTS.md「コマンド」欄が指すファイル）。
// 画面に出る文言と、複数箇所から参照される定数はここに1つだけ書く
// （AGENTS.md「結合を増やさない」1：同じ値・同じ文言を2箇所以上に書かない）。
//
// 注意：CI の起動スモーク（.github/workflows/ci.yml / prod-smoke.yml）は
// HOME_HEADING の値をリテラルで grep している。値を変えるときは両ワークフローも直す。

import { MAX_PROJECTS_PER_OWNER } from "./limits";

/** サイト共通のメタ情報（app/layout.tsx が参照）。 */
export const SITE = {
  title: "リフォーム見積",
  description: "現場の写真から、下請への依頼まで通してリフォームの見積を作る。",
} as const;

/** トップページの見出し。CI スモークのマーカーでもある。 */
export const HOME_HEADING = "リフォーム見積";

/**
 * トップページの説明文。看板にしている3つの接続をそのまま言う
 * （`docs/design.md` 2章「図面の無い現場で、撮った写真がそのまま複数社への
 * 見積依頼になる」）。**比べるところまで言う**：複数社への同時依頼が主眼で、
 * 1社に出して終わりではない。
 */
export const HOME_DESCRIPTION =
  "現場で撮る、複数の下請にまとめて頼む、返ってきた見積を比べる。";

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
  /** 上限に達したときの文言。lib/db/projects.ts が投げる例外の文面でもある。 */
  failedLimit: `案件は${MAX_PROJECTS_PER_OWNER}件までしか登録できません。`,
} as const;

/** 案件詳細画面の文言。 */
export const PROJECT_DETAIL_TEXT = {
  estimateLink: "見積をつくる",
  /**
   * 新設計の導線（法定項目を埋める → 依頼を出す → 比較して採用する）。
   * 法定項目へのリンクは送信画面からも出すので、文言は LEGAL_ITEMS_LINK_LABEL が持つ。
   */
  sendLink: "見積依頼を出す",
  comparisonLink: "見積を比較する",
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
  /**
   * 画面編集用の列の見出し。協議会様式には無い列なのでここが持つ
   * （様式にある列の見出しは lib/doc/templates/estimate.ts）。
   */
  columnKind: "種別",
  columnTaxCategory: "税区分",
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
 * トップページに並べる行き先（`docs/design.md` 7章「行き先を選ぶだけの画面」）。
 *
 * **「作業の流れ」ではなく「行き先」を並べる。** 以前はここに4ステップ
 * （写真を撮る／明細をつくる／下請に頼む／見積書を出す）を置いていたが、
 * 4つとも `/projects` を指していて、押しても行き先が変わらなかった。
 * そのうえ作り直し後に増えた法定項目・下請台帳・会社設定・比較表が1つも出てこず、
 * 旧設計の画面がそのまま残っている状態だった。
 *
 * 写真・数量・法定項目・依頼・比較は、どれも**案件を選んでから**始まる。
 * ここに並べるのは、案件を選ばずに行ける入口だけにする。
 * 行き先が重複していないことは `tests/home.test.tsx` が検査する。
 */
export const HOME_DESTINATIONS = [
  {
    href: "/projects",
    label: "案件",
    description:
      "現場を選んで、写真と数量、法定項目、依頼、見積の比較まで進みます。",
  },
  {
    href: "/subcontractors",
    label: "下請台帳",
    description: "見積依頼の送り先。ここに登録した会社から選びます。",
  },
  {
    href: "/settings/company",
    label: "会社設定",
    description:
      "請負者名と、法定項目の定型文の初期値。最初に1回入れておきます。",
  },
] as const;

/**
 * トップ画面の右上にある、開発者向けの引き出し。
 *
 * **商談で見せる相手には要らないものを、ここに全部しまう。**
 * トップに案件一覧やログインを並べると、デモを見せる相手がそちらを押して迷う。
 * ログイン状態で出し分ける形は採らない（デモの入口が消える事故が起きた。
 * `docs/failures.md` 2026-08-06）。
 */
export const DEVELOPER_PANEL_TEXT = {
  open: "開発者向け",
  description: "この先は作る側が使う画面です。商談では開きません。",
} as const;

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

/*
 * 紙に印字される文言（見積書の集計欄・明細の列見出し・ヘッダ/フッタ・既定の費目名）は
 * ここに置かない。**テンプレート側（lib/doc/templates/）が持つ**
 * （docs/design.md 7章「文言の住所を1つに決める規則」）。
 * 依存の向きは固定する：テンプレートは content.ts を import しない。
 * content.ts はテンプレートを import しない。描画器だけが両方を知る。
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

/**
 * 書類の中に置く「箇所」と、その箇所に決まっている工事項目名・単位。
 *
 * 見積依頼書では大分類の見出し行に相当し、写真枠と明細行がここにぶら下がる
 * （docs/design.md 5章「写真をどこに入れるか」）。箇所が決まれば工事項目名と単位も
 * 決まるため、現場では打たせない（docs/design.md 4章の「基本的に決まっている」側）。
 *
 * 工事項目名と単位の割り当ては**こちらの裁量**で決めたもので、業界の定めではない。
 * 実務者レビュー（docs/design.md 8章）で見直す前提の初期値として扱う。
 *
 * **並び順は、単位が「式」でない箇所を先に置く。** 先頭が写真を撮るときの初期値
 * （DEFAULT_PHOTO_AREA）になるため、ここが「式」だと、何も選ばずに撮った写真が
 * 数量の要らない箇所に付く。この製品が現場で打たせるのは数量だけなので、
 * 既定はその数量が意味を持つ箇所にする。**単位そのものは変えない**
 * （どの箇所が「式」かは実務者レビューでしか決められない層）。
 */
export const WORK_AREAS = [
  { area: "内装", itemName: "内装工事", unit: "㎡" },
  { area: "外壁", itemName: "外壁工事", unit: "㎡" },
  { area: "屋根", itemName: "屋根工事", unit: "㎡" },
  { area: "キッチン", itemName: "キッチン工事", unit: "式" },
  { area: "浴室", itemName: "浴室工事", unit: "式" },
  { area: "洗面", itemName: "洗面工事", unit: "式" },
  { area: "トイレ", itemName: "トイレ工事", unit: "式" },
  { area: "その他", itemName: "その他工事", unit: "式" },
] as const;

export type WorkArea = (typeof WORK_AREAS)[number];

/**
 * 写真を撮るときに選ぶ箇所の名前だけを取り出したもの。
 * 写真テーブルが持つのは箇所の名前だけなので、検証・表示はこちらを使う
 * （値の置き場所は WORK_AREAS に一本化する）。
 */
export const PHOTO_AREAS = WORK_AREAS.map((entry) => entry.area);

/** 箇所を選ばせるときの初期値。WORK_AREAS の先頭を正とする。 */
export const DEFAULT_PHOTO_AREA: string = WORK_AREAS[0].area;

/** 箇所の名前から、決まっている工事項目名と単位を引く。知らない箇所なら null。 */
export function findWorkArea(area: string): WorkArea | null {
  return WORK_AREAS.find((entry) => entry.area === area) ?? null;
}

/**
 * 法定①工事名称（docs/design.md 3章）の初期値を、現場住所から組み立てる。
 * projects.work_name の既定値として使う。画面上で直せる
 * （docs/design.md 7章「自動で埋めた項目も、画面に出す」）。
 *
 * 施主名からは組み立てない。工事名称は法定②施工場所と同じく下請に見せる項目だが、
 * 施主名は法定8項目に含まれず見せない（docs/design.md 7章「下請に見せるもの・
 * 見せないもの」）。「〇〇様邸」という業界の命名慣行（5章の実物調査でも確認）を
 * 初期値にすると、見せない項目のはずの施主名が工事名称という見せる項目に紛れ込み、
 * 下請への投影から漏れてしまう。現場住所（＝もともと見せる情報）から組み立てる。
 */
export function buildDefaultWorkName(siteAddress: string): string {
  return `${siteAddress} リフォーム工事`;
}

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

/**
 * 掛率として扱う最大の大きさ。lib/calc.ts の sellingUnitPrice（掛率の妥当性検証）と、
 * QuoteRequestButton（クライアント側の検証・文言の両方）が参照する。
 * calc.ts は content.ts を import している（TAX_RATES）ため、循環importを避けて
 * 値をここに1箇所だけ持ち、calc.ts 側は re-export する
 * （AGENTS.md「結合を増やさない」1：同じ値を2箇所以上に書かない）。
 */
export const MAX_MARKUP_RATE = 1_000_000;

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
  invalidMarkupRate: `掛率を数字で入力してください（0以上${MAX_MARKUP_RATE.toLocaleString("ja-JP")}以下）。`,
  failed: "依頼の作成に失敗しました。もう一度お試しください。",
  /** リンク発行後に出す説明・ボタン。 */
  linkReady: "このリンクを下請に送ってください。",
  copyButton: "リンクをコピー",
  copied: "コピーしました。",
  copyFailed: "コピーできませんでした。リンクを長押しして手動でコピーしてください。",
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


// 登録件数の上限は lib/limits.ts が1つだけ持つ（文言とデータアクセスの両方が参照するため。
// 理由はあちらのファイル冒頭）。値を引く入口はこのファイルのままにするため re-export する。
export {
  FAILED_LIMIT,
  MAX_PROJECTS_PER_OWNER,
  MAX_SUBCONTRACTORS_PER_OWNER,
} from "./limits";

// 新設計の画面（依頼グループ・下請の回答・比較表と採用・書類画面）の文言は
// lib/quoteFlowText.ts が持つ。文言の入口はこのファイルのままにするため re-export する
// （AGENTS.md「結合を増やさない」2：同じものを引く入口は1つにする）。
export {
  COMPANY_PROFILE_TEXT,
  COMPARISON_TEXT,
  LEGAL_ITEM_SLOT_LABELS,
  LEGAL_ITEMS_LINK_LABEL,
  LEGAL_ITEMS_TEXT,
  QUOTE_GROUP_RESPONSE_TEXT,
  SEND_REQUEST_TEXT,
  SITE_CONDITION_LABELS,
  SPIKE_TEXT,
  SUBCONTRACTORS_TEXT,
} from "./quoteFlowText";

// デモの画面の並び D3〜D8（docs/flows.md）の文言は lib/flowText.ts が持つ。
// 同じ理由で re-export する。
export {
  DOCUMENT_CONFIRM_TEXT,
  DRAFTS_TEXT,
  QUOTE_DOCUMENT_TEXT,
  QUOTE_LIST_TEXT,
  RECEIVED_TEXT,
  SENT_LOADING_SECONDS,
  SENT_TEXT,
} from "./flowText";
