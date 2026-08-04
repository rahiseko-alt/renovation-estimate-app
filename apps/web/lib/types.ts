export type TransactionType = "income" | "expense";

/** 手入力された1件の収入・支出。 */
export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  amount: number; // 円（正の数）
  memo: string;
}

/** 毎日の固定支出（ユーザーが入力する。AI判定の対象外）。 */
export interface FixedDailyExpense {
  id: string;
  amount: number;
  memo: string;
}

/** 履歴から自動検出された毎月定額の収入・支出。 */
export interface RecurringRule {
  type: TransactionType;
  dayOfMonth: number; // 1-31
  amount: number;
  memo: string;
}

/** グラフの縦軸目盛り。nullは自動（データから計算）を意味する。 */
export interface ChartAxisConfig {
  top: number | null;
  middle: number | null;
  bottom: number | null;
}

export interface AppData {
  startingBalance: number;
  selectedDate: string; // YYYY-MM-DD（残高予測の対象日。選び直さなくても固定される）
  transactions: Transaction[];
  fixedDailyExpenses: FixedDailyExpense[];
  chartAxis: ChartAxisConfig;
}
