// 1人の所有者（owner_id）が登録できる件数の上限。
//
// **ここに置く理由**：この数字は文言（lib/quoteFlowText.ts の SUBCONTRACTORS_TEXT と
// lib/content.ts の NEW_PROJECT_TEXT）とデータアクセス（lib/db/）の両方が参照するが、
// content.ts は quoteFlowText.ts を re-export しているため content.ts に置くと
// quoteFlowText.ts → content.ts の循環importになる（MAX_MARKUP_RATE と同じ事情）。
// 依存を持たないこのファイルに数字を1つだけ置き、content.ts が re-export して
// 値を引く入口は content.ts のままに保つ（AGENTS.md「結合を増やさない」1・2）。

/** 下請台帳に登録できる会社数の上限。 */
export const MAX_SUBCONTRACTORS_PER_OWNER = 100;

/** 登録できる案件数の上限。 */
export const MAX_PROJECTS_PER_OWNER = 100;

/**
 * 上限に達して登録を断ったことを画面へ伝える `?failed=` の値。
 * 既存の `?failed=1`（入力内容が不正）と区別するためだけに使う。
 */
export const FAILED_LIMIT = "limit";
