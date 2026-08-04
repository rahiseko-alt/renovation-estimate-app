// 仮の永続化層。Supabase 接続が済むまでの間に合わせで、サーバープロセスの
// メモリに置くだけ（再起動・再デプロイで消える。本番運用には使わない）。
// 差し替えるときは lib/db/ 配下だけを書き換えればよい
// （AGENTS.md「結合を増やさない」3：他機能は公開された呼び出し方だけを通す）。

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
