// 比較時間が中身に依存しない突き合わせ。
// 署名の検証とパスワードの照合の両方が使うので、1箇所に置く
// （AGENTS.md「結合を増やさない」1：同じ処理を2箇所に書かない）。

/** 長さと内容の両方を、比較時間が中身に依存しない形で比べる。 */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * 文字列を突き合わせる。
 * 長さの違いが早期 return で漏れないよう、いったん固定長のハッシュにしてから比べる。
 */
export async function timingSafeEqualString(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashedA, hashedB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(hashedA), new Uint8Array(hashedB));
}
