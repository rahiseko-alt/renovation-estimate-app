// 見積エディタの入力欄（文字列）の妥当性判定。
// 数量・単価・諸経費率はどれも「数字として読めるか」を同じ規則で判定するので、
// ここに1箇所だけ置く（AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
//
// 空欄・非数値の入力を計算・保存から無言で外すと、利用者が気付かないまま
// その行や値が消える（CodeRabbit の指摘）。判定はここに集約し、呼び出し側
// （EstimateEditor）は判定結果を必ず画面に出す。
// 単体テストで検証できるよう、React のレンダリングから切り離した純粋関数にしている。

export function isValidNumberInput(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}
