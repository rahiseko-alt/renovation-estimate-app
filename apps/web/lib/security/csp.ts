// Content-Security-Policy の組み立て。
// 値をここ1箇所で作り、proxy.ts が付ける（AGENTS.md「結合を増やさない」1）。

/** リクエストごとに使い捨てる nonce を作る。 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * CSP の値を作る。
 *
 * script-src に 'unsafe-inline' を入れない。Next.js が差し込む起動用スクリプトには
 * この nonce が付く。'strict-dynamic' を併記しているので、nonce を持つスクリプトが
 * 読み込む先も許可される。
 *
 * style-src だけは 'unsafe-inline' を許している。Next.js が最初の描画をちらつかせない
 * ために style 属性を使うため。スタイルの注入は script の注入より被害が小さい。
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    // 写真は端末で作った blob と data URL から読む
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // クリックジャッキング対策。X-Frame-Options と同じ意図を CSP でも書く
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
