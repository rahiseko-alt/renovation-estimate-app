// ログイン後に戻す行き先の検証。
//
// proxy.ts が付けた ?next= をそのまま redirect() に渡すとオープンリダイレクトになる
// （"https://evil.example" のような外部URLを渡され、ログイン成功後にそこへ飛ばされる）。
// 「自サイトの絶対パスに見えるが実はホストを指す」形（"//evil.example"、
// "/\evil.example" など）も弾く。

const SAFE_NEXT_PATH = /^\/(?!\/|\\)[^\s]*$/;

/**
 * 行き先として安全なら値をそのまま、そうでなければ既定値の "/" を返す。
 * 「安全かどうか分からない」場合も既定値側に倒す（失敗した時に安全な方を選ぶ）。
 * フォームの値（FormDataEntryValue）にも URL パラメータの値にも使う。
 */
export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string" || value === "") return "/";
  if (!SAFE_NEXT_PATH.test(value)) return "/";
  return value;
}
