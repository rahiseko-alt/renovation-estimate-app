// Supabase の結果を「失敗なら例外」に変える共通の入口。
//
// 半分だけ書き込まれた状態を「成功」と見せないために、lib/db/ の中で結果を
// 素通しせずここを通す（AGENTS.md「結合を増やさない」1：同じ処理を2箇所に書かない）。

/** エラーを握りつぶさない。何の操作で失敗したかを付けて投げ直す。 */
export function must<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : String((result.error as { message?: string })?.message ?? result.error);
    throw new Error(`${what} に失敗: ${message}`);
  }
  return result.data;
}
