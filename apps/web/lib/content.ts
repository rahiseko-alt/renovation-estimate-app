// 共通の文言・値の置き場所（AGENTS.md「コマンド」欄が指すファイル）。
// 画面に出る文言と、複数箇所から参照される定数はここに1つだけ書く
// （AGENTS.md「結合を増やさない」1：同じ値・同じ文言を2箇所以上に書かない）。
//
// 注意：CI の起動スモーク（.github/workflows/ci.yml / prod-smoke.yml）は
// HOME_HEADING の値をリテラルで grep している。値を変えるときは両ワークフローも直す。

/** サイト共通のメタ情報（app/layout.tsx が参照）。 */
export const SITE = {
  title: "家計簿くん",
  description: "家計簿アプリ",
} as const;

/** トップページの見出し。CI スモークのマーカーでもある。 */
export const HOME_HEADING = "家計簿くん";

/** トップページの説明文。 */
export const HOME_DESCRIPTION = "この先の残高をいつでも予測できます。";

export const HOME_TEXT = {
  forecastHeadingPrefix: "Balance on ",
  dateLabel: "予測日",
  changeDateSuffix: "を変更",
  balanceLabelToday: "現在の残高",
  balanceLabelFuture: "予測残高",
  shortfallNoteToday: "残高が不足しています",
  shortfallNoteFuture: "残高が不足する見込みです",
  currentBalancePrefix: "現在の残高：",
  currentShortfallPrefix: "現在の残高（不足）：",
  currentBalanceSuffix: "円",
  chartHeading: "残高の推移",
  chartShortfallSuffix: "（不足）",
  chartTodayLabel: "今日",
  chartCrossingIntoShortfall: "から不足",
  chartTapHint: "タップすると、その日の残高が分かります",
} as const;

export const AXIS_EDIT_TEXT = {
  headingTop: "上端の目盛りを変更",
  headingMiddle: "中間の目盛りを変更",
  headingBottom: "下端の目盛りを変更",
  inputLabel: "金額（円）",
  invalidNumber: "数字を入力してください",
  applyButton: "反映",
  cancelButton: "キャンセル",
  resetButton: "自動に戻す",
} as const;

export const DEMO_TEXT = {
  loadLabel: "サンプルデータを試す",
  replaceLabel: "サンプルデータに置き換える",
  confirmReplace: "現在の記録をサンプルデータに置き換えます。よろしいですか？",
} as const;

export const CALENDAR_TEXT = {
  prevMonth: "前の月",
  nextMonth: "次の月",
  select: "この日を選択",
  close: "閉じる",
} as const;

export const DETAIL_TEXT = {
  expenseListHeading: "out",
  incomeListHeading: "in",
  emptyExpense: "記録がありません",
  emptyIncome: "記録がありません",
  entryFormHeading: "記録を追加",
  recordsListHeading: "記録を見る",
  dateLabel: "日付",
  typeIncome: "in",
  typeExpense: "out",
  amountLabel: "金額",
  amountError: "金額を入力してください",
  memoLabel: "メモ",
  addButton: "記録する",
  deleteButton: "削除",
  fixedDailyHeading: "毎日の固定費",
  fixedDailyEmpty: "記録がありません",
  fixedDailyAmountLabel: "1日あたりの金額",
  fixedDailyAddButton: "追加",
  recurringHeading: "毎月の固定収支",
  recurringEmptyMain: "検出された固定収支はありません",
  recurringEmptyNote: "同じ日・同じ金額の記録が2か月続くと自動で表示されます",
  recurringExpenseLabel: "fixed out",
  recurringIncomeLabel: "fixed in",
  fixedTabLabel: "fixed",
} as const;
