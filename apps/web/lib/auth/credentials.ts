// 利用者の照合。デモの間は環境変数に置いた1アカウントだけを認める。
//
// 本番では Supabase Auth に置き換える。差し替えるのはこのファイルだけで、
// 呼び出し側（app/login）は verifyCredentials の呼び方しか知らない。

import { timingSafeEqualString } from "./compare";

/**
 * メールアドレスとパスワードを照合する。
 * 合っていれば利用者の識別子、合っていなければ null を返す。
 * どちらが違うかは返さない（アカウントの存在を外に漏らさない）。
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  const expectedEmail = process.env.DEMO_USER_EMAIL;
  const expectedPassword = process.env.DEMO_USER_PASSWORD;

  if (!expectedEmail || !expectedPassword) {
    throw new Error(
      "DEMO_USER_EMAIL / DEMO_USER_PASSWORD が未設定です。apps/web/.env.example を参照してください。",
    );
  }

  const normalizedInput = email.trim().toLowerCase();
  const normalizedExpected = expectedEmail.trim().toLowerCase();

  // 早期 return にすると「メールだけ合っていた」ことが応答時間から分かる。両方必ず比べる。
  const [emailMatches, passwordMatches] = await Promise.all([
    timingSafeEqualString(normalizedInput, normalizedExpected),
    timingSafeEqualString(password, expectedPassword),
  ]);

  if (!emailMatches || !passwordMatches) return null;
  return normalizedExpected;
}
