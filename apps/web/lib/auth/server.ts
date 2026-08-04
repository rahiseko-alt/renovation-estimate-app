// サーバーコンポーネントから今の利用者を読む入口。
// next/headers を使うため middleware からは呼べない。middleware は session.ts を直接使う。

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, readSessionValue } from "./session";

/** ログイン済みなら利用者の識別子、そうでなければ null。 */
export async function getCurrentUser(): Promise<string | null> {
  const store = await cookies();
  return readSessionValue(store.get(SESSION_COOKIE_NAME)?.value);
}
