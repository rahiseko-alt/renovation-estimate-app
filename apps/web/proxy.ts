import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, readSessionValue } from "./lib/auth/session";
import { buildContentSecurityPolicy, createNonce } from "./lib/security/csp";

/**
 * ログインを要求する範囲。ここ1箇所にだけ書く。
 * トップページとログイン画面は誰でも開ける。下請の回答画面 /q/[token] は
 * 相手にログインさせないので、ここには入れない。
 */
const PROTECTED_PREFIXES = ["/projects", "/estimates", "/masters"];

/**
 * 画面の応答すべてを通す。CSP をリクエストごとの nonce 付きで付けるため、
 * 守る範囲より広く動かす必要がある。静的ファイルは除く。
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-icon.png|sw.js|manifest.webmanifest).*)",
  ],
};

function requiresLogin(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);

  // Next.js は受け取ったリクエストヘッダの nonce を、自分が差し込むスクリプトに付ける。
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  if (requiresLogin(request.nextUrl.pathname)) {
    const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!(await readSessionValue(session))) {
      // 元の行き先を覚えておき、ログイン後にそこへ戻す。
      const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", next);
      const redirect = NextResponse.redirect(url);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}
