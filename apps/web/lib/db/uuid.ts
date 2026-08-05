// ID の形式チェック。projects / price_master_items の主キーは Postgres の uuid 型なので、
// 形の違う文字列（"no-such-id" 等）をそのままクエリに渡すと「該当なし」ではなく
// クエリ自体がエラーになる。IDOR対策の「他人のIDを渡しても何も起きない（null / false を返す）」
// という既存の契約を保つため、クエリの前にここで弾く
// （AGENTS.md「結合を増やさない」1：同じ処理を2箇所以上に書かない）。

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
