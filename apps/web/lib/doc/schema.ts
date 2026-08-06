// 書類テンプレートの語彙（型だけ。実装も文言も置かない）。
//
// docs/design.md 7章「書類は差し替え前提」：受注したら顧客がいつも使っている書類に
// 差し替える。だから様式をコードに埋め込まず、テンプレート1ファイルを差し替えれば
// 済む形にする。
//
// **絶対座標を持たせない。** 明細行数・写真の縦横比・定型文の長さで内容量が変わる
// 書類に固定座標は使えない。「上から順に並ぶブロックの列」＋「ブロックごとの
// パラメータ」で表す。

import type { EstimateLine, EstimateTotals } from "../calc";

/**
 * 誰に見せてよい欄か。同じ書類を見るのは元請（掛率・売価・原価を見てよい）と
 * 下請（自社の原価しか見てはいけない）の2者である（docs/design.md 7章
 * 「テンプレートに『誰に見せてよい欄か』の軸を持たせる」）。
 *
 * 省略時は誰に見せてもよい欄として扱う。「見せてはいけない」側を明示させることで、
 * 書き忘れが漏洩ではなく安全側に倒れるようにはしない——むしろ逆に倒れるため、
 * 下請に見せる書類を組むときは必ず audience を渡して絞り込む（renderer 側で強制する）。
 */
export type DocAudience = "contractor" | "subcontractor";

/** 書類に流し込むデータ。テンプレートはこの形だけを知る。 */
export type DocData = {
  /** 法定①工事名称。 */
  workName: string;
  /** 法定②施工場所（現場住所）。 */
  siteAddress: string;
  /** 施主名。法定8項目に含まれないため、下請向けの書類には流さない。 */
  customerName: string;
  /** 見積回答期限。①でだけ使う。 */
  responseDueAt: Date | null;
  /** 作成日。 */
  issuedAt: Date;
  lines: EstimateLine[];
  /** 明細の集計。①（単価が空の依頼書）では null。 */
  totals: EstimateTotals | null;
  /** 明細行のIDごとの写真URL。写真枠に流し込む。 */
  photoUrlByLineId: Record<string, string | null>;
  /** 法定項目の定型文。見出しと本文の対で、決まった順に並べる。 */
  legalItems: { label: string; body: string }[];
};

/** 書類の見出し（1行、中央寄せ）。 */
export type TitleBlock = {
  kind: "title";
  text: string;
};

/** 「ラベル：値」を縦に並べる欄。工事名称・施工場所・作成日など。 */
export type FieldListBlock = {
  kind: "fieldList";
  align: "left" | "right";
  fields: {
    label: string;
    /** データから表示文字列を作る。テンプレート側に計算を持たせない。 */
    value: (data: DocData) => string;
    /** この欄を見せてよい相手。省略時は両方。 */
    audience?: DocAudience;
  }[];
};

/** 罫線付きの節見出し。 */
export type SectionHeadingBlock = {
  kind: "sectionHeading";
  text: string;
};

/** 明細の表。列の並びと見出しをテンプレートが決める。 */
export type LineTableBlock = {
  kind: "lineTable";
  columns: {
    key: LineColumnKey;
    heading: string;
    align: "left" | "right";
    /** 列幅の比。合計に対する割合で解釈する（絶対値ではない）。 */
    widthRatio: number;
    audience?: DocAudience;
  }[];
};

export type LineColumnKey =
  | "name"
  | "spec"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "amount";

/**
 * 写真枠付きの明細ブロック。①見積依頼書で使う。
 * 1箇所につき写真枠は1つ（docs/design.md 5章「1箇所あたり何枚撮るか」）。
 */
export type PhotoLineBlock = {
  kind: "photoLine";
  /** 写真枠の1辺（CSS px）。書類の実寸で指定する。 */
  frameSizePx: number;
  quantityLabel: string;
  emptyQuantityText: string;
};

/** 集計欄（直接工事費小計〜合計）。 */
export type TotalsBlock = {
  kind: "totals";
  rows: {
    label: string;
    amount: (totals: EstimateTotals) => number;
    emphasize?: boolean;
  }[];
};

/** 法定項目の定型文をまとめて出す欄。 */
export type LegalItemsBlock = {
  kind: "legalItems";
  heading: string;
};

/** 注意書き（複数行）。 */
export type NotesBlock = {
  kind: "notes";
  lines: string[];
};

export type DocBlock =
  | TitleBlock
  | FieldListBlock
  | SectionHeadingBlock
  | LineTableBlock
  | PhotoLineBlock
  | TotalsBlock
  | LegalItemsBlock
  | NotesBlock;

/**
 * 書類テンプレート1つぶん。
 *
 * 用紙サイズと余白はここが持つ（今はコード側の lib/pdf/layout.ts に
 * A4縦・40pt決め打ちで埋まっており、差し替え時に2ファイル目を触る原因になっている）。
 */
export type DocTemplate = {
  id: string;
  /** 用紙の実寸（CSS px、96dpi換算）。 */
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  blocks: DocBlock[];
};

/** A4縦の実寸（96dpi換算）。docs/design.md 7章の計算値。 */
export const A4_PORTRAIT = {
  widthPx: 793.7,
  heightPx: 1122.5,
} as const;

/** その相手に見せてよいブロック・欄だけを残す。 */
export function visibleTo(
  audience: DocAudience,
  itemAudience: DocAudience | undefined,
): boolean {
  return itemAudience === undefined || itemAudience === audience;
}
